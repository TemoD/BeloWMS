'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const DB = require('./db');
const Backup = require('./backup');

// Tests and support can point the app at another data folder. Otherwise, if an earlier version (named
// Belo WMS) left a database, keep using that folder so an update never opens an empty database.
if (process.env.BELO_DATA) app.setPath('userData', process.env.BELO_DATA);
else {
  const legacy = path.join(app.getPath('appData'), 'Belo WMS');
  if (fs.existsSync(path.join(legacy, 'belo-wms.db'))) app.setPath('userData', legacy);
}
const SITE = 'https://axiomasoft.ge/';

let win = null;
let dbPath = '';
let dirty = false;      // data changed since the last backup
let quitting = false;

const dataDir = () => app.getPath('userData');
function log(msg) {
  try {
    const dir = path.join(dataDir(), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'app.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* logging must never break the app */ }
}

// After a command only the changed service orders are sent (sosUpsert); the page merges them (apply() in app.js).
function withState(out, delta = true) {
  const st = DB.getState({ delta });
  st.backupOk = !!st.settings.backupDir && fs.existsSync(st.settings.backupDir);
  st.app = { version: app.getVersion(), dbPath, dataDir: dataDir() };
  return { ok: true, ...out, state: st };
}
function errorOut(e) {
  if (e instanceof DB.UserError) return { ok: false, error: e.message };
  log('ERROR ' + (e.stack || e.message));
  const msg = /CHECK constraint/.test(e.message) ? 'ოპერაცია უარყოფილია: უარყოფითი ნაშთი ან არასწორი რაოდენობა' : 'შეცდომა: ' + e.message;
  return { ok: false, error: msg };
}
const handle = (ch, fn) => ipcMain.handle(ch, async (e, ...args) => {
  try { return await fn(...args); } catch (err) { return errorOut(err); }
});

function registerIpc() {
  handle('state', () => withState({}, false));
  handle('cmd', (name, args) => {
    const result = DB.exec(String(name), args);
    // Read-only checks return no state, so no change notice is lost on a reply the page ignores.
    if (String(name).endsWith('.check')) return { ok: true, result };
    dirty = true;
    return withState({ result });
  });
  handle('backup.run', async () => {
    const result = await Backup.run(DB.setting('backupDir'));
    dirty = false;
    return withState({ result });
  });
  handle('backup.list', () => ({ ok: true, result: Backup.list(DB.setting('backupDir')) }));
  handle('backup.chooseDir', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'სარეზერვო საქაღალდე — USB / გარე SSD', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { ok: true, result: null };
    DB.setSetting('backupDir', r.filePaths[0]);
    return withState({ result: r.filePaths[0] });
  });
  handle('backup.restore', async file => {
    let f = file;
    if (!f) {
      const r = await dialog.showOpenDialog(win, { title: 'აირჩიეთ სარეზერვო ასლი', filters: [{ name: 'Axioma WMS', extensions: ['db'] }], properties: ['openFile'] });
      if (r.canceled || !r.filePaths[0]) return { ok: true, result: null };
      f = r.filePaths[0];
    }
    const result = await Backup.restore(f, dbPath, path.join(dataDir(), 'safety'));
    log('restored from ' + f + ', previous data saved to ' + result);
    return withState({ result });
  });
  handle('pdf.save', async name => {
    const r = await dialog.showSaveDialog(win, { title: 'PDF-ად შენახვა', defaultPath: path.join(app.getPath('documents'), String(name || 'document.pdf')), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return { ok: true, result: null };
    const data = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } });
    fs.writeFileSync(r.filePath, data);
    shell.openPath(r.filePath);
    return { ok: true, result: r.filePath };
  });
  // Saves text the page produced (CSV reports and templates); CSV gets a BOM so Excel reads Georgian correctly.
  handle('file.save', async ({ name, content }) => {
    const ext = path.extname(String(name)).slice(1) || 'csv';
    const r = await dialog.showSaveDialog(win, { title: 'შენახვა', defaultPath: path.join(app.getPath('documents'), String(name)), filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (r.canceled || !r.filePath) return { ok: true, result: null };
    fs.writeFileSync(r.filePath, (ext === 'csv' ? '﻿' : '') + String(content), 'utf8');
    return { ok: true, result: r.filePath };
  });
  handle('app.showData', () => { shell.showItemInFolder(dbPath); return { ok: true }; });
  // Only the developer's website can be opened from the page, in the default browser.
  handle('app.openSite', () => { shell.openExternal(SITE); return { ok: true }; });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 640, show: false, title: 'Axioma WMS', backgroundColor: '#f1f4f8', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.once('ready-to-show', () => { if (!process.env.BELO_SMOKE && !process.env.BELO_PERF) win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    fs.mkdirSync(dataDir(), { recursive: true });
    const legacyDb = path.join(dataDir(), 'belo-wms.db');
    dbPath = fs.existsSync(legacyDb) ? legacyDb : path.join(dataDir(), 'axioma-wms.db');
    try { DB.open(dbPath); } catch (e) {
      log('OPEN FAILED ' + (e.stack || e.message));
      dialog.showErrorBox('Axioma WMS', 'მონაცემთა ბაზის გახსნა ვერ მოხერხდა:\n' + e.message);
      app.exit(1); return;
    }
    log('started v' + app.getVersion() + ' db=' + dbPath);
    registerIpc();
    createWindow();
    if (process.env.BELO_SMOKE) require(path.join(__dirname, '..', '..', 'test', 'smoke.js'))(win, { app, DB });
    if (process.env.BELO_PERF) require(path.join(__dirname, '..', '..', 'test', 'perf.js'))(win, { app, DB });
  });
  app.on('window-all-closed', () => app.quit());
  // Automatic backup when the program closes, if a backup drive is connected and something changed.
  app.on('before-quit', e => {
    if (quitting) return;
    quitting = true;
    const dir = DB.setting('backupDir');
    if (dirty && DB.setting('backupSchedule') === 'close' && dir && fs.existsSync(dir)) {
      e.preventDefault();
      Backup.run(dir).then(f => log('auto backup ' + f), err => log('auto backup failed ' + err.message)).finally(() => { DB.close(); app.quit(); });
    } else {
      DB.close();
    }
  });
}
