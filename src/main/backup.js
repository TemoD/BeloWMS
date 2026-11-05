'use strict';
// Backups are full SQLite copies written to a folder the user picks (normally on a USB stick or external SSD).
const fs = require('node:fs');
const path = require('node:path');
const sqlite = require('node:sqlite');
const DB = require('./db');

const KEEP = 60; // newest backups kept in the folder
const NAME_RE = /^(Axioma|Belo)WMS_\d{4}-\d{2}-\d{2}_\d{6}(_\d+)?\.db$/; // Belo… = backups from versions before 1.2.0
const pad = n => String(n).padStart(2, '0');
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function verify(file) {
  let d;
  try { d = new sqlite.DatabaseSync(file, { readOnly: true }); } catch { throw new DB.UserError('ფაილი ვერ გაიხსნა — ეს არ არის Axioma WMS-ის ბაზა'); }
  try {
    const ok = Object.values(d.prepare('PRAGMA integrity_check').get())[0] === 'ok';
    const ours = d.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='service_orders'").get();
    if (!ok || !ours) throw new DB.UserError('ფაილი დაზიანებულია ან არ არის Axioma WMS-ის ბაზა');
  } finally { d.close(); }
}

// The copy inherits WAL mode; switching it to a single-file journal leaves no -wal/-shm files on the drive.
function selfContained(file) {
  const d = new sqlite.DatabaseSync(file);
  try { d.exec('PRAGMA journal_mode=DELETE'); } finally { d.close(); }
}

function list(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => NAME_RE.test(f)).map(f => {
    const s = fs.statSync(path.join(dir, f));
    return { file: path.join(dir, f), name: f, size: s.size, mtime: s.mtimeMs };
  }).sort((a, b) => b.mtime - a.mtime);
}

async function run(dir) {
  if (!dir) throw new DB.UserError('ჯერ აირჩიეთ სარეზერვო საქაღალდე (USB / SSD) პარამეტრებში');
  if (!fs.existsSync(dir)) throw new DB.UserError('სარეზერვო დისკი არ არის მიერთებული: ' + dir);
  const base = `AxiomaWMS_${stamp()}`;
  let file = path.join(dir, base + '.db');
  for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${base}_${i}.db`);
  await sqlite.backup(DB.handle(), file);
  selfContained(file);
  verify(file);
  list(dir).slice(KEEP).forEach(b => fs.rmSync(b.file, { force: true }));
  DB.setSetting('lastBackup', JSON.stringify({ at: DB.nowTs(), file }));
  return file;
}

// Restores a backup over the live database; the current data is saved to safetyDir first.
async function restore(file, dbPath, safetyDir) {
  verify(file);
  fs.mkdirSync(safetyDir, { recursive: true });
  const safety = path.join(safetyDir, `AxiomaWMS_before-restore_${stamp()}.db`);
  await sqlite.backup(DB.handle(), safety);
  selfContained(safety);
  const tmp = dbPath + '.restore';
  fs.copyFileSync(file, tmp);
  DB.close();
  for (const ext of ['-wal', '-shm']) fs.rmSync(dbPath + ext, { force: true });
  fs.renameSync(tmp, dbPath);
  DB.open(dbPath);
  return safety;
}

module.exports = { run, list, restore, verify };
