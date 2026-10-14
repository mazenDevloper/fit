# Madar for Android

The مدار / Madar web app (https://mazendevloper.github.io/fit/) as a full-screen Android app,
plus real **"Share this device's screen"** (MediaProjection) with the 6-digit code — something
Android browsers can't do.

Every push to this branch builds `Madar.apk` with GitHub Actions and publishes it at:
https://github.com/mazenDevloper/fit/releases/download/android-latest/Madar.apk

- `MainActivity` — WebView with camera/mic permissions, file picker, fullscreen video, immersive mode,
  controller/mouse/keyboard input, and the `window.MadarAndroid` bridge.
- `CaptureService` — foreground service that captures the screen and pushes JPEG frames to the page
  (`__madarFrame`), which turns them into a WebRTC video track (see `js/mirror.js` on `gh-pages`).
