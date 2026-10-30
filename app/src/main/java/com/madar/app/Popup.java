package com.madar.app;

import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * A small glass pill over whatever is on screen: a green dot + a line of text, gone after a few seconds.
 * Drawn through the accessibility service when it is on (needs no other permission), else as an overlay
 * («الظهور فوق التطبيقات»), else as a toast.
 */
final class Popup {
    private Popup() { }
    private static View cur;

    static void show(Context ctx0, String text, long ms) {
        new Handler(Looper.getMainLooper()).post(() -> {
            Context c = ControlService.instance != null ? ControlService.instance : ctx0;
            if (c == null) return;
            final Context ctx = ctx0 != null ? ctx0 : c;
            int type = ControlService.instance != null ? WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
                    : (Build.VERSION.SDK_INT >= 26 && Settings.canDrawOverlays(ctx)) ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : 0;
            if (type == 0) { Toast.makeText(ctx, "🟢 " + text, Toast.LENGTH_LONG).show(); return; }
            WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
            if (cur != null) { try { wm.removeView(cur); } catch (Exception ignored) { } cur = null; }
            float d = c.getResources().getDisplayMetrics().density;
            LinearLayout row = new LinearLayout(c);
            row.setOrientation(LinearLayout.HORIZONTAL); row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding((int) (22 * d), (int) (14 * d), (int) (22 * d), (int) (14 * d));
            GradientDrawable bg = new GradientDrawable(); bg.setColor(0xE6121626); bg.setCornerRadius(40 * d); bg.setStroke((int) d, 0x33FFFFFF);
            row.setBackground(bg); row.setElevation(12 * d);
            View dot = new View(c);
            GradientDrawable g = new GradientDrawable(); g.setShape(GradientDrawable.OVAL); g.setColor(0xFF34D399);
            dot.setBackground(g);
            LinearLayout.LayoutParams dl = new LinearLayout.LayoutParams((int) (14 * d), (int) (14 * d)); dl.setMarginEnd((int) (12 * d));
            row.addView(dot, dl);
            TextView tv = new TextView(c); tv.setText(text); tv.setTextColor(Color.WHITE); tv.setTextSize(18); tv.setTextDirection(View.TEXT_DIRECTION_RTL);
            row.addView(tv);
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, type,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON, PixelFormat.TRANSLUCENT);
            lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL; lp.y = (int) (36 * d);
            try { wm.addView(row, lp); cur = row; } catch (Exception e) { Toast.makeText(ctx, "🟢 " + text, Toast.LENGTH_LONG).show(); return; }
            row.setAlpha(0f); row.animate().alpha(1f).setDuration(250).start();
            final View me = row;
            dot.animate().scaleX(1.4f).scaleY(1.4f).setDuration(600).withEndAction(() -> dot.animate().scaleX(1f).scaleY(1f).setDuration(600).start()).start();
            new Handler(Looper.getMainLooper()).postDelayed(() -> { if (cur == me) { try { wm.removeView(me); } catch (Exception ignored) { } cur = null; } }, ms);
        });
    }
}
