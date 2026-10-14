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
public class MainActivity extends Activity implements CaptureService.Listener {
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
        web.onResume();
        immersive();
    }

    @Override
    protected void onPause() {
        super.onPause();
        // While sharing, the page must keep sending this screen even when another app is in front.
        if (!CaptureService.running) web.onPause();
    }

    @Override
    protected void onDestroy() {
        if (CaptureService.listener == this) CaptureService.listener = null;
        if (CaptureService.running) stopService(new Intent(this, CaptureService.class));
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
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
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

    @Override
    public void onFrame(String b64) {
        if (!framePending.compareAndSet(false, true)) return;   // drop frames while the page is busy
        main.post(() -> web.evaluateJavascript("window.__madarFrame&&__madarFrame('" + b64 + "')", v -> framePending.set(false)));
    }

    @Override
    public void onState(String state) {
        main.post(() -> js("window.__madarCapture&&__madarCapture('" + state + "')"));
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
        @JavascriptInterface public void stopCapture() {
            runOnUiThread(() -> { if (CaptureService.running) stopService(new Intent(MainActivity.this, CaptureService.class)); });
        }
        @JavascriptInterface public boolean isCapturing() { return CaptureService.running; }
        @JavascriptInterface public String version() { return BuildConfigVersion.name(MainActivity.this); }
        @JavascriptInterface public void toast(String m) { runOnUiThread(() -> Toast.makeText(MainActivity.this, m, Toast.LENGTH_SHORT).show()); }
    }
}
