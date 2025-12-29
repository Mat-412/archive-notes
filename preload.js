const { contextBridge, ipcRenderer } = require('electron');

// Whitelist channels the renderer can listen to
const allowedOnChannels = new Set([
  'change-background-color',
  'menu-insert-math-symbols',
  'menu-insert-custom-table',
  'menu-toggle-preview',
  'open-custom-background-modal',
  'menu-export',
  'menu-import'
]);

// Whitelist channels the renderer can invoke
const allowedInvokeChannels = new Set([
  'save-data',
  'load-data',
  'export-notes',
  'import-notes'
]);

contextBridge.exposeInMainWorld('api', {
  on(channel, listener) {
    if (!allowedOnChannels.has(channel)) return;
    const wrapped = (_event, ...args) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  invoke(channel, data) {
    if (!allowedInvokeChannels.has(channel)) {
      return Promise.reject(new Error('Channel not allowed'));
    }
    return ipcRenderer.invoke(channel, data);
  }
});