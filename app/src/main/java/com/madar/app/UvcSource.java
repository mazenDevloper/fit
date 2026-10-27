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
    interface Sink { void onJpeg(byte[] jpeg, long ts); void onUvcState(String s); }
    private final Context ctx; private final Sink sink;
    private ICameraHelper helper;
    volatile boolean running;
    private long t0, last;
    volatile long minFrameMs = 16;

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
                try { if (best != null) helper.openCamera(best); else helper.openCamera(); } catch (Exception e) { sink.onUvcState("error"); }
            }
            @Override public void onCameraOpen(UsbDevice d) {
                helper.setFrameCallback(frameCb, UVCCamera.PIXEL_FORMAT_RAW);
                helper.startPreview();
                running = true; sink.onUvcState("started");
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
            if ((b[0] & 0xff) != 0xFF || (b[1] & 0xff) != 0xD8) return;   // not a JPEG (YUYV mode): skip
            sink.onJpeg(b, now - t0);
        }
    };

    void stop() {
        running = false;
        ICameraHelper h = helper; helper = null;
        if (h != null) { try { h.stopPreview(); } catch (Exception ignored) { } try { h.closeCamera(); } catch (Exception ignored) { } try { h.release(); } catch (Exception ignored) { } }
        sink.onUvcState("stopped");
    }
}
