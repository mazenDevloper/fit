package com.madar.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Keeps Madar reachable on this device (TV box, tablet, phone) at all times, even with the app closed or the screen
 * asleep: its own link to «المركز» (studio worker hub) as the device "sys-<code>". From any phone, Madar or DriveCast:
 *   {type:'wake'}                          wake the screen + a popup with a green dot («مدار متصل»)
 *   {type:'input', a:'nav'|'key'|'media'|'tap'|'scroll'|'text', …}   the remote: arrows / OK / back / home / volume…
 *   {type:'cursor', a:'move'|'tap'|'long'|'show'|'hide', dx, dy}       a mouse pointer for touch-only screens
 *   {type:'open'}                          bring Madar to the front
 * Started by the app and again after every restart of the device (BootReceiver).
 */
public class KeepService extends Service {
    static volatile boolean running;
    static volatile KeepService inst;
    private static final String HUB = "wss://studio.c-p.workers.dev/hub/ws";
    private final Handler h = new Handler(Looper.getMainLooper());
    private OkHttpClient http;
    private WebSocket ws;
    private long backoff = 2000;
    private volatile boolean online;

    static void start(Context c) {
        Intent k = new Intent(c, KeepService.class);
        try { if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(k); else c.startService(k); } catch (Exception ignored) { }
    }
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("madar.sys", MODE_PRIVATE); }
    /** the page tells us who this device is (its 6-digit code and name) */
    static void setIdentity(Context c, String code, String name) {
        SharedPreferences p = prefs(c);
        boolean changed = !code.equals(p.getString("code", "")) || !name.equals(p.getString("name", ""));
        p.edit().putString("code", code).putString("name", name).apply();
        start(c);
        KeepService s = inst; if (s != null && changed) s.reconnect();
    }

    @Override public int onStartCommand(Intent i, int f, int id) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel("keep") == null) nm.createNotificationChannel(new NotificationChannel("keep", "مدار في الخلفية", NotificationManager.IMPORTANCE_MIN));
        PendingIntent pi = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, "keep").setContentTitle("مدار يعمل").setContentText("جاهز للإيقاظ والتحكم عن بُعد").setSmallIcon(R.drawable.ic_notif).setContentIntent(pi).setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE); else startForeground(7, n);
        running = true; inst = this;
        if (http == null) { http = new OkHttpClient.Builder().pingInterval(25, TimeUnit.SECONDS).retryOnConnectionFailure(true).build(); connect(); }
        return START_STICKY;
    }

    void reconnect() { try { if (ws != null) ws.close(1000, "again"); } catch (Exception ignored) { } ws = null; connect(); }

    private void connect() {
        SharedPreferences p = prefs(this);
        String code = p.getString("code", "");
        if (code.isEmpty()) return;   // the app hasn't told us who we are yet
        String name = p.getString("name", "مدار");
        String url = HUB + "?id=sys-" + code + "&name=" + android.net.Uri.encode(name + " · " + Build.MODEL) + "&kind=tablet&app=sys";
        ws = http.newWebSocket(new Request.Builder().url(url).build(), new WebSocketListener() {
            @Override public void onOpen(WebSocket s, Response r) { online = true; backoff = 2000; }
            @Override public void onMessage(WebSocket s, String text) {
                try {
                    JSONObject d = new JSONObject(text);
                    if (!"msg".equals(d.optString("type"))) return;
                    JSONObject m = d.optJSONObject("msg"); if (m == null) return;
                    JSONObject from = d.optJSONObject("from");
                    String who = from == null ? "جهاز" : from.optString("name", "جهاز");
                    h.post(() -> handle(m, who));
                } catch (Exception ignored) { }
            }
            @Override public void onClosed(WebSocket s, int code, String reason) { if (s == ws) { online = false; later(); } }
            @Override public void onFailure(WebSocket s, Throwable t, Response r) { if (s == ws) { online = false; later(); } }
        });
    }
    private void later() { h.postDelayed(() -> { if (running) connect(); }, backoff); backoff = Math.min(60000, backoff * 2); }

    private void handle(JSONObject m, String who) {
        String t = m.optString("type");
        switch (t) {
            case "wake": wake(who); break;
            case "input": ControlService.handleRemote(m.toString()); break;
            case "cursor": Pointer.get(this).command(m); break;
            case "open": wake(who); openApp(); break;
            case "ping": wake(who); Popup.show(this, "🔔 " + who + " يبحث عن هذا الجهاز", 5000); break;
            case "say": Popup.show(this, "💬 " + m.optString("text"), 6000); break;
            default: break;
        }
    }

    /** turn the screen on (the TV follows over HDMI-CEC when it is enabled) and say so with a green dot */
    private void wake(String who) {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            @SuppressWarnings("deprecation")
            PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE, "madar:wake");
            wl.acquire(10_000);
        } catch (Exception ignored) { }
        AdbSelf.wake(this);   // the real WAKEUP key too (when the full control is set up)
        Popup.show(this, "مدار متصل · أيقظه " + who, 5000);
    }
    private void openApp() {
        try { startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)); } catch (Exception ignored) { }
    }

    @Override public void onDestroy() { running = false; inst = null; try { if (ws != null) ws.close(1000, "bye"); } catch (Exception ignored) { } super.onDestroy(); }
    @Override public IBinder onBind(Intent i) { return null; }
}
