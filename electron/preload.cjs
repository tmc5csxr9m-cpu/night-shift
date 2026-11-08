// Bridge between the page and the desktop shell. Only these calls exist.
const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('app:info');

contextBridge.exposeInMainWorld('native', {
  debugBuild: !!info.debugBuild,
  channel: info.channel === 'dev' ? 'dev' : 'release',
  platform: info.platform,
  version: info.version,
  // synchronous on purpose: a save is a few KB and must be on disk before
  // the next frame (the player may quit at any moment)
  readSave: () => ipcRenderer.sendSync('save:read'),
  writeSave: (text, opts) => ipcRenderer.sendSync('save:write', text, { keepBackup: !!opts?.keepBackup }),
  setDisplay: (mode) => ipcRenderer.invoke('display:set', mode),
  quit: () => ipcRenderer.send('app:quit'),
  onEscHold: (cb) => ipcRenderer.on('esc-hold', (_e, p) => cb(p)),
  onEscLong: (cb) => ipcRenderer.on('esc-long', () => cb()),
});
