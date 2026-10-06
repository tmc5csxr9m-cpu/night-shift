// Bridge between the page and the desktop shell. Only these calls exist.
const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('app:info');

contextBridge.exposeInMainWorld('native', {
  debugBuild: !!info.debugBuild,
  platform: info.platform,
  version: info.version,
  // synchronous on purpose: a save is a few KB and must be on disk before
  // the next frame (the player may quit at any moment)
  readSave: () => ipcRenderer.sendSync('save:read'),
  writeSave: (text) => ipcRenderer.sendSync('save:write', text),
  setDisplay: (mode) => ipcRenderer.invoke('display:set', mode),
  quit: () => ipcRenderer.send('app:quit'),
  onEscHold: (cb) => ipcRenderer.on('esc-hold', (_e, p) => cb(p)),
});
