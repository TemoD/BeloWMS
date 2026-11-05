'use strict';
// The only bridge between the page and the main process: a fixed list of IPC channels.
const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = ['state', 'cmd', 'backup.run', 'backup.list', 'backup.chooseDir', 'backup.restore', 'pdf.save', 'file.save', 'app.showData', 'app.openSite'];

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...args) => CHANNELS.includes(channel) ? ipcRenderer.invoke(channel, ...args) : Promise.resolve({ ok: false, error: 'unknown channel' })
});
