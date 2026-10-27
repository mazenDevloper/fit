package com.madar.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Madar for Android: the web app in a full-screen WebView, plus what browsers can't do —
 * sharing this device's real screen (MediaProjection) with the 6-digit code.
 */
public class MainActivity extends Activity implements CaptureService.Listener, OffscreenBrowser.Listener {
    static final String HOME = "https://mazendevloper.github.io/fit/";
    static final String HOST = "mazendevloper.github.io";
    private static final int REQ_CAPTURE = 1, REQ_FILE = 2, REQ_PERMS = 3, REQ_NOTIF = 4;

    private WebView web;
    private FrameLayout root;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingPermission;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicBoolean framePending = new AtomicBoolean(false);

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            w.getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        immersive();

        WebView.setWebContentsDebuggingEnabled(true);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setAllowFileAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setUserAgentString(s.getUserAgentString() + " MadarApp/" + BuildConfigVersion.name(this));
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        // Keep the page running at full priority while sharing from other apps.
        web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);

        web.addJavascriptInterface(new Bridge(), "MadarAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        CaptureService.listener = this;
        String url = HOME;
        Uri data = getIntent() != null ? getIntent().getData() : null;
        if (data != null && HOST.equals(data.getHost())) url = data.toString();
        if (state != null) web.restoreState(state); else web.loadUrl(url);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Uri data = intent.getData();
        if (data != null && HOST.equals(data.getHost())) web.loadUrl(data.toString());
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override
    protected void onResume() {
        super.onResume();
        hideDot();
        web.onResume();
        immersive();
    }

    private boolean sharing() { return CaptureService.running || (browser != null && browser.running) || (uvc != null && uvc.running); }

    // Leaving the app while sharing: Madar shrinks into a small floating window instead of going to the
    // background. A page in the background is slowed down by Android after a few minutes (the stream
    // freezes); a page that is still on screen, even tiny, keeps streaming without pause.
    private android.app.PictureInPictureParams pipParams(boolean auto) {
        android.app.PictureInPictureParams.Builder b = new android.app.PictureInPictureParams.Builder()
                .setAspectRatio(new android.util.Rational(16, 9));
        if (Build.VERSION.SDK_INT >= 31) b.setAutoEnterEnabled(auto).setSeamlessResizeEnabled(false);
        return b.build();
    }
    void updatePip() {
        if (Build.VERSION.SDK_INT < 26) return;
        // With «display over other apps» allowed Madar becomes a small dot instead of a picture-in-picture window.
        try { setPictureInPictureParams(pipParams(sharing() && !canDot())); } catch (Exception ignored) { }
        if (sharing() && !canDot() && !askedDot) {
            askedDot = true;
            js("window.__madarToast&&__madarToast('لتصغير مدار إلى نقطة صغيرة أثناء المشاركة: فعّل «الظهور فوق التطبيقات» لمدار')");
            try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, android.net.Uri.parse("package:" + getPackageName()))); } catch (Exception ignored) { }
        }
    }
    private boolean askedDot;
    // HDMI capture card over USB, and the phone as a Bluetooth remote
    private UvcSource uvc;
    private HidRemote hidRemote;
    private boolean canDot() { return android.provider.Settings.canDrawOverlays(this); }

    // ---- The dot: while sharing in the background the page lives in a tiny floating circle. It stays
    // "on screen" so Android never slows it down; drag it anywhere, tap it to come back to Madar. ----
    private FrameLayout dot;
    private ViewGroup.LayoutParams webLp;
    private void showDot() {
        if (dot != null || !canDot() || !sharing()) return;
        final android.view.WindowManager wm = getWindowManager();
        int px = Math.round(14 * getResources().getDisplayMetrics().density);   // a small point, not a bubble
        dot = new FrameLayout(this);
        ViewGroup parent = (ViewGroup) web.getParent();
        webLp = web.getLayoutParams();
        if (parent != null) parent.removeView(web);
        dot.addView(web, new FrameLayout.LayoutParams(px, px));
        View face = new View(this);
        android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
        g.setShape(android.graphics.drawable.GradientDrawable.OVAL); g.setColor(0xFF2BB673); g.setStroke(Math.max(1, px / 8), 0xCCFFFFFF);
        face.setBackground(g);
        dot.addView(face, new FrameLayout.LayoutParams(px, px));
        dot.setClipToOutline(true);
        final android.view.WindowManager.LayoutParams lp = new android.view.WindowManager.LayoutParams(px, px,
                android.view.WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                android.view.WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | android.view.WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                android.graphics.PixelFormat.TRANSLUCENT);
        lp.gravity = android.view.Gravity.TOP | android.view.Gravity.START;
        lp.x = getResources().getDisplayMetrics().widthPixels - px - 6; lp.y = getResources().getDisplayMetrics().heightPixels / 3;
        face.setOnTouchListener(new View.OnTouchListener() {
            float sx, sy; int ox, oy; boolean moved;
            @Override public boolean onTouch(View v, android.view.MotionEvent e) {
                switch (e.getActionMasked()) {
                    case android.view.MotionEvent.ACTION_DOWN: sx = e.getRawX(); sy = e.getRawY(); ox = lp.x; oy = lp.y; moved = false; return true;
                    case android.view.MotionEvent.ACTION_MOVE:
                        float dx = e.getRawX() - sx, dy = e.getRawY() - sy;
                        if (Math.abs(dx) + Math.abs(dy) > 8) moved = true;
                        lp.x = ox + Math.round(dx); lp.y = oy + Math.round(dy);
                        try { wm.updateViewLayout(dot, lp); } catch (Exception ignored) { }
                        return true;
                    case android.view.MotionEvent.ACTION_UP:
                        if (!moved) startActivity(new Intent(MainActivity.this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_NEW_TASK));
                        return true;
                }
                return false;
            }
        });
        try { wm.addView(dot, lp); } catch (Exception e) { hideDot(); return; }
        web.onResume(); web.resumeTimers();
    }
    private void hideDot() {
        if (dot == null) return;
        try { getWindowManager().removeView(dot); } catch (Exception ignored) { }
        dot.removeView(web);
        dot = null;
        if (web.getParent() == null) root.addView(web, 0, webLp != null ? webLp : new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (sharing() && canDot()) { showDot(); return; }
        if (Build.VERSION.SDK_INT >= 26 && Build.VERSION.SDK_INT < 31 && sharing()) {
            try { enterPictureInPictureMode(pipParams(false)); } catch (Exception ignored) { }
        }
    }
    @Override
    public void onPictureInPictureModeChanged(boolean inPip, android.content.res.Configuration c) {
        super.onPictureInPictureModeChanged(inPip, c);
        web.onResume(); web.resumeTimers();
    }

    @Override
    protected void onPause() {
        super.onPause();
        // While sharing, the page must keep sending this screen even when another app is in front.
        if (!sharing()) web.onPause(); else { web.onResume(); web.resumeTimers(); if (canDot() && !isInPictureInPictureMode()) main.postDelayed(() -> { if (!hasWindowFocus() && sharing()) showDot(); }, 400); }
    }

    @Override
    protected void onDestroy() {
        hideDot();
        if (CaptureService.listener == this) CaptureService.listener = null;
        if (CaptureService.running) stopService(new Intent(this, CaptureService.class));
        if (browser != null) browser.stop();
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    @Override public void onConfigurationChanged(Configuration c) { super.onConfigurationChanged(c); immersive(); }

    private void immersive() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    // Controller buttons go to the page (Gamepad API); the controller's ○/B must not close the app.
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int src = e.getSource();
        boolean pad = (src & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (src & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
        if (pad && e.getKeyCode() == KeyEvent.KEYCODE_BACK) return true;
        return super.dispatchKeyEvent(e);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (customView != null) { hideCustomView(); return; }
        if (web.canGoBack()) { web.goBack(); return; }
        moveTaskToBack(true);   // keep running (and sharing) instead of closing
    }

    // ---------- Screen sharing ----------
    private void startCapture() {
        if (CaptureService.running) { js("window.__madarCapture&&__madarCapture('started')"); return; }
        // Notifications (the stop button) and sound capture (the tablet's audio goes with the picture).
        List<String> need = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.POST_NOTIFICATIONS);
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.RECORD_AUDIO);
        if (!need.isEmpty()) {
            requestPermissions(need.toArray(new String[0]), REQ_NOTIF);
            return;   // continues in onRequestPermissionsResult
        }
        askCapture();
    }

    private void askCapture() {
        MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        try {
            startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE);
        } catch (Exception e) {
            js("window.__madarCapture&&__madarCapture('denied')");
        }
    }

    // Pictures and sound go to the page as raw bytes when this WebView supports it (fast), else as text.
    private Boolean binary;
    private boolean binary() {
        if (binary == null) {
            try {
                binary = androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.POST_WEB_MESSAGE)
                        && androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER);
            } catch (Throwable t) { binary = false; }
        }
        return binary;
    }
    private static final android.net.Uri ORIGIN = android.net.Uri.parse("https://mazendevloper.github.io");
    // Header: "MDR", kind (1 picture, 2 sound, 3 browser picture + time, 4 screen picture + time), [uint32 capture ms].
    private void postBytes(int kind, byte[] data, int len) { postBytes(kind, data, len, -1); }
    private void postBytes(int kind, byte[] data, int len, long ts) {
        int head = ts >= 0 ? 8 : 4;
        byte[] msg = new byte[len + head];
        msg[0] = 'M'; msg[1] = 'D'; msg[2] = 'R'; msg[3] = (byte) kind;
        if (ts >= 0) { int t = (int) ts; msg[4] = (byte) t; msg[5] = (byte) (t >> 8); msg[6] = (byte) (t >> 16); msg[7] = (byte) (t >> 24); }
        System.arraycopy(data, 0, msg, head, len);
        main.post(() -> {
            try { androidx.webkit.WebViewCompat.postWebMessage(web, new androidx.webkit.WebMessageCompat(msg), ORIGIN); }
            catch (Throwable t) { binary = false; }
        });
    }

    @Override
    public void onFrame(byte[] jpeg, long ts) {
        if (binary()) { postBytes(4, jpeg, jpeg.length, ts); return; }   // paced by FramePump (newest frame wins)
        if (!framePending.compareAndSet(false, true)) return;   // drop frames while the page is busy
        String b64 = android.util.Base64.encodeToString(jpeg, android.util.Base64.NO_WRAP);
        main.post(() -> web.evaluateJavascript("window.__madarFrame&&__madarFrame('" + b64 + "')", v -> framePending.set(false)));
    }

    private final AtomicBoolean audioPending = new AtomicBoolean(false);
    private final StringBuilder audioQueue = new StringBuilder();
    @Override
    public void onAudio(byte[] pcm, int len) {
        if (binary()) { postBytes(2, pcm, len); return; }
        String b64 = android.util.Base64.encodeToString(pcm, 0, len, android.util.Base64.NO_WRAP);
        // Audio chunks are never dropped; if the page is busy they are sent together next time.
        synchronized (audioQueue) { if (audioQueue.length() > 0) audioQueue.append(','); audioQueue.append('\'').append(b64).append('\''); }
        if (!audioPending.compareAndSet(false, true)) return;
        main.post(() -> {
            String list;
            synchronized (audioQueue) { list = audioQueue.toString(); audioQueue.setLength(0); }
            if (list.isEmpty()) { audioPending.set(false); return; }
            web.evaluateJavascript("window.__madarAudio&&[" + list + "].forEach(function(a){__madarAudio(a)})", v -> audioPending.set(false));
        });
    }

    // ---- Built-in browser (OffscreenBrowser) ----
    private OffscreenBrowser browser;
    private final AtomicBoolean webPending = new AtomicBoolean(false);
    @Override
    public void onWebFrame(byte[] jpeg, long ts) {
        if (binary()) { postBytes(3, jpeg, jpeg.length, ts); return; }
        if (!webPending.compareAndSet(false, true)) return;
        String b64 = android.util.Base64.encodeToString(jpeg, android.util.Base64.NO_WRAP);
        main.post(() -> web.evaluateJavascript("window.__madarWebFrame&&__madarWebFrame('" + b64 + "')", v -> webPending.set(false)));
    }
    @Override
    public void onWebState(String json) {
        main.post(() -> web.evaluateJavascript("window.__madarWebState&&__madarWebState(" + json + ")", null));
    }

    @Override
    public void onState(String state) {
        main.post(() -> { js("window.__madarCapture&&__madarCapture('" + state + "')"); updatePip(); });
    }

    private void js(String code) { web.evaluateJavascript(code, null); }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_CAPTURE) {
            if (res == RESULT_OK && data != null) {
                Intent i = new Intent(this, CaptureService.class)
                        .putExtra(CaptureService.EXTRA_CODE, res)
                        .putExtra(CaptureService.EXTRA_DATA, data);
                startForegroundService(i);
            } else {
                js("window.__madarCapture&&__madarCapture('denied')");
            }
        } else if (req == REQ_FILE && fileCallback != null) {
            Uri[] result = null;
            if (res == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    result = new Uri[n];
                    for (int k = 0; k < n; k++) result[k] = data.getClipData().getItemAt(k).getUri();
                } else if (data.getData() != null) result = new Uri[]{data.getData()};
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        super.onRequestPermissionsResult(req, perms, results);
        if (req == REQ_NOTIF) { askCapture(); return; }
        if (req == REQ_PERMS && pendingPermission != null) {
            grantWhatWeHave(pendingPermission);
            pendingPermission = null;
        }
    }

    // ---------- Camera / microphone for the page ----------
    private void grantWhatWeHave(PermissionRequest r) {
        List<String> ok = new ArrayList<>();
        for (String res : r.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) {
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) ok.add(res);
            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) ok.add(res);
            } else ok.add(res);
        }
        if (ok.isEmpty()) r.deny(); else r.grant(ok.toArray(new String[0]));
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest r) {
            runOnUiThread(() -> {
                List<String> need = new ArrayList<>();
                for (String res : r.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)
                            && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
                        need.add(Manifest.permission.CAMERA);
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)
                            && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                        need.add(Manifest.permission.RECORD_AUDIO);
                }
                if (need.isEmpty()) { grantWhatWeHave(r); return; }
                pendingPermission = r;
                requestPermissions(need.toArray(new String[0]), REQ_PERMS);
            });
        }

        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            Intent i = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE);
            String[] types = p.getAcceptTypes();
            i.setType("*/*");
            if (types != null && types.length > 0 && types[0] != null && !types[0].isEmpty() && types[0].contains("/")) {
                i.putExtra(Intent.EXTRA_MIME_TYPES, types);
            }
            i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            try { startActivityForResult(Intent.createChooser(i, "اختر ملفات"), REQ_FILE); }
            catch (ActivityNotFoundException e) { fileCallback = null; return false; }
            return true;
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback cb) {
            if (customView != null) { cb.onCustomViewHidden(); return; }
            customView = view; customCallback = cb;
            root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            immersive();
        }

        @Override public void onHideCustomView() { hideCustomView(); }
    }

    private void hideCustomView() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        if (customCallback != null) customCallback.onCustomViewHidden();
        customCallback = null;
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!req.isForMainFrame()) return false;
            String scheme = u.getScheme() == null ? "" : u.getScheme();
            if ((scheme.equals("https") || scheme.equals("http")) && HOST.equals(u.getHost())
                    && (u.getPath() == null || !u.getPath().endsWith(".apk"))) return false;
            // Other sites, downloads and app links open outside Madar.
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
            return true;
        }

        @Override
        public void onReceivedError(WebView v, android.webkit.WebResourceRequest req, android.webkit.WebResourceError err) {
            if (req.isForMainFrame()) {
                Toast.makeText(MainActivity.this, "لا يوجد اتصال — يعمل مدار بدون إنترنت بعد أول فتح", Toast.LENGTH_LONG).show();
            }
        }
    }

    // ---------- window.MadarAndroid ----------
    private class Bridge {
        @JavascriptInterface public void startCapture() { runOnUiThread(MainActivity.this::startCapture); }
        @JavascriptInterface public void startUvc() { runOnUiThread(() -> {
            if (uvc == null) uvc = new UvcSource(MainActivity.this, new UvcSource.Sink() {
                @Override public void onJpeg(byte[] j, long ts) { onFrame(j, ts); }
                @Override public void onUvcState(String st) { main.post(() -> {
                    if ("nocard".equals(st)) { Toast.makeText(MainActivity.this, "وصّل قطعة HDMI بمنفذ USB-C (OTG)", Toast.LENGTH_LONG).show(); return; }
                    js("window.__madarCapture&&__madarCapture('" + ("started".equals(st) ? "started" : "denied".equals(st) || "error".equals(st) ? "denied" : "stopped") + "')"); updatePip(); }); }
            });
            uvc.start(); }); }
        @JavascriptInterface public void stopUvc() { runOnUiThread(() -> { if (uvc != null) { uvc.stop(); uvc = null; } }); }
        @JavascriptInterface public void setRemoteOnly(boolean on) { ControlService.remoteOnly = on; }
        @JavascriptInterface public void hidStart() { runOnUiThread(() -> { if (!HidRemote.supported()) return; if (Build.VERSION.SDK_INT >= 31 && checkSelfPermission("android.permission.BLUETOOTH_CONNECT") != PackageManager.PERMISSION_GRANTED) { requestPermissions(new String[]{"android.permission.BLUETOOTH_CONNECT", "android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_ADVERTISE"}, REQ_PERMS); return; } if (hidRemote == null) hidRemote = new HidRemote(MainActivity.this); hidRemote.start(); }); }
        @JavascriptInterface public String hidDevices() { return hidRemote == null ? "[]" : hidRemote.devices(); }
        @JavascriptInterface public void hidConnect(String addr) { if (hidRemote != null) hidRemote.connect(addr); }
        @JavascriptInterface public void hidKey(String k) { if (hidRemote != null) hidRemote.key(k); }
        @JavascriptInterface public void hidText(String t) { if (hidRemote != null) new Thread(() -> hidRemote.text(t)).start(); }
        @JavascriptInterface public String hidState() { return hidRemote == null ? "اضغط «اتصل»" : hidRemote.state; }
        @JavascriptInterface public void stopCapture() {
            if (uvc != null) { runOnUiThread(() -> { if (uvc != null) { uvc.stop(); uvc = null; } }); }
            runOnUiThread(() -> { if (CaptureService.running) stopService(new Intent(MainActivity.this, CaptureService.class)); });
        }
        @JavascriptInterface public boolean isCapturing() { return CaptureService.running; }
        // Built-in browser: runs on an invisible screen inside Madar, streamed to the headset.
        @JavascriptInterface public boolean hasBrowser() { return true; }
        @JavascriptInterface public void browserStart(String url, int w, int h) {
            runOnUiThread(() -> { if (browser == null) browser = new OffscreenBrowser(MainActivity.this, MainActivity.this); browser.start(url, w, h); updatePip(); });
        }
        @JavascriptInterface public void browserInput(String json) { OffscreenBrowser b = browser; if (b != null) b.input(json); }
        @JavascriptInterface public void browserQuality(int q, int fps) { runOnUiThread(() -> { if (browser != null) browser.setQuality(q, fps); }); }
        @JavascriptInterface public boolean browserRunning() { OffscreenBrowser b = browser; return b != null && b.running; }
        @JavascriptInterface public void browserStop() { runOnUiThread(() -> { if (browser != null) browser.stop(); updatePip(); }); }
        @JavascriptInterface public void setQuality(int edge, int jpeg) { CaptureService.setQuality(edge, jpeg); }
        @JavascriptInterface public void setFps(int fps) { CaptureService.setFps(fps); }
        // Remote control of this tablet (see ControlService).
        @JavascriptInterface public String controlState() { return ControlService.on() ? "on" : "off"; }
        @JavascriptInterface public void input(String json) { ControlService.handle(json); }
        @JavascriptInterface public void openControlSettings() {
            runOnUiThread(() -> {
                try { startActivity(new Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS)); } catch (Exception ignored) { }
                Toast.makeText(MainActivity.this, "اختر «تحكم مدار» وفعّله", Toast.LENGTH_LONG).show();
            });
        }
        @JavascriptInterface public String version() { return BuildConfigVersion.name(MainActivity.this); }
        @JavascriptInterface public void toast(String m) { runOnUiThread(() -> Toast.makeText(MainActivity.this, m, Toast.LENGTH_SHORT).show()); }
    }
}
