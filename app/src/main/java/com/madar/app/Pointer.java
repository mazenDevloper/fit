package com.madar.app;

import android.content.Context;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;

import org.json.JSONObject;

/**
 * A mouse pointer for screens made for touch (TV boxes treated as tablets): the remote's arrows move it, OK taps
 * where it points, a long OK long-presses, and «scroll» swipes the page. It hides itself after 6 s of no use.
 * The taps are real touches through the accessibility service, so they work in every app.
 */
final class Pointer {
    private static Pointer one;
    static Pointer get(Context c) { if (one == null) one = new Pointer(c.getApplicationContext()); return one; }

    private final Context app;
    private final Handler h = new Handler(Looper.getMainLooper());
    private View dot; private WindowManager wm; private WindowManager.LayoutParams lp;
    float x = 0.5f, y = 0.5f;
    private long lastMove; private float speed = 1f;
    private Pointer(Context c) { app = c; }

    void command(JSONObject m) {
        String a = m.optString("a", "move");
        switch (a) {
            case "move": {
                // held arrows speed up (fine aim, then fast across the screen)
                long now = System.currentTimeMillis();
                speed = now - lastMove < 260 ? Math.min(speed * 1.35f, 6f) : 1f; lastMove = now;
                x = clamp(x + (float) m.optDouble("dx", 0) * 0.02f * speed); y = clamp(y + (float) m.optDouble("dy", 0) * 0.02f * speed);
                show(); break;
            }
            case "tap": case "long": {
                show();
                JSONObject t = new JSONObject();
                try { t.put("a", a); t.put("x", x); t.put("y", y); } catch (Exception ignored) { }
                // the pointer steps aside for the touch, then comes back
                if (dot != null) dot.setAlpha(0f);
                h.postDelayed(() -> ControlService.handleRemote(t.toString()), 30);
                h.postDelayed(() -> { if (dot != null) dot.setAlpha(1f); }, 260);
                break;
            }
            case "scroll": {
                JSONObject t = new JSONObject();
                try { t.put("a", "scroll"); t.put("x", x); t.put("y", y); t.put("dx", m.optDouble("dx", 0)); t.put("dy", m.optDouble("dy", 0.35)); } catch (Exception ignored) { }
                ControlService.handleRemote(t.toString()); show(); break;
            }
            case "by": x = clamp(x + (float) m.optDouble("dx", 0)); y = clamp(y + (float) m.optDouble("dy", 0)); show(); break;
            case "center": x = 0.5f; y = 0.5f; show(); break;
            case "hide": hide(); break;
            default: show(); break;
        }
    }
    private static float clamp(float v) { return Math.max(0.005f, Math.min(0.995f, v)); }

    private void show() {
        h.post(() -> {
            if (dot == null && !create()) return;
            DisplayMetrics dm = app.getResources().getDisplayMetrics();
            int[] sz = screen();
            lp.x = (int) (x * sz[0]) - lp.width / 2; lp.y = (int) (y * sz[1]) - lp.height / 2;
            try { wm.updateViewLayout(dot, lp); } catch (Exception ignored) { }
            dot.setVisibility(View.VISIBLE);
            h.removeCallbacks(autoHide); h.postDelayed(autoHide, 6000);
        });
    }
    private final Runnable autoHide = this::hide;
    private void hide() { h.post(() -> { if (dot != null) dot.setVisibility(View.GONE); }); }

    private int[] screen() {
        WindowManager w = (WindowManager) app.getSystemService(Context.WINDOW_SERVICE);
        if (Build.VERSION.SDK_INT >= 30) { android.graphics.Rect b = w.getMaximumWindowMetrics().getBounds(); return new int[]{b.width(), b.height()}; }
        DisplayMetrics m = new DisplayMetrics(); w.getDefaultDisplay().getRealMetrics(m); return new int[]{m.widthPixels, m.heightPixels};
    }
    private boolean create() {
        Context c = ControlService.instance != null ? ControlService.instance : app;
        int type = ControlService.instance != null ? WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
                : (Build.VERSION.SDK_INT >= 26 && Settings.canDrawOverlays(app)) ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : 0;
        if (type == 0) { Popup.show(app, "فعّل «تحكم مدار» لإظهار المؤشر", 4000); return false; }
        wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
        float d = c.getResources().getDisplayMetrics().density;
        dot = new View(c);
        GradientDrawable g = new GradientDrawable(); g.setShape(GradientDrawable.OVAL); g.setColor(0xCCFFFFFF); g.setStroke((int) (3 * d), 0xFF34D399);
        dot.setBackground(g); dot.setElevation(10 * d);
        int s = (int) (28 * d);
        lp = new WindowManager.LayoutParams(s, s, type, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        try { wm.addView(dot, lp); return true; } catch (Exception e) { dot = null; return false; }
    }
}
