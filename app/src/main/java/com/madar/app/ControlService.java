package com.madar.app;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Context;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONObject;

/**
 * "Madar control": lets the phone in the headset operate this tablet while its screen is shared —
 * real taps, swipes for scrolling, back/home and typing. The user turns it on once in
 * Settings → Accessibility; it does nothing unless Madar is sharing and control is allowed.
 */
public class ControlService extends AccessibilityService {
    static volatile ControlService instance;

    @Override protected void onServiceConnected() { super.onServiceConnected(); instance = this; }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) { }
    @Override public void onInterrupt() { }
    @Override public boolean onUnbind(android.content.Intent intent) { instance = null; return super.onUnbind(intent); }
    @Override public void onDestroy() { instance = null; super.onDestroy(); }

    static boolean on() { return instance != null; }

    /** Messages from the page: {a:'tap'|'scroll'|'key'|'text', x, y (0..1), dx, dy (fractions of the screen), key, value}. */
    static void handle(String json) {
        ControlService s = instance;
        if (s == null || !CaptureService.running) return;
        try { s.run(new JSONObject(json)); } catch (Exception ignored) { }
    }

    private int[] size() {
        WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Rect b = wm.getMaximumWindowMetrics().getBounds();
            return new int[]{b.width(), b.height()};
        }
        DisplayMetrics m = new DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(m);
        return new int[]{m.widthPixels, m.heightPixels};
    }

    private static float clamp(float v, float lo, float hi) { return Math.max(lo, Math.min(hi, v)); }

    private void run(JSONObject m) {
        String a = m.optString("a");
        int[] sz = size();
        float W = sz[0], H = sz[1];
        float x = clamp((float) m.optDouble("x", 0.5) * W, 1, W - 2);
        float y = clamp((float) m.optDouble("y", 0.5) * H, 1, H - 2);
        switch (a) {
            case "tap": gesture(x, y, x, y, 60); break;
            case "long": gesture(x, y, x, y, 700); break;
            case "scroll": {
                // Content moves the opposite way to the finger: scrolling down = finger swipes up.
                float dx = (float) m.optDouble("dx", 0) * W, dy = (float) m.optDouble("dy", 0) * H;
                float len = (float) Math.hypot(dx, dy);
                if (len < 4) return;
                float k = len > H * 0.6f ? H * 0.6f / len : 1f;
                dx *= k; dy *= k;
                float sx = clamp(x, 2, W - 3), sy = clamp(y, 2, H - 3);
                float ex = clamp(sx - dx, 2, W - 3), ey = clamp(sy - dy, 2, H - 3);
                // Slow enough to scroll by exactly that much (no fling).
                long ms = (long) clamp(len * 0.9f, 120, 450);
                gesture(sx, sy, ex, ey, ms);
                break;
            }
            case "key": key(m.optString("key")); break;
            case "text": type(m.optString("value")); break;
            default: break;
        }
    }

    private void gesture(float x0, float y0, float x1, float y1, long ms) {
        Path p = new Path();
        p.moveTo(x0, y0);
        if (x0 != x1 || y0 != y1) p.lineTo(x1, y1);
        GestureDescription g = new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(p, 0, ms))
                .build();
        dispatchGesture(g, null, null);
    }

    private void key(String k) {
        switch (k) {
            case "back": performGlobalAction(GLOBAL_ACTION_BACK); break;
            case "home": performGlobalAction(GLOBAL_ACTION_HOME); break;
            case "recents": performGlobalAction(GLOBAL_ACTION_RECENTS); break;
            case "enter": {
                AccessibilityNodeInfo f = focused();
                if (f != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    f.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
                }
                break;
            }
            case "backspace": {
                AccessibilityNodeInfo f = focused();
                if (f != null && f.getText() != null && f.getText().length() > 0) {
                    CharSequence t = f.getText();
                    setText(f, t.subSequence(0, t.length() - 1).toString());
                }
                break;
            }
            default: break;
        }
    }

    private AccessibilityNodeInfo focused() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        return root == null ? null : root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
    }

    private void type(String value) {
        AccessibilityNodeInfo f = focused();
        if (f == null || !f.isEditable()) return;
        CharSequence cur = f.getText();
        // Some fields report their hint as text when empty.
        String base = (cur == null || (f.isShowingHintText())) ? "" : cur.toString();
        setText(f, base + value);
    }

    private void setText(AccessibilityNodeInfo f, String t) {
        Bundle b = new Bundle();
        b.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, t);
        f.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b);
    }
}
