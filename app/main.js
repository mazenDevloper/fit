// مدار / DriveCast for Windows: the live site in its own window (updates arrive without reinstalling).
// Camera, microphone, location and notifications are allowed for the app's own site; other links open in the browser.
const { app, BrowserWindow, shell, session, Menu, globalShortcut, screen, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const cfg = require('./app.json');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
let win, chosen = '';
// «شاشة ويندوز»: the monitors (a virtual one from the free Virtual Display Driver appears here like a real screen)
ipcMain.handle('madar:displays', () => {
  const prim = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => {
    const w = Math.round(d.size.width * d.scaleFactor), h = Math.round(d.size.height * d.scaleFactor);
    return { id: String(d.id), w, h, primary: d.id === prim, ultra: w / h >= 2.3, label: d.label || ('شاشة ' + (i + 1)), chosen: String(d.id) === chosen };
  });
});
ipcMain.handle('madar:choose', (e, id) => { chosen = id; return true; });
ipcMain.handle('madar:vdd', () => shell.openExternal('https://github.com/VirtualDrivers/Virtual-Display-Driver/releases/latest'));
ipcMain.handle('madar:display-settings', () => shell.openExternal('ms-settings:display'));
function create() {
  win = new BrowserWindow({
    width: 1400, height: 900, backgroundColor: '#000000', title: cfg.name, autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') },
  });
  Menu.setApplicationMenu(null);
  const site = new URL(cfg.url).origin;
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    const from = (() => { try { return new URL(details.requestingUrl || wc.getURL()).origin; } catch { return ''; } })();
    cb(cfg.trusted.some(o => from === o) && ['media', 'geolocation', 'notifications', 'fullscreen', 'display-capture', 'clipboard-read', 'clipboard-sanitized-write', 'pointerLock'].includes(perm));
  });
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => cfg.trusted.includes(origin));
  // screen sharing (Madar's «مشاركة الشاشة»): the monitor chosen in Madar (mirror = a real one, extend = the virtual
  // ultra-wide one), else the main screen
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).then(s => {
      const pick = s.find(x => chosen && String(x.display_id) === chosen) || s.find(x => String(x.display_id) === String(screen.getPrimaryDisplay().id)) || s[0];
      cb({ video: pick, audio: 'loopback' });
    }).catch(() => cb({}));
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
