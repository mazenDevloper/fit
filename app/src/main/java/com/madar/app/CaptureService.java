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
    interface Listener { void onFrame(byte[] jpeg, long captureMs); void onState(String state); void onAudio(byte[] pcm, int len); }

    static final String EXTRA_CODE = "code", EXTRA_DATA = "data", ACTION_STOP = "com.madar.app.STOP";
    static volatile Listener listener;
    static volatile boolean running;

    private static final String CHANNEL = "share";
    private static final int NOTIF_ID = 7;
    // Picture quality, changeable from the headset while sharing.
    static volatile int maxEdge = 1600;                 // long edge of the shared picture
    static volatile int jpegQuality = 80;
    static volatile CaptureService self;
    static volatile int fps = 30;                       // settable from the headset
    private static final long KEEPALIVE_MS = 1000;      // resend the last frame when the screen is still

    private MediaProjection projection;
    private android.os.PowerManager.WakeLock wake;
    private VirtualDisplay display;
    private ImageReader reader;
    private HandlerThread thread;
    private Handler handler;
    private int width, height, dpi;
    private FramePump pump;
    // the smooth path: the capture goes straight into the hardware H.264 encoder (no JPEG pictures)
    private HwEncoder enc;
    static boolean startHw(int bps, HwEncoder.Sink sink) { CaptureService s = self; if (s == null || s.handler == null) return false; s.handler.post(() -> s.hwOn(bps, sink)); return true; }
    static void stopHw() { CaptureService s = self; if (s != null && s.handler != null) s.handler.post(s::hwOff); }
    static void hwKey() { CaptureService s = self; HwEncoder e = s == null ? null : s.enc; if (e != null) e.requestKey(); }
    private void hwOn(int bps, HwEncoder.Sink sink) {
        hwOff();
        if (!running || display == null) return;
        try { enc = new HwEncoder(width, height, Math.max(24, fps), bps, sink); display.setSurface(enc.surface()); }
        catch (Exception e) { if (enc != null) enc.stop(); enc = null; try { display.setSurface(reader.getSurface()); } catch (Exception ignored) { } }
    }
    private void hwOff() {
        HwEncoder e = enc; enc = null;
        if (e == null) return;
        try { if (display != null && reader != null) display.setSurface(reader.getSurface()); } catch (Exception ignored) { }
        e.stop();
    }
    /** after a resize: an encoder in use is rebuilt at the new size */
    private void hwAgain() { HwEncoder e = enc; if (e == null) return; HwEncoder.Sink sk = e.sink; int br = e.bitrate; enc = null; e.stop(); hwOn(br, sk); }

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

        thread = new HandlerThread("madar-capture", android.os.Process.THREAD_PRIORITY_DISPLAY);
        thread.start();
        handler = new Handler(thread.getLooper());
        pump = new FramePump("madar-screen", (jpeg, ts) -> { Listener l = listener; if (l != null) l.onFrame(jpeg, ts); });
        pump.setQuality(jpegQuality); pump.setFps(fps);
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
        self = this;
        startAudio();
        notifyState("started");
        handler.postDelayed(keepAlive, KEEPALIVE_MS);
        return START_NOT_STICKY;
    }

    private final Runnable keepAlive = new Runnable() {
        @Override public void run() {
            if (!running) return;
            if (pump != null) pump.keepAlive(KEEPALIVE_MS);
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
        float k = Math.min(1f, maxEdge / (float) Math.max(w, h));
        width = Math.max(2, Math.round(w * k) & ~1);
        height = Math.max(2, Math.round(h * k) & ~1);
        dpi = Math.max(120, Math.round(getResources().getDisplayMetrics().densityDpi * k));
    }

    private ImageReader newReader() {
        ImageReader r = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3);
        r.setOnImageAvailableListener(rr -> { if (pump != null) pump.onImage(rr); }, handler);
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
            hwAgain();
        });
    }

    /** Quality change from the headset: rebuild the capture at the new size. */
    static void setQuality(int edge, int q) {
        maxEdge = Math.max(640, Math.min(2560, edge)); jpegQuality = Math.max(40, Math.min(95, q));
        CaptureService s = self;
        if (s != null && s.pump != null) s.pump.setQuality(jpegQuality);
        if (s != null && s.handler != null) s.handler.post(s::resizeCapture);
    }
    private void resizeCapture() {
        if (!running || display == null) return;
        int ow = width, oh = height;
        measure();
        if (ow == width && oh == height) return;
        ImageReader old = reader;
        reader = newReader();
        display.resize(width, height, dpi);
        display.setSurface(reader.getSurface());
        old.close();
        hwAgain();
    }

    // ---- Tablet sound: what apps play (videos, games) is captured and sent with the picture (Android 10+). ----
    private android.media.AudioRecord audio;
    private Thread audioThread;
    private void startAudio() {
        if (Build.VERSION.SDK_INT < 29 || projection == null) return;
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        try {
            android.media.AudioPlaybackCaptureConfiguration cfg = new android.media.AudioPlaybackCaptureConfiguration.Builder(projection)
                    .addMatchingUsage(android.media.AudioAttributes.USAGE_MEDIA)
                    .addMatchingUsage(android.media.AudioAttributes.USAGE_GAME)
                    .addMatchingUsage(android.media.AudioAttributes.USAGE_UNKNOWN)
                    .build();
            android.media.AudioFormat fmt = new android.media.AudioFormat.Builder()
                    .setEncoding(android.media.AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(48000)
                    .setChannelMask(android.media.AudioFormat.CHANNEL_IN_STEREO)
                    .build();
            final int chunk = 48000 * 2 * 2 / 25;   // 40 ms of stereo 16-bit
            audio = new android.media.AudioRecord.Builder()
                    .setAudioFormat(fmt)
                    .setBufferSizeInBytes(chunk * 8)
                    .setAudioPlaybackCaptureConfig(cfg)
                    .build();
            audio.startRecording();
            audioThread = new Thread(() -> {
                byte[] buf = new byte[chunk];
                while (running && audio != null) {
                    int n = 0;
                    while (n < chunk && running) { int r = audio.read(buf, n, chunk - n); if (r <= 0) break; n += r; }
                    if (n <= 0) continue;
                    Listener l = listener;
                    if (l != null) l.onAudio(java.util.Arrays.copyOf(buf, n), n);
                }
            }, "madar-audio");
            audioThread.start();
        } catch (Exception e) { audio = null; }
    }
    private void stopAudio() {
        try { if (audio != null) { audio.stop(); audio.release(); } } catch (Exception ignored) { }
        audio = null;
    }

    static void setFps(int f) { fps = f; CaptureService s = self; if (s != null && s.pump != null) s.pump.setFps(f); }

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
        self = null;
        { HwEncoder e = enc; enc = null; if (e != null) e.stop(); }
        stopAudio();
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Exception ignored) { }
        wake = null;
        if (handler != null) handler.removeCallbacksAndMessages(null);
        try { if (display != null) display.release(); } catch (Exception ignored) { }
        try { if (reader != null) reader.close(); } catch (Exception ignored) { }
        try { if (projection != null) projection.stop(); } catch (Exception ignored) { }
        if (thread != null) thread.quitSafely();
        if (pump != null) pump.release();
        pump = null;
        display = null; reader = null; projection = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        if (was) notifyState("stopped");
        super.onDestroy();
    }
}
