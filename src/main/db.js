'use strict';
// Local SQLite database and every business rule of Belo WMS.
// The renderer never writes data itself: it calls exec(name, args) through IPC, and each command runs in one transaction.
const { DatabaseSync } = require('node:sqlite');

class UserError extends Error {}
const fail = msg => { throw new UserError(msg); };

let db = null;
let clock = () => new Date();
const pad = (n, w = 2) => String(n).padStart(w, '0');
function today() { const d = clock(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function nowTs() { const d = clock(); return `${today()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }

/* ---------- schema ---------- */
// Each entry is one migration; never edit an entry that has shipped, append a new one instead.
const MIGRATIONS = [`
CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE warehouses(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE uoms(name TEXT PRIMARY KEY, sort INTEGER NOT NULL DEFAULT 99);
CREATE TABLE suppliers(id TEXT PRIMARY KEY, name TEXT NOT NULL, tin TEXT, phone TEXT, contact TEXT);
CREATE TABLE products(id TEXT PRIMARY KEY, art TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, uom TEXT NOT NULL,
  min_qty REAL NOT NULL DEFAULT 0, avg_cost REAL NOT NULL DEFAULT 0, created_at TEXT);
CREATE TABLE stock(product_id TEXT NOT NULL REFERENCES products(id), wh_id INTEGER NOT NULL REFERENCES warehouses(id),
  qty REAL NOT NULL DEFAULT 0 CHECK(qty >= 0), loc TEXT NOT NULL DEFAULT '', PRIMARY KEY(product_id, wh_id));
CREATE TABLE vehicles(id TEXT PRIMARY KEY, plate TEXT NOT NULL, vin TEXT NOT NULL UNIQUE, make TEXT NOT NULL, model TEXT NOT NULL,
  year INTEGER, km INTEGER NOT NULL DEFAULT 0, dept TEXT);
CREATE TABLE purchase_orders(id TEXT PRIMARY KEY, date TEXT NOT NULL, supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  wh_id INTEGER NOT NULL REFERENCES warehouses(id), note TEXT, created_at TEXT);
CREATE TABLE po_lines(id INTEGER PRIMARY KEY, po_id TEXT NOT NULL REFERENCES purchase_orders(id), product_id TEXT NOT NULL REFERENCES products(id),
  qty REAL NOT NULL CHECK(qty > 0), price REAL NOT NULL CHECK(price >= 0));
CREATE TABLE service_orders(id TEXT PRIMARY KEY, date TEXT NOT NULL, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), resp TEXT NOT NULL,
  km INTEGER, status TEXT NOT NULL CHECK(status IN ('open','closed','auto')), closed_at TEXT, last_change TEXT NOT NULL);
CREATE TABLE so_parts(id INTEGER PRIMARY KEY, so_id TEXT NOT NULL REFERENCES service_orders(id), product_id TEXT NOT NULL REFERENCES products(id),
  wh_id INTEGER NOT NULL, qty REAL NOT NULL CHECK(qty > 0), ret REAL NOT NULL DEFAULT 0, price REAL NOT NULL, CHECK(ret >= 0 AND ret <= qty));
CREATE TABLE so_services(id INTEGER PRIMARY KEY, so_id TEXT NOT NULL REFERENCES service_orders(id), name TEXT NOT NULL, price REAL);
CREATE TABLE catalog(model TEXT NOT NULL, product_id TEXT NOT NULL REFERENCES products(id), PRIMARY KEY(model, product_id));
CREATE TABLE moves(id INTEGER PRIMARY KEY, ts TEXT NOT NULL, date TEXT NOT NULL, type TEXT NOT NULL, ref TEXT NOT NULL,
  product_id TEXT NOT NULL, qty REAL NOT NULL, wh_id INTEGER NOT NULL, to_wh INTEGER, note TEXT);
CREATE TABLE transfers(id TEXT PRIMARY KEY, date TEXT NOT NULL, product_id TEXT NOT NULL REFERENCES products(id),
  from_wh INTEGER NOT NULL, to_wh INTEGER NOT NULL, qty REAL NOT NULL CHECK(qty > 0));
CREATE INDEX ix_moves_product ON moves(product_id);
CREATE INDEX ix_so_vehicle ON service_orders(vehicle_id);
CREATE INDEX ix_parts_so ON so_parts(so_id);
CREATE INDEX ix_lines_po ON po_lines(po_id);
INSERT INTO warehouses VALUES (1,'მთავარი საწყობი'),(2,'საწყობი №2');
INSERT INTO uoms VALUES ('ცალი',1),('ლიტრი',2),('კომპლექტი',3),('მეტრი',4),('კგ',5);
INSERT INTO settings VALUES ('autoClose','7'),('wh2','0'),('backupSchedule','close'),('backupDir',''),('lastBackup',''),
  ('company','{}'),('racks','{}'),('setupDone','0');
`];

/* ---------- low-level helpers ---------- */
const run = (sql, ...a) => db.prepare(sql).run(...a);
const get = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
const groupBy = (rows, key) => { const m = new Map(); rows.forEach(r => { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); }); return m; };

function open(file) {
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  db.exec('CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT)');
  const v = +(get("SELECT value FROM meta WHERE key='schema'")?.value || 0);
  if (v > MIGRATIONS.length) fail('ბაზა შექმნილია პროგრამის უფრო ახალი ვერსიით — განაახლეთ Belo WMS');
  MIGRATIONS.slice(v).forEach((sql, i) => tx(() => { db.exec(sql); run("INSERT OR REPLACE INTO meta VALUES('schema',?)", String(v + i + 1)); }));
  return db;
}
function close() { if (db) { db.close(); db = null; } }
const handle = () => db;

function setting(k) { return get('SELECT value FROM settings WHERE key=?', k)?.value ?? null; }
function setSetting(k, v) { run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, String(v)); }

// Next document number such as SO-2026-0001; ordering by length keeps 10000 after 9999.
function nextNo(table, prefix, width = 4) {
  const r = get(`SELECT id FROM ${table} WHERE id LIKE ? ORDER BY length(id) DESC, id DESC LIMIT 1`, prefix + '%');
  return prefix + pad(r ? +r.id.slice(prefix.length) + 1 : 1, width);
}

/* ---------- validation helpers ---------- */
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const num = v => (typeof v === 'number' ? v : String(v ?? '').trim() === '' ? NaN : +String(v).trim().replace(',', '.'));
const r4 = n => Math.round(n * 1e4) / 1e4;
const LOC_RE = /^[A-Z]-\d{2}-\d{2}$/;
function normLoc(v) {
  const s = str(v, 20).toUpperCase();
  if (s && !LOC_RE.test(s)) fail('ლოკაციის ფორმატი: რიგი-თარო-უჯრა, მაგ. A-01-02');
  return s;
}
const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
function whOk(w) {
  w = +w;
  if (w !== 1 && w !== 2) fail('უცნობი საწყობი');
  if (w === 2 && setting('wh2') !== '1') fail('მეორე საწყობი გამორთულია');
  return w;
}
function product(id) { return get('SELECT * FROM products WHERE id=?', id) || fail('პროდუქტი ვერ მოიძებნა'); }
function openSO(id) {
  const o = get('SELECT * FROM service_orders WHERE id=?', id) || fail('ორდერი ვერ მოიძებნა');
  if (o.status !== 'open') fail('ორდერი დახურულია — ცვლილებისთვის ჯერ გახსენით ხელახლა');
  return o;
}
const touch = id => run('UPDATE service_orders SET last_change=? WHERE id=?', today(), id);
const ensureStock = (pid, wh) => run('INSERT OR IGNORE INTO stock(product_id,wh_id) VALUES(?,?)', pid, wh);
const stockQty = (pid, wh) => get('SELECT qty FROM stock WHERE product_id=? AND wh_id=?', pid, wh)?.qty || 0;
function addStock(pid, wh, delta) {
  ensureStock(pid, wh);
  const q = r4(stockQty(pid, wh) + delta);
  if (q < 0) { const p = product(pid); fail(`არასაკმარისი ნაშთი: ${p.name} — ხელმისაწვდომია ${r4(q - delta)} ${p.uom}. უარყოფითი ნაშთი დაუშვებელია.`); }
  run('UPDATE stock SET qty=? WHERE product_id=? AND wh_id=?', q, pid, wh);
  return q;
}
function move(type, ref, pid, qty, wh, to = null, note = null) {
  run('INSERT INTO moves(ts,date,type,ref,product_id,qty,wh_id,to_wh,note) VALUES(?,?,?,?,?,?,?,?,?)', nowTs(), today(), type, ref, pid, qty, wh, to, note);
}

/* ---------- auto-close and state ---------- */
// Open service orders close automatically N days after their last change.
function autoClose() {
  const n = +setting('autoClose') || 7;
  return run(`UPDATE service_orders SET status='auto', closed_at=date(last_change, '+' || ? || ' days')
    WHERE status='open' AND julianday(?) - julianday(last_change) >= ?`, n, today(), n).changes;
}

function getState() {
  autoClose();
  const s = Object.fromEntries(all('SELECT key,value FROM settings').map(r => [r.key, r.value]));
  const st = {
    today: today(),
    settings: {
      wh2: s.wh2 === '1', autoClose: +s.autoClose || 7, backupDir: s.backupDir || '', backupSchedule: s.backupSchedule || 'close',
      lastBackup: s.lastBackup || '', setupDone: s.setupDone === '1', company: JSON.parse(s.company || '{}'), racks: JSON.parse(s.racks || '{}')
    },
    wh: Object.fromEntries(all('SELECT id,name FROM warehouses').map(r => [r.id, r.name])),
    uoms: all('SELECT name FROM uoms ORDER BY sort,name').map(r => r.name),
    suppliers: all('SELECT id,name,tin,phone,contact FROM suppliers ORDER BY id').map(r => ({ ...r })),
    vehicles: all('SELECT id,plate,vin,make,model,year,km,dept FROM vehicles ORDER BY id').map(r => ({ ...r }))
  };
  st.products = all('SELECT * FROM products ORDER BY id').map(p => ({
    id: p.id, art: p.art, name: p.name, uom: p.uom, min: p.min_qty, cost: p.avg_cost, stock: { 1: { q: 0, loc: '' }, 2: { q: 0, loc: '' } }
  }));
  const pm = new Map(st.products.map(p => [p.id, p]));
  all('SELECT * FROM stock').forEach(r => { const p = pm.get(r.product_id); if (p) p.stock[r.wh_id] = { q: r.qty, loc: r.loc }; });
  const lines = groupBy(all('SELECT * FROM po_lines ORDER BY id'), 'po_id');
  st.pos = all('SELECT * FROM purchase_orders ORDER BY date DESC, id DESC').map(o => ({
    id: o.id, date: o.date, sup: o.supplier_id, wh: o.wh_id, note: o.note,
    lines: (lines.get(o.id) || []).map(l => ({ pid: l.product_id, qty: l.qty, price: l.price }))
  }));
  const parts = groupBy(all('SELECT * FROM so_parts ORDER BY id'), 'so_id');
  const svcs = groupBy(all('SELECT * FROM so_services ORDER BY id'), 'so_id');
  st.sos = all('SELECT * FROM service_orders ORDER BY date DESC, id DESC').map(o => ({
    id: o.id, date: o.date, vid: o.vehicle_id, resp: o.resp, km: o.km, status: o.status, closedAt: o.closed_at, lastChange: o.last_change,
    parts: (parts.get(o.id) || []).map(l => ({ lid: l.id, pid: l.product_id, wh: l.wh_id, qty: l.qty, ret: l.ret, price: l.price })),
    svcs: (svcs.get(o.id) || []).map(x => ({ sid: x.id, name: x.name, price: x.price }))
  }));
  st.catalog = all('SELECT model, product_id AS pid FROM catalog').map(r => ({ ...r }));
  st.moves = all('SELECT date,type,ref,product_id AS pid,qty,wh_id AS wh,to_wh AS "to",note FROM moves ORDER BY id DESC LIMIT 500').map(r => ({ ...r }));
  st.transfers = all('SELECT id,date,product_id AS pid,from_wh AS "from",to_wh AS "to",qty FROM transfers ORDER BY rowid DESC LIMIT 50').map(r => ({ ...r }));
  return st;
}

/* ---------- CSV import rules (used for the preview and again when applying) ---------- */
const IMPORT_COLS = {
  products: ['art', 'name', 'uom', 'min', 'cost', 'qty', 'loc'],
  vehicles: ['plate', 'vin', 'make', 'model', 'year', 'km', 'dept'],
  stock: ['art', 'qty', 'cost', 'loc', 'wh']
};
const okNum = (v, min = 0) => str(v) === '' || num(v) >= min;
function importCheck(type, rows) {
  const seen = new Set();
  return rows.map(raw => {
    const c = IMPORT_COLS[type].map((_, i) => str(raw[i]));
    const e = []; let st = 'new';
    if (type === 'products') {
      const [art, name, uom, min, cost, qty, loc] = c;
      if (!art) e.push('არტიკული ცარიელია');
      if (!name) e.push('დასახელება ცარიელია');
      if (uom && !get('SELECT 1 FROM uoms WHERE name=?', uom)) e.push(`უცნობი ერთეული „${uom}“`);
      if (![min, cost, qty].every(v => okNum(v))) e.push('რიცხვი არასწორია');
      if (loc && !LOC_RE.test(loc.toUpperCase())) e.push('ლოკაციის ფორმატი: A-01-02');
      if (art && seen.has(art.toUpperCase())) e.push('არტიკული მეორდება ფაილში');
      seen.add(art.toUpperCase());
      if (art && get('SELECT 1 FROM products WHERE art=?', art)) st = 'upd';
    } else if (type === 'vehicles') {
      const [plate, vin, make, model, year, km] = c;
      const V = vin.toUpperCase();
      if (!plate) e.push('ნომერი ცარიელია');
      if (V.length !== 17 || /[IOQ]/.test(V)) e.push('VIN: 17 სიმბოლო, I/O/Q გარეშე');
      if (!make || !model) e.push('მარკა / მოდელი ცარიელია');
      if (![year, km].every(v => okNum(v))) e.push('რიცხვი არასწორია');
      if (V && seen.has(V)) e.push('VIN მეორდება ფაილში');
      seen.add(V);
      if (V && get('SELECT 1 FROM vehicles WHERE vin=?', V)) st = 'upd';
    } else if (type === 'stock') {
      const [art, qty, cost, loc, wh] = c;
      st = 'upd';
      if (!get('SELECT 1 FROM products WHERE art=?', art)) e.push('პროდუქტი ვერ მოიძებნა');
      if (qty === '' || !okNum(qty)) e.push('რაოდენობა არასწორია');
      if (!okNum(cost)) e.push('ღირებულება არასწორია');
      if (loc && !LOC_RE.test(loc.toUpperCase())) e.push('ლოკაციის ფორმატი: A-01-02');
      const w = wh === '' ? 1 : +wh;
      if (w !== 1 && w !== 2) e.push('საწყობი: 1 ან 2');
      else if (w === 2 && setting('wh2') !== '1') e.push('მეორე საწყობი გამორთულია');
    } else fail('უცნობი იმპორტის ტიპი');
    return { c, st: e.length ? 'err' : st, msg: e.join('; ') };
  });
}

/* ---------- commands ---------- */
const commands = {
  'setup.complete'({ company, whName }) {
    commands['company.save']({ company });
    if (str(whName)) run('UPDATE warehouses SET name=? WHERE id=1', str(whName, 80));
    setSetting('setupDone', '1');
  },
  'company.save'({ company = {} }) {
    const c = { name: str(company.name, 150), tin: str(company.tin, 30), address: str(company.address, 200), phone: str(company.phone, 50), logo: '' };
    if (!c.name) fail('შეიყვანეთ კომპანიის დასახელება');
    const logo = String(company.logo || '');
    if (logo) {
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(logo)) fail('ლოგო უნდა იყოს PNG, JPG ან WEBP');
      if (logo.length > 700000) fail('ლოგო ძალიან დიდია (მაქს. ~500 KB)');
      c.logo = logo;
    }
    setSetting('company', JSON.stringify(c));
  },
  'settings.set'({ key, value }) {
    switch (key) {
      case 'wh2':
        if (!value && get('SELECT 1 FROM stock WHERE wh_id=2 AND qty>0')) fail('მეორე საწყობში ნაშთია — გამორთვამდე გადაიტანეთ მთავარ საწყობში');
        setSetting('wh2', value ? '1' : '0'); break;
      case 'autoClose': {
        const n = Math.round(num(value));
        if (!(n >= 1 && n <= 365)) fail('ვადა უნდა იყოს 1–365 დღე');
        setSetting('autoClose', n); return autoClose();
      }
      case 'backupSchedule':
        if (!['close', 'manual'].includes(value)) fail('უცნობი განრიგი');
        setSetting(key, value); break;
      case 'wh1Name': case 'wh2Name': {
        const n = str(value, 80);
        if (!n) fail('შეიყვანეთ საწყობის დასახელება');
        run('UPDATE warehouses SET name=? WHERE id=?', n, key === 'wh1Name' ? 1 : 2); break;
      }
      case 'rackName': {
        const r = JSON.parse(setting('racks') || '{}'), row = str(value?.row, 1).toUpperCase();
        if (!/^[A-Z]$/.test(row)) fail('რიგი უნდა იყოს ერთი ლათინური ასო');
        if (str(value?.name)) r[row] = str(value.name, 60); else delete r[row];
        setSetting('racks', JSON.stringify(r)); break;
      }
      default: fail('უცნობი პარამეტრი');
    }
  },
  'uom.add'({ name }) {
    const n = str(name, 30);
    if (!n) fail('შეიყვანეთ ზომის ერთეული');
    if (get('SELECT 1 FROM uoms WHERE name=?', n)) fail('ასეთი ერთეული უკვე არსებობს');
    run('INSERT INTO uoms VALUES(?,99)', n);
  },
  'supplier.save'({ id, name, tin, phone, contact }) {
    const n = str(name, 150);
    if (!n) fail('შეიყვანეთ მომწოდებლის დასახელება');
    if (id) {
      if (!get('SELECT 1 FROM suppliers WHERE id=?', id)) fail('მომწოდებელი ვერ მოიძებნა');
      run('UPDATE suppliers SET name=?,tin=?,phone=?,contact=? WHERE id=?', n, str(tin, 30), str(phone, 50), str(contact, 100), id);
      return id;
    }
    const nid = nextNo('suppliers', 'S-', 3);
    run('INSERT INTO suppliers VALUES(?,?,?,?,?)', nid, n, str(tin, 30), str(phone, 50), str(contact, 100));
    return nid;
  },
  'product.save'({ id, art, name, uom, min, cost, locs }) {
    const a = str(art, 60), n = str(name), u = str(uom, 30) || 'ცალი', mn = str(min) === '' ? 0 : num(min);
    if (!a || !n) fail('შეავსეთ არტიკული და დასახელება');
    if (!get('SELECT 1 FROM uoms WHERE name=?', u)) fail('უცნობი ზომის ერთეული');
    if (!(mn >= 0)) fail('მინიმალური ნაშთი არასწორია');
    const dup = get('SELECT id FROM products WHERE art=? AND id<>?', a, id || '');
    if (dup) fail(`არტიკული ${a} უკვე არსებობს (${dup.id})`);
    let pid = id;
    if (id) {
      product(id);
      run('UPDATE products SET art=?,name=?,uom=?,min_qty=? WHERE id=?', a, n, u, mn, id);
    } else {
      const c = str(cost) === '' ? 0 : num(cost);
      if (!(c >= 0)) fail('ღირებულება არასწორია');
      pid = nextNo('products', 'P-', 5);
      run('INSERT INTO products(id,art,name,uom,min_qty,avg_cost,created_at) VALUES(?,?,?,?,?,?,?)', pid, a, n, u, mn, c, nowTs());
      ensureStock(pid, 1); ensureStock(pid, 2);
    }
    for (const [w, l] of Object.entries(locs || {})) {
      if (+w !== 1 && +w !== 2) continue;
      ensureStock(pid, +w);
      run('UPDATE stock SET loc=? WHERE product_id=? AND wh_id=?', normLoc(l), pid, +w);
    }
    return pid;
  },
  'vehicle.save'({ id, plate, vin, make, model, year, km, dept }) {
    const pl = str(plate, 20).toUpperCase(), v = str(vin, 30).toUpperCase(), mk = str(make, 60), md = str(model, 60);
    if (!pl || !mk || !md) fail('შეავსეთ სახელმწიფო ნომერი, მარკა და მოდელი');
    if (v.length !== 17 || /[IOQ]/.test(v)) fail('VIN კოდი უნდა იყოს 17 სიმბოლო (I, O, Q გარეშე)');
    const dup = get('SELECT id FROM vehicles WHERE vin=? AND id<>?', v, id || '');
    if (dup) fail('ეს VIN უკვე რეესტრშია (' + dup.id + ')');
    const y = str(year) === '' ? null : Math.round(num(year)), k = str(km) === '' ? 0 : Math.round(num(km));
    if (y !== null && !(y >= 1950 && y <= 2100)) fail('წელი არასწორია');
    if (!(k >= 0)) fail('გარბენი არასწორია');
    if (id) {
      if (!get('SELECT 1 FROM vehicles WHERE id=?', id)) fail('ტექნიკა ვერ მოიძებნა');
      run('UPDATE vehicles SET plate=?,vin=?,make=?,model=?,year=?,km=?,dept=? WHERE id=?', pl, v, mk, md, y, k, str(dept, 80), id);
      return id;
    }
    const nid = nextNo('vehicles', 'V-', 4);
    run('INSERT INTO vehicles VALUES(?,?,?,?,?,?,?,?)', nid, pl, v, mk, md, y, k, str(dept, 80));
    return nid;
  },
  // Saving a purchase order puts the goods in stock immediately and updates the weighted average cost.
  'po.create'({ sup, date, wh, note, lines }) {
    if (!get('SELECT 1 FROM suppliers WHERE id=?', sup)) fail('აირჩიეთ მომწოდებელი');
    const w = whOk(wh || 1), d = isDate(date) ? date : today();
    const ls = (lines || []).filter(l => l && l.pid);
    if (!ls.length) fail('დაამატეთ მინიმუმ ერთი პოზიცია');
    const id = nextNo('purchase_orders', `PO-${d.slice(0, 4)}-`);
    run('INSERT INTO purchase_orders VALUES(?,?,?,?,?,?)', id, d, sup, w, str(note, 500), nowTs());
    for (const l of ls) {
      const p = product(l.pid), q = num(l.qty), pr = num(l.price);
      if (!(q > 0)) fail(`რაოდენობა უნდა იყოს 0-ზე მეტი: ${p.name}`);
      if (!(pr >= 0)) fail(`მიუთითეთ ფასი: ${p.name}`);
      const cur = product(p.id), total = get('SELECT COALESCE(SUM(qty),0) AS t FROM stock WHERE product_id=?', p.id).t;
      run('UPDATE products SET avg_cost=? WHERE id=?', r4((cur.avg_cost * total + q * pr) / (total + q)), p.id);
      run('INSERT INTO po_lines(po_id,product_id,qty,price) VALUES(?,?,?,?)', id, p.id, q, pr);
      addStock(p.id, w, q);
      move('in', id, p.id, q, w);
    }
    return id;
  },
  'so.create'({ vid, resp, km }) {
    const v = get('SELECT * FROM vehicles WHERE id=?', vid) || fail('აირჩიეთ ტექნიკა');
    const r = str(resp, 120);
    if (!r) fail('შეიყვანეთ პასუხისმგებელი პირი');
    const k = str(km) === '' ? v.km : Math.round(num(km));
    if (!(k >= 0)) fail('გარბენი არასწორია');
    const t = today(), id = nextNo('service_orders', `SO-${t.slice(0, 4)}-`);
    run("INSERT INTO service_orders(id,date,vehicle_id,resp,km,status,last_change) VALUES(?,?,?,?,?,'open',?)", id, t, vid, r, k, t);
    if (k > v.km) run('UPDATE vehicles SET km=? WHERE id=?', k, vid);
    return id;
  },
  'so.update'({ id, resp, km }) {
    const o = openSO(id);
    if (resp !== undefined) { const r = str(resp, 120); if (!r) fail('შეიყვანეთ პასუხისმგებელი პირი'); run('UPDATE service_orders SET resp=? WHERE id=?', r, id); }
    if (km !== undefined) {
      const k = Math.round(num(km));
      if (!(k >= 0)) fail('გარბენი არასწორია');
      run('UPDATE service_orders SET km=? WHERE id=?', k, id);
      run('UPDATE vehicles SET km=MAX(km,?) WHERE id=?', k, o.vehicle_id);
    }
    touch(id);
  },
  'so.issue'({ id, pid, wh, qty }) {
    openSO(id);
    const p = product(pid), w = whOk(wh || 1), q = num(qty);
    if (!(q > 0)) fail('რაოდენობა უნდა იყოს 0-ზე მეტი');
    addStock(p.id, w, -q);
    run('INSERT INTO so_parts(so_id,product_id,wh_id,qty,ret,price) VALUES(?,?,?,?,0,?)', id, p.id, w, q, p.avg_cost);
    move('out', id, p.id, q, w);
    touch(id);
  },
  'so.return'({ id, lid, qty, reason }) {
    openSO(id);
    const l = get('SELECT * FROM so_parts WHERE id=? AND so_id=?', lid, id) || fail('ხაზი ვერ მოიძებნა');
    const q = num(qty), net = r4(l.qty - l.ret);
    if (!(q > 0) || q > net) fail(`დასაბრუნებელი რაოდენობა: 0-დან ${net}-მდე`);
    run('UPDATE so_parts SET ret=? WHERE id=?', r4(l.ret + q), lid);
    addStock(l.product_id, l.wh_id, q);
    move('ret', id, l.product_id, q, l.wh_id, null, str(reason, 100) || null);
    touch(id);
  },
  'so.addService'({ id, name, price }) {
    openSO(id);
    const n = str(name, 150), pr = str(price) === '' ? null : num(price);
    if (!n) fail('შეიყვანეთ მომსახურების დასახელება');
    if (pr !== null && !(pr >= 0)) fail('ფასი არასწორია');
    run('INSERT INTO so_services(so_id,name,price) VALUES(?,?,?)', id, n, pr);
    touch(id);
  },
  'so.delService'({ id, sid }) {
    openSO(id);
    run('DELETE FROM so_services WHERE id=? AND so_id=?', sid, id);
    touch(id);
  },
  'so.close'({ id }) {
    openSO(id);
    run("UPDATE service_orders SET status='closed', closed_at=?, last_change=? WHERE id=?", today(), today(), id);
  },
  'so.reopen'({ id }) {
    const o = get('SELECT * FROM service_orders WHERE id=?', id) || fail('ორდერი ვერ მოიძებნა');
    if (o.status === 'open') fail('ორდერი უკვე ღიაა');
    run("UPDATE service_orders SET status='open', closed_at=NULL, last_change=? WHERE id=?", today(), id);
  },
  'transfer.create'({ pid, from, qty, loc }) {
    if (setting('wh2') !== '1') fail('ჯერ ჩართეთ მეორე საწყობი პარამეტრებში');
    const p = product(pid), f = whOk(from), t = f === 1 ? 2 : 1, q = num(qty), l = normLoc(loc);
    if (!(q > 0)) fail('რაოდენობა უნდა იყოს 0-ზე მეტი');
    addStock(p.id, f, -q);
    addStock(p.id, t, q);
    if (l) run('UPDATE stock SET loc=? WHERE product_id=? AND wh_id=?', l, p.id, t);
    const id = nextNo('transfers', `TR-${today().slice(0, 4)}-`);
    run('INSERT INTO transfers VALUES(?,?,?,?,?,?)', id, today(), p.id, f, t, q);
    move('tr', id, p.id, q, f, t);
    return id;
  },
  'location.assign'({ pid, wh, loc }) {
    product(pid);
    const w = +wh, l = normLoc(loc);
    if (w !== 1 && w !== 2) fail('უცნობი საწყობი');
    if (!l) fail('მიუთითეთ ლოკაცია');
    ensureStock(pid, w);
    run('UPDATE stock SET loc=? WHERE product_id=? AND wh_id=?', l, pid, w);
  },
  'catalog.toggle'({ model, pid }) {
    product(pid);
    const m = str(model, 130);
    if (!m) fail('მოდელი ცარიელია');
    if (get('SELECT 1 FROM catalog WHERE model=? AND product_id=?', m, pid)) { run('DELETE FROM catalog WHERE model=? AND product_id=?', m, pid); return false; }
    run('INSERT INTO catalog VALUES(?,?)', m, pid);
    return true;
  },
  // Confirms in the catalog every product issued on the same model in two or more service orders.
  'catalog.learn'() {
    return run(`INSERT OR IGNORE INTO catalog(model, product_id)
      SELECT v.make || ' ' || v.model, p.product_id FROM so_parts p
      JOIN service_orders o ON o.id = p.so_id JOIN vehicles v ON v.id = o.vehicle_id
      WHERE p.qty - p.ret > 0 GROUP BY v.make || ' ' || v.model, p.product_id HAVING COUNT(DISTINCT o.id) >= 2`).changes;
  },
  'import.check'({ type, rows }) { return importCheck(type, rows || []); },
  'import.apply'({ type, rows }) {
    let n = 0, u = 0, skipped = 0;
    importCheck(type, rows || []).forEach(({ c, st }) => {
      if (st === 'err') { skipped++; return; }
      if (type === 'products') {
        const [art, name, uom, min, cost, qty, loc] = c;
        const p = get('SELECT * FROM products WHERE art=?', art);
        if (p) {
          run('UPDATE products SET name=?,uom=?,min_qty=? WHERE id=?', name, uom || p.uom, min === '' ? p.min_qty : num(min), p.id);
          if (loc) commands['location.assign']({ pid: p.id, wh: 1, loc });
          u++;
        } else {
          const pid = commands['product.save']({ art, name, uom: uom || 'ცალი', min, cost, locs: { 1: loc } });
          if (num(qty) > 0) { addStock(pid, 1, num(qty)); move('imp', 'იმპორტი', pid, num(qty), 1, null, 'CSV'); }
          n++;
        }
      } else if (type === 'vehicles') {
        const [plate, vin, make, model, year, km, dept] = c;
        const v = get('SELECT * FROM vehicles WHERE vin=?', vin.toUpperCase());
        if (v) { run('UPDATE vehicles SET plate=?,km=MAX(km,?),dept=? WHERE id=?', plate.toUpperCase(), str(km) === '' ? 0 : Math.round(num(km)), dept || v.dept, v.id); u++; }
        else { commands['vehicle.save']({ plate, vin, make, model, year, km, dept }); n++; }
      } else {
        const [art, qty, cost, loc, wh] = c;
        const p = get('SELECT * FROM products WHERE art=?', art), w = wh === '' ? 1 : +wh, q = num(qty);
        addStock(p.id, w, r4(q - stockQty(p.id, w)));
        if (cost !== '') run('UPDATE products SET avg_cost=? WHERE id=?', num(cost), p.id);
        if (loc) commands['location.assign']({ pid: p.id, wh: w, loc });
        move('imp', 'იმპორტი', p.id, q, w, null, 'საწყისი ნაშთი');
        u++;
      }
    });
    return { n, u, skipped };
  }
};

function exec(name, args) {
  const f = commands[name];
  if (!f) fail('უცნობი ბრძანება: ' + name);
  return tx(() => f(args || {}));
}

module.exports = { open, close, handle, exec, getState, setting, setSetting, today, nowTs, UserError, IMPORT_COLS,
  setClock: fn => { clock = fn; } };
