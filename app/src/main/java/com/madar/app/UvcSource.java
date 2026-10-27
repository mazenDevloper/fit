package com.madar.app;

import android.content.Context;
import android.hardware.usb.UsbDevice;
import android.os.SystemClock;

import com.herohan.uvcapp.CameraHelper;
import com.herohan.uvcapp.ICameraHelper;
import com.serenegiant.usb.IFrameCallback;
import com.serenegiant.usb.Size;
import com.serenegiant.usb.UVCCamera;

import java.nio.ByteBuffer;
import java.util.List;

/**
 * HDMI capture cards (USB "UVC" video sticks) read directly over USB: Android hides them from the browser's
 * camera list (only the front / back cameras show), so the app opens the card itself and sends its pictures to the
 * page exactly like a shared screen (same JPEG frames, same delay meter, same Madar window).
 * The card sends MJPEG: each frame already is a JPEG - passed on as it is, no re-encoding (fast, cool).
 */
final class UvcSource {
    interface Sink { void onJpeg(byte[] jpeg, long ts); void onUvcState(String s); void onPcm(byte[] pcm, int len); }
    private final Context ctx; private final Sink sink;
    private ICameraHelper helper;
    volatile boolean running;
    private long t0, last;
    private final java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(512 * 1024);
    volatile long minFrameMs = 33;   // 30 fps: enough, lighter for the tablet and the viewer

    UvcSource(Context c, Sink s) { ctx = c.getApplicationContext(); sink = s; }

    void start() {
        if (helper != null) return;
        t0 = SystemClock.uptimeMillis();
        helper = new CameraHelper();
        helper.setStateCallback(new ICameraHelper.StateCallback() {
            @Override public void onAttach(UsbDevice d) { helper.selectDevice(d); }   // asks the USB permission
            @Override public void onDeviceOpen(UsbDevice d, boolean first) {
                // the best MJPEG size up to 1080p, highest frame rate
                Size best = null;
                try {
                    List<Size> list = helper.getSupportedSizeList();
                    for (Size s : list) {
                        if (s.type != UVCCamera.UVC_VS_FRAME_MJPEG || s.height > 1080) continue;
                        if (best == null || s.width * s.height > best.width * best.height || (s.width == best.width && s.fps > best.fps)) best = s;
                    }
                } catch (Exception ignored) { }
                if (best == null) try {
                    for (Size s : helper.getSupportedSizeList()) if (s.height <= 720 && (best == null || s.width * s.height > best.width * best.height)) best = s;
                } catch (Exception ignored) { }
                try { if (best != null) helper.openCamera(best); else helper.openCamera(); } catch (Exception e) { sink.onUvcState("error"); }
            }
            @Override public void onCameraOpen(UsbDevice d) {
                helper.setFrameCallback(frameCb, UVCCamera.PIXEL_FORMAT_RAW);
                helper.startPreview();
                running = true; sink.onUvcState("started");
                startAudio();
            }
            @Override public void onCameraClose(UsbDevice d) { running = false; }
            @Override public void onDeviceClose(UsbDevice d) { }
            @Override public void onDetach(UsbDevice d) { running = false; sink.onUvcState("stopped"); }
            @Override public void onCancel(UsbDevice d) { sink.onUvcState("denied"); }
        });
        // a card already plugged in
        try { List<UsbDevice> l = helper.getDeviceList(); if (l != null && !l.isEmpty()) helper.selectDevice(l.get(0)); else sink.onUvcState("nocard"); } catch (Exception ignored) { }
    }

    private final IFrameCallback frameCb = new IFrameCallback() {
        @Override public void onFrame(ByteBuffer frame) {
            long now = SystemClock.uptimeMillis();
            if (now - last < minFrameMs) return; last = now;
            int n = frame.remaining(); if (n < 100) return;
            byte[] b = new byte[n]; frame.get(b);
            if ((b[0] & 0xff) == 0xFF && (b[1] & 0xff) == 0xD8) { sink.onJpeg(b, now - t0); return; }
            // the card sends raw YUYV (no MJPEG): compress it here
            try {
                Size sz = helper != null ? helper.getPreviewSize() : null; if (sz == null) return;
                if (n < sz.width * sz.height * 2) return;
                android.graphics.YuvImage yi = new android.graphics.YuvImage(b, android.graphics.ImageFormat.YUY2, sz.width, sz.height, null);
                out.reset(); yi.compressToJpeg(new android.graphics.Rect(0, 0, sz.width, sz.height), 72, out);
                sink.onJpeg(out.toByteArray(), now - t0);
            } catch (Exception ignored) { }
        }
    };

    // ---- the card's sound: it is also a USB microphone; recorded from that device only, raw (no voice filters),
    // 48 kHz stereo 16-bit in 40 ms pieces - the same sound path as a shared screen
    private android.media.AudioRecord rec; private Thread recT;
    @android.annotation.SuppressLint("MissingPermission")
    private void startAudio() {
        try {
            android.media.AudioManager am = (android.media.AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            android.media.AudioDeviceInfo usb = null;
            for (android.media.AudioDeviceInfo d : am.getDevices(android.media.AudioManager.GET_DEVICES_INPUTS))
                if (d.getType() == android.media.AudioDeviceInfo.TYPE_USB_DEVICE || d.getType() == android.media.AudioDeviceInfo.TYPE_USB_HEADSET) { usb = d; break; }
            if (usb == null) return;
            int rate = 48000, ch = android.media.AudioFormat.CHANNEL_IN_STEREO, fmt = android.media.AudioFormat.ENCODING_PCM_16BIT;
            int min = android.media.AudioRecord.getMinBufferSize(rate, ch, fmt);
            rec = new android.media.AudioRecord(android.media.MediaRecorder.AudioSource.UNPROCESSED, rate, ch, fmt, Math.max(min, 7680 * 4));
            if (rec.getState() != android.media.AudioRecord.STATE_INITIALIZED) { rec.release(); rec = new android.media.AudioRecord(android.media.MediaRecorder.AudioSource.MIC, rate, ch, fmt, Math.max(min, 7680 * 4)); }
            rec.setPreferredDevice(usb);
            rec.startRecording();
            final android.media.AudioRecord r = rec;
            recT = new Thread(() -> {
                byte[] buf = new byte[7680];   // 40 ms
                while (running && r.getRecordingState() == android.media.AudioRecord.RECORDSTATE_RECORDING) {
                    int n = r.read(buf, 0, buf.length);
                    if (n > 0) sink.onPcm(buf, n);
                }
            }, "uvc-audio");
            recT.start();
        } catch (Exception ignored) { }
    }

    void stop() {
        running = false;
        try { if (rec != null) { rec.stop(); rec.release(); } } catch (Exception ignored) { } rec = null;
        ICameraHelper h = helper; helper = null;
        if (h != null) { try { h.stopPreview(); } catch (Exception ignored) { } try { h.closeCamera(); } catch (Exception ignored) { } try { h.release(); } catch (Exception ignored) { } }
        sink.onUvcState("stopped");
    }
}
