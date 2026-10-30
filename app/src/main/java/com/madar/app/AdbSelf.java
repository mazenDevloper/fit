package com.madar.app;

import android.content.Context;
import android.os.Build;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import org.json.JSONObject;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import dadb.AdbKeyPair;
import dadb.Dadb;

/**
 * «التحكم الكامل» for TV boxes (Google TV / Android TV): Madar talks to the device's own ADB (network debugging,
 * 127.0.0.1:5555) and sends real remote keys - the arrows, OK, back, home, wake - exactly like the box's remote,
 * in every app and on the home screen, on any Android version. The first time the box asks «السماح بتصحيح
 * الأخطاء؟»: tick «السماح دائماً». Once connected it also switches «تحكم مدار» on by itself (and lets it draw
 * the pointer / popups), which is what the box's own settings screen refused to keep on.
 */
final class AdbSelf {
    private AdbSelf() { }
    private static final ExecutorService q = Executors.newSingleThreadExecutor();
    private static volatile Dadb dadb;
    static volatile boolean ok;          // connected at least once and still answering
    static volatile String state = "غير متصل";

    private static Dadb conn(Context c) throws Exception {
        Dadb d = dadb; if (d != null) return d;
        File priv = new File(c.getFilesDir(), "adbkey"), pub = new File(c.getFilesDir(), "adbkey.pub");
        if (!priv.exists() || !pub.exists()) AdbKeyPair.generate(priv, pub);
        AdbKeyPair kp = AdbKeyPair.read(priv, pub);
        state = "بانتظار «السماح» على الشاشة…";
        d = Dadb.create("127.0.0.1", 5555, kp);
        d.shell("echo ok");   // the first command waits for the «allow debugging» answer
        dadb = d; ok = true; state = "متصل";
        heal(c, d);
        return d;
    }

    /** what the box's settings didn't keep: «تحكم مدار» on, drawing over apps allowed */
    private static void heal(Context c, Dadb d) {
        String pkg = c.getPackageName();
        try {
            d.shell("appops set " + pkg + " ACCESS_RESTRICTED_SETTINGS allow");
            d.shell("appops set " + pkg + " SYSTEM_ALERT_WINDOW allow");
            String cur = d.shell("settings get secure enabled_accessibility_services").getOutput().trim();
            String me = pkg + "/.ControlService";
            if (!cur.contains(me)) {
                String v = (cur.isEmpty() || "null".equals(cur)) ? me : cur + ":" + me;
                d.shell("settings put secure enabled_accessibility_services " + v);
                d.shell("settings put secure accessibility_enabled 1");
            }
        } catch (Exception ignored) { }
    }

    static void setup(Context c) {
        q.execute(() -> {
            try { conn(c); Popup.show(c, "التحكم الكامل يعمل ✓", 4000); }
            catch (Exception e) {
                dadb = null; ok = false; state = "تعذّر: فعّل «تصحيح الأخطاء عبر الشبكة»";
                Popup.show(c, "فعّل خيارات المطوّر ← تصحيح الأخطاء عبر الشبكة (ADB) ثم أعد المحاولة", 7000);
            }
        });
    }

    static void shell(Context c, String cmd) {
        q.execute(() -> {
            for (int i = 0; i < 2; i++) {
                try { conn(c).shell(cmd); return; }
                catch (Exception e) { try { if (dadb != null) dadb.close(); } catch (Exception ignored) { } dadb = null; ok = false; }
            }
        });
    }

    private static int[] size(Context c) {
        WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
        if (Build.VERSION.SDK_INT >= 30) { android.graphics.Rect b = wm.getMaximumWindowMetrics().getBounds(); return new int[]{b.width(), b.height()}; }
        DisplayMetrics m = new DisplayMetrics(); wm.getDefaultDisplay().getRealMetrics(m); return new int[]{m.widthPixels, m.heightPixels};
    }

    /** the same messages as ControlService (nav / key / media / tap / long / scroll / text) as real input */
    static boolean input(Context c, JSONObject m) {
        String a = m.optString("a"), k = null;
        if ("nav".equals(a)) {
            switch (m.optString("dir")) { case "up": k = "19"; break; case "down": k = "20"; break; case "left": k = "21"; break; case "right": k = "22"; break; case "ok": k = "23"; break; default: break; }
        } else if ("key".equals(a)) {
            switch (m.optString("key")) { case "back": k = "4"; break; case "home": k = "3"; break; case "recents": k = "187"; break; case "enter": k = "66"; break; case "backspace": k = "67"; break; case "menu": k = "82"; break; default: break; }
        } else if ("media".equals(a)) {
            switch (m.optString("key")) { case "vol+": k = "24"; break; case "vol-": k = "25"; break; case "mute": k = "164"; break; case "next": k = "87"; break; case "prev": k = "88"; break; case "ff": k = "90"; break; case "rw": k = "89"; break; default: k = "85"; break; }
        }
        if (k != null) { shell(c, "input keyevent " + k); return true; }
        int[] s = size(c);
        int x = Math.round((float) m.optDouble("x", 0.5) * s[0]), y = Math.round((float) m.optDouble("y", 0.5) * s[1]);
        if ("tap".equals(a)) { shell(c, "input tap " + x + " " + y); return true; }
        if ("long".equals(a)) { shell(c, "input swipe " + x + " " + y + " " + x + " " + y + " 700"); return true; }
        if ("scroll".equals(a)) {
            int ex = Math.round(x - (float) m.optDouble("dx", 0) * s[0]), ey = Math.round(y - (float) m.optDouble("dy", 0) * s[1]);
            shell(c, "input swipe " + x + " " + y + " " + ex + " " + ey + " 300"); return true;
        }
        if ("text".equals(a)) {
            String t = m.optString("value");
            if (t.matches("[\\x20-\\x7E]+")) { shell(c, "input text '" + t.replace("'", "").replace(" ", "%s") + "'"); return true; }
            return false;   // Arabic: only through «تحكم مدار» (input text is ASCII only)
        }
        return false;
    }
    static void wake(Context c) { if (ok) shell(c, "input keyevent 224"); }
}
