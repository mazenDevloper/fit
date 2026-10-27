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
    /** «remote only»: the page hosts a control link without sharing the screen (e.g. a TV box seen through HDMI). */
    static volatile boolean remoteOnly = false;

    /** Messages from the page: {a:'tap'|'scroll'|'key'|'text', x, y (0..1), dx, dy (fractions of the screen), key, value}. */
    static void handle(String json) {
        ControlService s = instance;
        if (s == null || !(CaptureService.running || remoteOnly)) return;
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
            case "nav": nav(m.optString("dir")); break;
            case "media": media(m.optString("key")); break;
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

    // ---- the remote's arrows / OK on any screen (TV boxes, tablets): move the focus like a D-pad and click it
    private static final java.util.Map<String, Integer> DIR = new java.util.HashMap<>();
    static { DIR.put("up", android.view.View.FOCUS_UP); DIR.put("down", android.view.View.FOCUS_DOWN); DIR.put("left", android.view.View.FOCUS_LEFT); DIR.put("right", android.view.View.FOCUS_RIGHT); }
    private void nav(String d) {
        AccessibilityNodeInfo root = getRootInActiveWindow(); if (root == null) return;
        AccessibilityNodeInfo f = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (f == null) f = root.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY);
        if ("ok".equals(d)) {
            if (f == null) return;
            AccessibilityNodeInfo c = f; int up = 0;
            while (c != null && !c.isClickable() && up++ < 6) c = c.getParent();
            if (c != null) c.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            else { Rect r = new Rect(); f.getBoundsInScreen(r); gesture(r.exactCenterX(), r.exactCenterY(), r.exactCenterX(), r.exactCenterY(), 60); }
            return;
        }
        Integer dir = DIR.get(d); if (dir == null) return;
        if (f == null) {   // nothing focused yet: the first focusable thing on screen
            AccessibilityNodeInfo n = firstFocusable(root, 0);
            if (n != null) { n.performAction(AccessibilityNodeInfo.ACTION_FOCUS); n.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS); }
            return;
        }
        AccessibilityNodeInfo n = f.focusSearch(dir);
        if (n != null) { n.performAction(AccessibilityNodeInfo.ACTION_FOCUS); n.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS); }
        else {   // no focus next to it (touch apps): scroll that way instead
            int[] sz = size(); float W = sz[0], H = sz[1];
            float dx = "left".equals(d) ? -0.3f : "right".equals(d) ? 0.3f : 0, dy = "up".equals(d) ? -0.3f : "down".equals(d) ? 0.3f : 0;
            gesture(W / 2, H / 2, W / 2 - dx * W, H / 2 - dy * H, 250);
        }
    }
    private AccessibilityNodeInfo firstFocusable(AccessibilityNodeInfo n, int depth) {
        if (n == null || depth > 30) return null;
        if (n.isFocusable() && n.isVisibleToUser()) return n;
        for (int i = 0; i < n.getChildCount(); i++) { AccessibilityNodeInfo c = firstFocusable(n.getChild(i), depth + 1); if (c != null) return c; }
        return null;
    }
    // ---- play / pause / next / volume: real media keys for whatever plays on this device
    private void media(String k) {
        android.media.AudioManager am = (android.media.AudioManager) getSystemService(Context.AUDIO_SERVICE); if (am == null) return;
        if ("vol+".equals(k)) { am.adjustStreamVolume(android.media.AudioManager.STREAM_MUSIC, android.media.AudioManager.ADJUST_RAISE, android.media.AudioManager.FLAG_SHOW_UI); return; }
        if ("vol-".equals(k)) { am.adjustStreamVolume(android.media.AudioManager.STREAM_MUSIC, android.media.AudioManager.ADJUST_LOWER, android.media.AudioManager.FLAG_SHOW_UI); return; }
        if ("mute".equals(k)) { am.adjustStreamVolume(android.media.AudioManager.STREAM_MUSIC, android.media.AudioManager.ADJUST_TOGGLE_MUTE, android.media.AudioManager.FLAG_SHOW_UI); return; }
        int code = "next".equals(k) ? android.view.KeyEvent.KEYCODE_MEDIA_NEXT : "prev".equals(k) ? android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS
                : "ff".equals(k) ? android.view.KeyEvent.KEYCODE_MEDIA_FAST_FORWARD : "rw".equals(k) ? android.view.KeyEvent.KEYCODE_MEDIA_REWIND : android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
        am.dispatchMediaKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, code));
        am.dispatchMediaKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, code));
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
