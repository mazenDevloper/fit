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
 * (or recover) at any key frame; one comes every second, or at once when asked.
 */
final class HwEncoder {
    interface Sink { void onNal(byte[] data, int len, boolean key, long ptsMs); }

    final Sink sink; final int width, height, bitrate;
    private final MediaCodec codec;
    private final Surface input;
    private final HandlerThread thread;
    private byte[] config = new byte[0];
    private volatile boolean running = true;
    private final long t0 = System.nanoTime();

    HwEncoder(int w, int h, int fps, int bps, Sink s) throws Exception {
        sink = s; bitrate = bps;
        width = Math.max(16, w & ~1); height = Math.max(16, h & ~1);
        thread = new HandlerThread("madar-h264", android.os.Process.THREAD_PRIORITY_DISPLAY); thread.start();
        MediaCodec c = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
        try { c.configure(format(width, height, fps, bps, true), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE); }
        catch (Exception first) {
            // some encoders refuse the profile / latency keys, or sizes that are not multiples of 16
            c.release(); c = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
            c.configure(format(width & ~15, height & ~15, fps, bps, false), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        }
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

    private static MediaFormat format(int w, int h, int fps, int bps, boolean extras) {
        MediaFormat f = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h);
        f.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
        f.setInteger(MediaFormat.KEY_BIT_RATE, bps);
        f.setInteger(MediaFormat.KEY_FRAME_RATE, fps);
        f.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1);
        // a still screen keeps sending (the viewer never thinks the picture froze)
        f.setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 100_000L);
        if (extras) {
            f.setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline);   // no B-frames: decode = show order, lowest delay
            f.setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel41);
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
