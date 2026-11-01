// «شاشة ويندوز» for Madar: which monitor to share - the real one (mirror) or a virtual ultra-wide one (extend)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('MadarWin', {
  displays: () => ipcRenderer.invoke('madar:displays'),
  choose: id => ipcRenderer.invoke('madar:choose', String(id || '')),
  installVirtual: () => ipcRenderer.invoke('madar:vdd'),
  displaySettings: () => ipcRenderer.invoke('madar:display-settings'),
});
