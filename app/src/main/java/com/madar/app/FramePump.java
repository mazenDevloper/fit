package com.madar.app;

import android.graphics.Bitmap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

/**
 * Turns captured frames into JPEG pictures for the page, smoothly:
 *  - the newest frame wins: while one picture is being compressed, newer frames replace older ones
 *    instead of queueing up (no growing delay),
 *  - compression runs on its own thread so capturing never waits,
 *  - quality adapts to keep the frame rate (busy tablet → slightly lighter pictures, idle → sharper),
 *  - every picture carries its capture time so the receiving side can pace frames evenly.
 */
final class FramePump {
    interface Sink { void onJpeg(byte[] jpeg, long captureMs); }

    volatile int targetQuality = 80;
    volatile long frameMs = 33;

    private final Sink sink;
    private final HandlerThread encThread;
    private final Handler enc;
    private final ByteArrayOutputStream out = new ByteArrayOutputStream(256 * 1024);
    private Bitmap a, b;              // double buffer: one being filled, one being compressed
    private volatile boolean busy;
    private long lastFrame;
    private int quality = 80;
    private double encMs = 10;
    private volatile byte[] last;
    private volatile long lastSent;

    FramePump(String name, Sink sink) {
        this.sink = sink;
        encThread = new HandlerThread(name + "-jpeg", android.os.Process.THREAD_PRIORITY_DISPLAY);
        encThread.start();
        enc = new Handler(encThread.getLooper());
    }

    /** Call from the ImageReader's thread. */
    void onImage(ImageReader r) {
        Image img = null;
        try {
            img = r.acquireLatestImage();
            if (img == null) return;
            long now = SystemClock.uptimeMillis();
            if (busy || now - lastFrame < frameMs) return;   // drop: a newer frame will come
            Image.Plane p = img.getPlanes()[0];
            ByteBuffer buf = p.getBuffer();
            int pixelStride = p.getPixelStride(), rowStride = p.getRowStride();
            int bw = rowStride / pixelStride, w = img.getWidth(), h = img.getHeight();
            if (a == null || a.getWidth() != bw || a.getHeight() != h) { a = Bitmap.createBitmap(bw, h, Bitmap.Config.ARGB_8888); b = null; }
            buf.rewind();
            a.copyPixelsFromBuffer(buf);
            lastFrame = now;
            busy = true;
            final Bitmap frame = a; a = b; b = frame;      // swap buffers
            if (a == null || a.getWidth() != bw || a.getHeight() != h) a = Bitmap.createBitmap(bw, h, Bitmap.Config.ARGB_8888);
            final int cw = w, ch = h; final long ts = now;
            enc.post(() -> encode(frame, cw, ch, ts));
        } catch (Exception ignored) {
        } finally {
            if (img != null) img.close();
        }
    }

    private void encode(Bitmap frame, int w, int h, long ts) {
        try {
            long t0 = SystemClock.uptimeMillis();
            Bitmap src = frame.getWidth() == w ? frame : Bitmap.createBitmap(frame, 0, 0, w, h);
            out.reset();
            src.compress(Bitmap.CompressFormat.JPEG, quality, out);
            if (src != frame) src.recycle();
            byte[] jpeg = out.toByteArray();
            // Adapt quality to hold the frame rate.
            encMs = encMs * 0.8 + (SystemClock.uptimeMillis() - t0) * 0.2;
            if (encMs > frameMs * 0.8 && quality > 55) quality -= 3;
            else if (encMs < frameMs * 0.45 && quality < targetQuality) quality += 1;
            if (quality > targetQuality) quality = targetQuality;
            last = jpeg; lastSent = SystemClock.uptimeMillis();
            sink.onJpeg(jpeg, ts);
        } catch (Exception ignored) {
        } finally {
            busy = false;
        }
    }

    /** Resend the last picture when nothing changes on screen (so new viewers and keyframes keep flowing). */
    void keepAlive(long everyMs) {
        byte[] l = last;
        if (l != null && SystemClock.uptimeMillis() - lastSent >= everyMs) { lastSent = SystemClock.uptimeMillis(); sink.onJpeg(l, lastSent); }
    }

    void setQuality(int q) { targetQuality = Math.max(40, Math.min(95, q)); quality = Math.min(quality, targetQuality); }
    void setFps(int fps) { frameMs = Math.max(16, 1000 / Math.max(5, Math.min(60, fps))); }

    void release() { encThread.quitSafely(); a = null; b = null; last = null; }
}
