// مدار / DriveCast for Windows: the live site in its own window (updates arrive without reinstalling).
// Camera, microphone, location and notifications are allowed for the app's own site; other links open in the browser.
const { app, BrowserWindow, shell, session, Menu, globalShortcut } = require('electron');
const cfg = require('./app.json');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
let win;
function create() {
  win = new BrowserWindow({
    width: 1400, height: 900, backgroundColor: '#000000', title: cfg.name, autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);
  const site = new URL(cfg.url).origin;
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    const from = (() => { try { return new URL(details.requestingUrl || wc.getURL()).origin; } catch { return ''; } })();
    cb(cfg.trusted.some(o => from === o) && ['media', 'geolocation', 'notifications', 'fullscreen', 'display-capture', 'clipboard-read', 'clipboard-sanitized-write', 'pointerLock'].includes(perm));
  });
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => cfg.trusted.includes(origin));
  // screen sharing (Madar's «مشاركة الشاشة»): the whole screen
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    require('electron').desktopCapturer.getSources({ types: ['screen'] }).then(s => cb({ video: s[0], audio: 'loopback' })).catch(() => cb({}));
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { if (cfg.trusted.includes(new URL(url).origin)) return { action: 'allow' }; } catch {}
    shell.openExternal(url); return { action: 'deny' };
  });
  win.once('ready-to-show', () => { win.show(); if (cfg.fullscreen) win.setFullScreen(true); });
  win.loadURL(cfg.url);
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (i.key === 'F5') { win.reload(); e.preventDefault(); }
    if (i.key === 'Escape' && win.isFullScreen()) win.setFullScreen(false);
  });
}
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
