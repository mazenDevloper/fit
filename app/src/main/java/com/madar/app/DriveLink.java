package com.madar.app;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 🎮 Madar's control through DriveCast TV on the same box. Some TV boxes (T6: an Allwinner Android 12 build) never run a
 * third-party accessibility service — «تحكم مدار» is listed but the system keeps switching it off — while DriveCast's own mouse
 * service stays bound. So when Madar's service is not there, each command of the page / «المركز» goes to DriveCast's local
 * server (127.0.0.1:8080): taps, holds and swipes to its mouse service, keys to its remote, text to the box's text field.
 */
final class DriveLink {
    private DriveLink() { }
    private static final ExecutorService POOL = Executors.newSingleThreadExecutor();
    private static volatile long okAt = 0, failAt = 0;

    /** DriveCast TV is on this box (it does the control when «تحكم مدار» is not running) */
    static boolean present(android.content.Context c) {
        for (String p : new String[] { "app.drivecast.tv", "app.drivecast.tv.lite" }) { try { c.getPackageManager().getPackageInfo(p, 0); return true; } catch (Exception ignored) { } }
        return false;
    }
    /** DriveCast answered recently (or we have not asked yet): worth sending to it */
    static boolean usable() { return okAt > failAt || System.currentTimeMillis() - failAt > 30_000; }

    /** the same message ControlService takes: {a:'tap'|'long'|'scroll'|'key'|'nav'|'media'|'text', x, y, dx, dy, key, dir, value} */
    static void send(JSONObject m) {
        String a = m.optString("a");
        double x = clamp(m.optDouble("x", 0.5)), y = clamp(m.optDouble("y", 0.5));
        switch (a) {
            case "tap": post("/mouse", String.format(Locale.US, "a %.4f %.4f", x, y)); break;
            case "long": post("/mouse", String.format(Locale.US, "al %.4f %.4f", x, y)); break;
            case "scroll": {   // the content follows the finger the other way (as ControlService does)
                double dx = m.optDouble("dx", 0), dy = m.optDouble("dy", 0);
                post("/mouse", String.format(Locale.US, "w %.4f %.4f %.4f %.4f", x, y, clamp(x - dx), clamp(y - dy)));
                break;
            }
            case "key": {
                String k = m.optString("key");
                if ("back".equals(k)) post("/mouse", "b");
                else if ("home".equals(k)) post("/mouse", "h");
                else if ("recents".equals(k)) post("/mouse", "r");
                else if ("enter".equals(k)) post("/key", "ok");
                break;
            }
            case "nav": {
                String d = m.optString("dir");
                post("/key", "ok".equals(d) || "click".equals(d) || "enter".equals(d) ? "ok" : d);
                break;
            }
            case "media": {
                String k = m.optString("key");
                post("/key", "vol+".equals(k) ? "volup" : "vol-".equals(k) ? "voldown"
                    : k.contains("mute") ? "mute" : k.contains("next") ? "next" : k.contains("prev") ? "prev" : "play");
                break;
            }
            case "text": post("/type", m.optString("value")); break;
            default: break;
        }
    }

    private static double clamp(double v) { return Math.max(0, Math.min(1, v)); }

    private static void post(String path, String body) {
        POOL.execute(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL("http://127.0.0.1:8080" + path).openConnection();
                c.setConnectTimeout(1500); c.setReadTimeout(3000); c.setDoOutput(true); c.setRequestMethod("POST");
                byte[] b = body.getBytes(StandardCharsets.UTF_8);
                c.setFixedLengthStreamingMode(b.length);
                try (OutputStream o = c.getOutputStream()) { o.write(b); }
                if (c.getResponseCode() < 400) okAt = System.currentTimeMillis(); else failAt = System.currentTimeMillis();
            } catch (Exception e) { failAt = System.currentTimeMillis(); }
            finally { if (c != null) c.disconnect(); }
        });
    }
}
