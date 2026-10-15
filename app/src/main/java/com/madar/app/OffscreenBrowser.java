package com.madar.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Presentation;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

/**
 * Madar's built-in browser: a real Chrome-engine browser that runs inside the Madar app on its own
 * invisible screen (a private virtual display), not on the tablet's real screen. Its picture is streamed to
 * the headset, and taps, scrolling and typing from the headset go straight into the page — on any site.
 * The tablet stays free for other use while it runs.
 */
final class OffscreenBrowser {
    interface Listener { void onWebFrame(byte[] jpeg, long captureMs); void onWebState(String json); }

    private final Activity activity;
    private final Listener listener;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private HandlerThread thread;
    private Handler bg;
    private ImageReader reader;
    private VirtualDisplay display;
    private Presentation pres;
    private FrameLayout root;
    private WebView web;
    private View fullscreen;
    private FramePump pump;
    private int width = 1280, height = 800, dpi = 200;
    volatile boolean running;

    OffscreenBrowser(Activity activity, Listener listener) { this.activity = activity; this.listener = listener; }

    @SuppressLint("SetJavaScriptEnabled")
    void start(String url, int w, int h) {
        if (running) { if (url != null && !url.isEmpty()) load(url); return; }
        width = clampEven(w, 480, 2560); height = clampEven(h, 360, 2560);
        thread = new HandlerThread("madar-browser", android.os.Process.THREAD_PRIORITY_DISPLAY);
        thread.start();
        bg = new Handler(thread.getLooper());
        pump = new FramePump("madar-web", listener::onWebFrame);
        pump.setQuality(82); pump.setFps(30);
        reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3);
        reader.setOnImageAvailableListener(r -> { if (pump != null) pump.onImage(r); }, bg);
        DisplayManager dm = (DisplayManager) activity.getSystemService(Activity.DISPLAY_SERVICE);
        display = dm.createVirtualDisplay("madar-browser", width, height, dpi, reader.getSurface(),
                DisplayManager.VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY | DisplayManager.VIRTUAL_DISPLAY_FLAG_PRESENTATION);
        pres = new Presentation(activity, display.getDisplay());
        root = new FrameLayout(pres.getContext());
        root.setBackgroundColor(Color.WHITE);
        web = new WebView(pres.getContext());
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        pres.setContentView(root);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        // A tablet browser: full sites (not cut-down mobile pages).
        s.setUserAgentString(s.getUserAgentString().replace("Mobile Safari", "Safari").replace("; wv", "") + " MadarBrowser");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String sch = r.getUrl().getScheme();
                return !("http".equals(sch) || "https".equals(sch) || "about".equals(sch) || "data".equals(sch) || "blob".equals(sch));
            }
            @Override public void onPageStarted(WebView v, String u, android.graphics.Bitmap f) { state(true); }
            @Override public void onPageFinished(WebView v, String u) { state(false); }
            @Override public void doUpdateVisitedHistory(WebView v, String u, boolean reload) { state(null); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onReceivedTitle(WebView v, String t) { state(null); }
            @Override public void onShowCustomView(View view, CustomViewCallback cb) {
                fullscreen = view; root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            }
            @Override public void onHideCustomView() { if (fullscreen != null) { root.removeView(fullscreen); fullscreen = null; } }
            @Override public void onPermissionRequest(PermissionRequest r) { r.deny(); }   // no camera/mic for remote pages
        });
        pres.show();
        running = true;
        load(url == null || url.isEmpty() ? "https://www.google.com" : url);
        bg.postDelayed(keepAlive, 1000);
    }

    private final Runnable keepAlive = new Runnable() {
        @Override public void run() { if (!running) return; if (pump != null) pump.keepAlive(1000); bg.postDelayed(this, 1000); }
    };

    private static int clampEven(int v, int lo, int hi) { return Math.max(lo, Math.min(hi, v)) & ~1; }

    void load(String url) {
        if (web == null) return;
        String u = url.trim();
        if (!u.matches("(?i)^[a-z]+:.*")) {
            u = u.contains(".") && !u.contains(" ") ? "https://" + u : "https://www.google.com/search?q=" + android.net.Uri.encode(u);
        }
        web.loadUrl(u);
    }

    private void state(Boolean loading) {
        if (web == null) return;
        try {
            JSONObject o = new JSONObject();
            o.put("url", web.getUrl() == null ? "" : web.getUrl());
            o.put("title", web.getTitle() == null ? "" : web.getTitle());
            o.put("back", web.canGoBack());
            o.put("fwd", web.canGoForward());
            if (loading != null) o.put("loading", loading);
            o.put("w", width); o.put("h", height);
            listener.onWebState(o.toString());
        } catch (Exception ignored) { }
    }

    /** Commands from the headset (positions are 0..1 of the picture). Runs on the UI thread. */
    void input(String json) {
        ui.post(() -> {
            if (web == null) return;
            try {
                JSONObject m = new JSONObject(json);
                String a = m.optString("a");
                float x = (float) m.optDouble("x", 0.5) * width, y = (float) m.optDouble("y", 0.5) * height;
                View target = fullscreen != null ? fullscreen : web;
                switch (a) {
                    case "tap": touch(target, x, y, x, y, 40); break;
                    case "long": touch(target, x, y, x, y, 650); break;
                    case "scroll": {
                        float dx = (float) m.optDouble("dx", 0) * width, dy = (float) m.optDouble("dy", 0) * height;
                        if (Math.abs(dx) + Math.abs(dy) < 2) break;
                        touch(target, x, y, x - dx, y - dy, 140);
                        break;
                    }
                    case "key": key(m.optString("key")); break;
                    case "text": typeText(m.optString("value")); break;
                    case "nav": load(m.optString("url")); break;
                    case "back": if (web.canGoBack()) web.goBack(); break;
                    case "forward": if (web.canGoForward()) web.goForward(); break;
                    case "reload": web.reload(); break;
                    case "zoom": if (m.optDouble("f", 1) > 1) web.zoomIn(); else web.zoomOut(); break;
                    case "resize": resize(m.optInt("w", width), m.optInt("h", height)); break;
                    default: break;
                }
            } catch (Exception ignored) { }
        });
    }

    // A finger touch (or swipe) with real timing, so pages react exactly as to a real finger.
    private void touch(View v, float x0, float y0, float x1, float y1, long ms) {
        final long down = SystemClock.uptimeMillis();
        v.dispatchTouchEvent(ev(down, down, MotionEvent.ACTION_DOWN, x0, y0));
        final int steps = Math.max(1, (int) (ms / 16));
        for (int i = 1; i <= steps; i++) {
            final float f = i / (float) steps;
            final int k = i;
            ui.postDelayed(() -> v.dispatchTouchEvent(ev(down, SystemClock.uptimeMillis(), MotionEvent.ACTION_MOVE, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)), 16L * k);
        }
        // Hold still a moment before lifting so a swipe scrolls exactly that far (no fling).
        ui.postDelayed(() -> v.dispatchTouchEvent(ev(down, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, x1, y1)), 16L * steps + (x0 == x1 && y0 == y1 ? 0 : 60));
    }

    private static MotionEvent ev(long down, long t, int action, float x, float y) {
        MotionEvent e = MotionEvent.obtain(down, t, action, x, y, 0);
        e.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);
        return e;
    }

    private void key(String k) {
        int code;
        switch (k) {
            case "enter": code = KeyEvent.KEYCODE_ENTER; break;
            case "backspace": code = KeyEvent.KEYCODE_DEL; break;
            case "tab": code = KeyEvent.KEYCODE_TAB; break;
            case "esc": code = KeyEvent.KEYCODE_ESCAPE; break;
            case "back": if (fullscreen != null) { web.getWebChromeClient().onHideCustomView(); } else if (web.canGoBack()) web.goBack(); return;
            case "home": load("https://www.google.com"); return;
            default: return;
        }
        web.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, code));
        web.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, code));
    }

    private void typeText(String t) {
        String js = "(function(t){var e=document.activeElement;while(e&&e.shadowRoot&&e.shadowRoot.activeElement)e=e.shadowRoot.activeElement;"
                + "if(!e)return;if(document.execCommand&&document.execCommand('insertText',false,t))return;"
                + "if('value' in e){var s=e.selectionStart==null?e.value.length:e.selectionStart,n=e.selectionEnd==null?s:e.selectionEnd;"
                + "var d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value');var v=e.value.slice(0,s)+t+e.value.slice(n);"
                + "if(d&&d.set)d.set.call(e,v);else e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));}})(" + JSONObject.quote(t) + ")";
        web.evaluateJavascript(js, null);
    }

    /** New page shape from the headset (corner handle): the browser really gets wider or taller. */
    void resize(int w, int h) {
        if (!running) return;
        int nw = clampEven(w, 480, 2560), nh = clampEven(h, 360, 2560);
        if (nw == width && nh == height) return;
        width = nw; height = nh;
        bg.post(() -> {
            ImageReader old = reader;
            reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3);
            reader.setOnImageAvailableListener(r -> { if (pump != null) pump.onImage(r); }, bg);
            display.resize(width, height, dpi);
            display.setSurface(reader.getSurface());
            old.close();
            ui.post(() -> state(null));
        });
    }

    void setQuality(int q, int fps) { if (pump != null) { pump.setQuality(q); pump.setFps(fps); } }

    void stop() {
        if (!running) return;
        running = false;
        ui.post(() -> {
            try { if (pres != null) pres.dismiss(); } catch (Exception ignored) { }
            try { if (web != null) { web.loadUrl("about:blank"); web.destroy(); } } catch (Exception ignored) { }
            web = null; pres = null; root = null; fullscreen = null;
            if (bg != null) bg.post(() -> {
                try { if (display != null) display.release(); } catch (Exception ignored) { }
                try { if (reader != null) reader.close(); } catch (Exception ignored) { }
                display = null; reader = null;
                if (pump != null) pump.release();
                pump = null;
                thread.quitSafely();
            });
        });
    }
}
