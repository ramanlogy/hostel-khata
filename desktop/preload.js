// Gives the page a small, safe API for saving data. No other Node access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hkNative', {
  load: () => ipcRenderer.sendSync('hk:load'),
  save: text => {
    const r = ipcRenderer.sendSync('hk:save', text);
    if (!r || !r.ok) throw new Error(r && r.error || 'save failed');
  },
  dataDir: () => ipcRenderer.sendSync('hk:dir'),
  keepCopy: tag => ipcRenderer.sendSync('hk:keep', String(tag)),
  exportBackup: (name, text) => ipcRenderer.invoke('hk:export', name, text),
  importBackup: () => ipcRenderer.invoke('hk:import'),
  openDataFolder: () => ipcRenderer.invoke('hk:folder'),
});
