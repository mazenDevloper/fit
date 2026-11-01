package com.madar.app;

import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.view.Surface;

import java.nio.ByteBuffer;

/**
 * The smooth path for a shared screen / HDMI card: the tablet's own hardware H.264 encoder, fed straight from the
 * capture surface (no pictures copied, no JPEG, no second encoding in the page). The pieces go to the headset as
 * they are and the iPhone decodes them in hardware too. Every key frame carries SPS/PPS, so a viewer can start
 * (or recover) at any key frame; one comes every 10 s, or at once when asked.
 */
final class HwEncoder {
    interface Sink { void onNal(byte[] data, int len, boolean key, long ptsMs); }

    final Sink sink; final int width, height, bitrate;
    /** H.265 (HEVC): about half the bits of H.264 for the same picture - asked for when every viewer can decode it */
    final boolean hevc;
    private final MediaCodec codec;
    private final Surface input;
    private final HandlerThread thread;
    private byte[] config = new byte[0];
    private volatile boolean running = true;
    private final long t0 = System.nanoTime();

    HwEncoder(int w, int h, int fps, int bps, Sink s) throws Exception { this(w, h, fps, bps, s, false); }

    HwEncoder(int w, int h, int fps, int bps, Sink s, boolean wantHevc) throws Exception {
        sink = s;
        width = Math.max(16, w & ~1); height = Math.max(16, h & ~1);
        thread = new HandlerThread("madar-h26x", android.os.Process.THREAD_PRIORITY_DISPLAY); thread.start();
        MediaCodec c = null;
        boolean hv = false;
        // H.265 only on a hardware encoder (a software one is too slow for a live screen); anything wrong → H.264
        if (wantHevc && hardware(MediaFormat.MIMETYPE_VIDEO_HEVC)) {
            int hb = Math.max(1_500_000, bps * 6 / 10);   // ~60 % of the H.264 rate looks the same
            try {
                c = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_HEVC);
                try { c.configure(format(MediaFormat.MIMETYPE_VIDEO_HEVC, width, height, fps, hb, true), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE); }
                catch (Exception first) { c.release(); c = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_HEVC); c.configure(format(MediaFormat.MIMETYPE_VIDEO_HEVC, width & ~15, height & ~15, fps, hb, false), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE); }
                hv = true; bps = hb;
            } catch (Exception e) { if (c != null) try { c.release(); } catch (Exception ignored) { } c = null; }
        }
        if (c == null) {
            c = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
            try { c.configure(format(MediaFormat.MIMETYPE_VIDEO_AVC, width, height, fps, bps, true), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE); }
            catch (Exception first) {
                // some encoders refuse the profile / latency keys, or sizes that are not multiples of 16
                c.release(); c = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
                c.configure(format(MediaFormat.MIMETYPE_VIDEO_AVC, width & ~15, height & ~15, fps, bps, false), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            }
        }
        hevc = hv; bitrate = bps;
        codec = c;
        input = codec.createInputSurface();
        codec.setCallback(new MediaCodec.Callback() {
            @Override public void onInputBufferAvailable(MediaCodec m, int i) { }
            @Override public void onOutputBufferAvailable(MediaCodec m, int i, MediaCodec.BufferInfo info) {
                if (!running) return;
                try {
                    ByteBuffer b = m.getOutputBuffer(i);
                    if (b != null && info.size > 0) {
                        b.position(info.offset); b.limit(info.offset + info.size);
                        if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) { config = new byte[info.size]; b.get(config); }
                        else {
                            boolean key = (info.flags & MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0;
                            int pre = key ? config.length : 0;
                            byte[] out = new byte[pre + info.size];
                            if (pre > 0) System.arraycopy(config, 0, out, 0, pre);
                            b.get(out, pre, info.size);
                            sink.onNal(out, out.length, key, (System.nanoTime() - t0) / 1_000_000L);
                        }
                    }
                } catch (Exception ignored) { }
                try { m.releaseOutputBuffer(i, false); } catch (Exception ignored) { }
            }
            @Override public void onError(MediaCodec m, MediaCodec.CodecException e) { }
            @Override public void onOutputFormatChanged(MediaCodec m, MediaFormat f) { }
        }, new Handler(thread.getLooper()));
        codec.start();
    }

    /** a hardware encoder for this type exists (Android 10+ says so; before that: not a Google/software one) */
    static boolean hardware(String mime) {
        try {
            for (MediaCodecInfo i : new android.media.MediaCodecList(android.media.MediaCodecList.REGULAR_CODECS).getCodecInfos()) {
                if (!i.isEncoder()) continue;
                boolean has = false;
                for (String t : i.getSupportedTypes()) if (t.equalsIgnoreCase(mime)) has = true;
                if (!has) continue;
                if (Build.VERSION.SDK_INT >= 29) { if (i.isHardwareAccelerated()) return true; }
                else { String n = i.getName().toLowerCase(); if (!n.startsWith("omx.google.") && !n.startsWith("c2.android.")) return true; }
            }
        } catch (Exception ignored) { }
        return false;
    }

    private static MediaFormat format(String mime, int w, int h, int fps, int bps, boolean extras) {
        MediaFormat f = MediaFormat.createVideoFormat(mime, w, h);
        f.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
        f.setInteger(MediaFormat.KEY_BIT_RATE, bps);
        f.setInteger(MediaFormat.KEY_FRAME_RATE, fps);
        // a full picture every 10 s (and at once when a viewer asks): a key frame every second was a burst every
        // second, and the picture hitched once a second on Wi-Fi
        f.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 10);
        // a still screen keeps sending (the viewer never thinks the picture froze)
        f.setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 100_000L);
        if (extras) {
            if (MediaFormat.MIMETYPE_VIDEO_AVC.equals(mime)) {
                f.setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline);   // no B-frames: decode = show order, lowest delay
                f.setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel41);
            } else {
                f.setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.HEVCProfileMain);
                if (Build.VERSION.SDK_INT >= 29) f.setInteger(MediaFormat.KEY_MAX_B_FRAMES, 0);   // show order = decode order
            }
            f.setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR);
            if (Build.VERSION.SDK_INT >= 23) f.setInteger(MediaFormat.KEY_PRIORITY, 0);   // real time
            if (Build.VERSION.SDK_INT >= 30) f.setInteger(MediaFormat.KEY_LATENCY, 1);
        }
        return f;
    }

    Surface surface() { return input; }

    /** a key frame now (a viewer joined, or it lost pieces) */
    void requestKey() {
        try { Bundle b = new Bundle(); b.putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0); codec.setParameters(b); } catch (Exception ignored) { }
    }
    void setBitrate(int bps) {
        try { Bundle b = new Bundle(); b.putInt(MediaCodec.PARAMETER_KEY_VIDEO_BITRATE, bps); codec.setParameters(b); } catch (Exception ignored) { }
    }

    void stop() {
        running = false;
        try { codec.stop(); } catch (Exception ignored) { }
        try { codec.release(); } catch (Exception ignored) { }
        try { input.release(); } catch (Exception ignored) { }
        thread.quitSafely();
    }
}
