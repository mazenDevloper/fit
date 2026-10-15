package com.madar.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.SystemClock;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

/**
 * Captures this device's screen with MediaProjection and hands JPEG frames (base64) to the page.
 * Runs as a foreground service so sharing continues while other apps are open.
 */
public class CaptureService extends Service {
    interface Listener { void onFrame(String b64); void onState(String state); }

    static final String EXTRA_CODE = "code", EXTRA_DATA = "data", ACTION_STOP = "com.madar.app.STOP";
    static volatile Listener listener;
    static volatile boolean running;

    private static final String CHANNEL = "share";
    private static final int NOTIF_ID = 7;
    private static final int MAX_EDGE = 1280;          // long edge of the shared picture
    private static final long FRAME_MS = 66;            // ~15 fps
    private static final long KEEPALIVE_MS = 1000;      // resend the last frame when the screen is still

    private MediaProjection projection;
    private android.os.PowerManager.WakeLock wake;
    private VirtualDisplay display;
    private ImageReader reader;
    private HandlerThread thread;
    private Handler handler;
    private int width, height, dpi;
    private long lastFrame;
    private String lastB64;
    private Bitmap bitmap;
    private final ByteArrayOutputStream jpeg = new ByteArrayOutputStream(256 * 1024);

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        if (running) return START_NOT_STICKY;

        Notification n = notification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIF_ID, n);
        }

        int code = intent.getIntExtra(EXTRA_CODE, 0);
        Intent data = intent.getParcelableExtra(EXTRA_DATA);
        MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        try {
            projection = mpm.getMediaProjection(code, data);
        } catch (Exception e) {
            projection = null;
        }
        if (projection == null) { notifyState("denied"); stopSelf(); return START_NOT_STICKY; }

        thread = new HandlerThread("madar-capture");
        thread.start();
        handler = new Handler(thread.getLooper());
        // Required before createVirtualDisplay on Android 14+; also tells us when the system stops sharing.
        projection.registerCallback(new MediaProjection.Callback() {
            @Override public void onStop() { stopSelf(); }
        }, handler);

        measure();
        reader = newReader();
        try {
            display = projection.createVirtualDisplay("Madar", width, height, dpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, handler);
        } catch (Exception e) {
            notifyState("denied"); stopSelf(); return START_NOT_STICKY;
        }
        running = true;
        // Keep the tablet's screen on while it is shared (like Smart View): a sleeping or locked
        // screen sends a black picture and can't be operated from the headset.
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
            @SuppressWarnings("deprecation")
            android.os.PowerManager.WakeLock w = pm.newWakeLock(android.os.PowerManager.SCREEN_DIM_WAKE_LOCK
                    | android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP, "madar:share");
            w.acquire(6 * 60 * 60 * 1000L);
            wake = w;
        } catch (Exception ignored) { }
        notifyState("started");
        handler.postDelayed(keepAlive, KEEPALIVE_MS);
        return START_NOT_STICKY;
    }

    private final Runnable keepAlive = new Runnable() {
        @Override public void run() {
            if (!running) return;
            if (lastB64 != null && SystemClock.uptimeMillis() - lastFrame >= KEEPALIVE_MS) send(lastB64);
            handler.postDelayed(this, KEEPALIVE_MS);
        }
    };

    private void measure() {
        WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        int w, h;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Rect b = wm.getMaximumWindowMetrics().getBounds();
            w = b.width(); h = b.height();
        } else {
            DisplayMetrics m = new DisplayMetrics();
            wm.getDefaultDisplay().getRealMetrics(m);
            w = m.widthPixels; h = m.heightPixels;
        }
        float k = Math.min(1f, MAX_EDGE / (float) Math.max(w, h));
        width = Math.max(2, Math.round(w * k) & ~1);
        height = Math.max(2, Math.round(h * k) & ~1);
        dpi = Math.max(120, Math.round(getResources().getDisplayMetrics().densityDpi * k));
    }

    private ImageReader newReader() {
        ImageReader r = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        r.setOnImageAvailableListener(this::onImage, handler);
        return r;
    }

    // The tablet was rotated: resize the capture so the picture keeps its shape.
    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        if (!running || handler == null) return;
        handler.post(() -> {
            int ow = width, oh = height;
            measure();
            if (ow == width && oh == height || display == null) return;
            ImageReader old = reader;
            reader = newReader();
            display.resize(width, height, dpi);
            display.setSurface(reader.getSurface());
            old.close();
            bitmap = null;
        });
    }

    private void onImage(ImageReader r) {
        Image img = null;
        try {
            img = r.acquireLatestImage();
            if (img == null) return;
            long now = SystemClock.uptimeMillis();
            if (now - lastFrame < FRAME_MS) return;
            Image.Plane p = img.getPlanes()[0];
            ByteBuffer buf = p.getBuffer();
            int pixelStride = p.getPixelStride(), rowStride = p.getRowStride();
            int bw = rowStride / pixelStride, w = img.getWidth(), h = img.getHeight();
            if (bitmap == null || bitmap.getWidth() != bw || bitmap.getHeight() != h) {
                bitmap = Bitmap.createBitmap(bw, h, Bitmap.Config.ARGB_8888);
            }
            buf.rewind();
            bitmap.copyPixelsFromBuffer(buf);
            Bitmap out = bw == w ? bitmap : Bitmap.createBitmap(bitmap, 0, 0, w, h);
            jpeg.reset();
            out.compress(Bitmap.CompressFormat.JPEG, 72, jpeg);
            if (out != bitmap) out.recycle();
            lastFrame = now;
            lastB64 = Base64.encodeToString(jpeg.toByteArray(), Base64.NO_WRAP);
            send(lastB64);
        } catch (Exception ignored) {
        } finally {
            if (img != null) img.close();
        }
    }

    private void send(String b64) {
        Listener l = listener;
        if (l != null) l.onFrame(b64);
    }

    private void notifyState(String s) {
        Listener l = listener;
        if (l != null) l.onState(s);
    }

    private Notification notification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "مشاركة الشاشة", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("تظهر أثناء مشاركة شاشة هذا الجهاز مع مدار");
            nm.createNotificationChannel(ch);
        }
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, CaptureService.class).setAction(ACTION_STOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle("مدار يشارك شاشة هذا الجهاز")
                .setContentText("اضغط «إيقاف» لإنهاء المشاركة")
                .setContentIntent(open)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder((android.graphics.drawable.Icon) null, "إيقاف", stop).build())
                .build();
    }

    @Override
    public void onDestroy() {
        boolean was = running;
        running = false;
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Exception ignored) { }
        wake = null;
        if (handler != null) handler.removeCallbacksAndMessages(null);
        try { if (display != null) display.release(); } catch (Exception ignored) { }
        try { if (reader != null) reader.close(); } catch (Exception ignored) { }
        try { if (projection != null) projection.stop(); } catch (Exception ignored) { }
        if (thread != null) thread.quitSafely();
        display = null; reader = null; projection = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        if (was) notifyState("stopped");
        super.onDestroy();
    }
}
