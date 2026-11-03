'use strict';
// Load test: simulates a year of daily work on a real database file through the same commands the app uses,
// keeps an independent "shadow" model of stock, cost and order status, and compares the two at the end.
// Run: node test/load.js <output-dir>   (writes load.db, report.json)
const fs = require('node:fs');
const path = require('node:path');
const DB = require('../src/main/db');
const Backup = require('../src/main/backup');

const OUT = path.resolve(process.argv[2] || '.load');
fs.mkdirSync(OUT, { recursive: true });
const DBFILE = path.join(OUT, 'load.db');
for (const f of [DBFILE, DBFILE + '-wal', DBFILE + '-shm']) fs.rmSync(f, { force: true });

/* ---------- deterministic randomness and clock ---------- */
let seed = 20261103;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
const chance = p => rnd() < p;
const r4 = n => Math.round(n * 1e4) / 1e4;
// LOAD_YEARS=3 simulates three years ending today (2026-11-02).
const YEARS = +process.env.LOAD_YEARS || 1;
let now = new Date(2026 - YEARS, 10, 3, 9, 0, 0);
DB.setClock(() => now);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

/* ---------- measurement ---------- */
const T = {};
const stats = { ok: {}, rejected: {}, expectedRejections: 0, unexpectedRejections: [], wronglyAccepted: [], crashes: [] };
const ms = t0 => Number(process.hrtime.bigint() - t0) / 1e6;
function timed(name, fn) { const t0 = process.hrtime.bigint(); try { return fn(); } finally { (T[name] ??= []).push(ms(t0)); } }
async function timedAsync(name, fn) { const t0 = process.hrtime.bigint(); try { return await fn(); } finally { (T[name] ??= []).push(ms(t0)); } }
// Runs a command; `expect` says whether the shadow model predicts success.
function X(name, args, expect = true) {
  const t0 = process.hrtime.bigint();
  try {
    const r = DB.exec(name, args);
    (T[name] ??= []).push(ms(t0));
    stats.ok[name] = (stats.ok[name] || 0) + 1;
    if (!expect) stats.wronglyAccepted.push(`${name} ${JSON.stringify(args).slice(0, 160)}`);
    return { ok: true, r };
  } catch (e) {
    (T[name] ??= []).push(ms(t0));
    if (!(e instanceof DB.UserError)) { stats.crashes.push(`${name}: ${e.stack}`); return { ok: false, e }; }
    stats.rejected[name] = (stats.rejected[name] || 0) + 1;
    if (expect) stats.unexpectedRejections.push(`${iso(now)} ${name}: ${e.message} ${JSON.stringify(args).slice(0, 160)}`);
    else stats.expectedRejections++;
    return { ok: false, e };
  }
}

DB.open(DBFILE);
X('setup.complete', { company: { name: 'შპს „ბელო ტესტი“', tin: '405000000', address: 'თბილისი' }, whName: 'მთავარი საწყობი' });
X('settings.set', { key: 'wh2', value: true });
X('settings.set', { key: 'wh2Name', value: 'ფილიალი' });

/* ---------- master data ---------- */
const MODELS = ['Toyota Hilux', 'Toyota Land Cruiser', 'Toyota Camry', 'Toyota Prius', 'Toyota Coaster', 'Ford Transit', 'Ford Ranger', 'Mercedes-Benz Sprinter', 'Mercedes-Benz Actros', 'Mercedes-Benz Vito',
  'Isuzu NPR', 'Isuzu D-Max', 'MAN TGS', 'MAN TGX', 'Volvo FH', 'Volvo FM', 'Scania R', 'Nissan Navara', 'Mitsubishi L200', 'Hyundai H-1',
  'Hyundai Porter', 'Kia Sportage', 'Volkswagen Crafter', 'Volkswagen Transporter', 'Renault Master', 'Iveco Daily', 'DAF XF', 'Opel Vivaro', 'Peugeot Boxer', 'Citroen Jumper',
  'Fiat Ducato', 'Lada Niva', 'UAZ Patriot', 'GAZ Gazelle', 'KamAZ 5490', 'Chevrolet Captiva', 'Subaru Forester', 'Honda CR-V', 'Mazda BT-50', 'Suzuki Jimny'];
const SPECIFIC = [['ზეთის ფილტრი', 'ცალი', 20, 60], ['ჰაერის ფილტრი', 'ცალი', 30, 120], ['საწვავის ფილტრი', 'ცალი', 25, 140], ['სალონის ფილტრი', 'ცალი', 15, 50],
  ['სამუხრუჭე ხუნდები, წინა', 'კომპლექტი', 90, 400], ['სამუხრუჭე ხუნდები, უკანა', 'კომპლექტი', 80, 350], ['სამუხრუჭე დისკი', 'ცალი', 120, 600], ['ამორტიზატორი, წინა', 'ცალი', 150, 700],
  ['ამორტიზატორი, უკანა', 'ცალი', 140, 650], ['ღვედი, გენერატორის', 'ცალი', 40, 180], ['გამანაწილებელი ღვედის კომპლექტი', 'კომპლექტი', 200, 900], ['სანთელი', 'ცალი', 10, 45],
  ['ჰაბის საკისარი', 'ცალი', 80, 350], ['მინასაწმენდი', 'ცალი', 15, 45], ['გენერატორი', 'ცალი', 500, 1800, true], ['სტარტერი', 'ცალი', 400, 1500, true],
  ['წყლის ტუმბო', 'ცალი', 120, 500], ['გადაბმულობის კომპლექტი', 'კომპლექტი', 400, 1600]];
const BRANDS = ['OEM', 'Bosch', 'Mann', 'Febi', 'NGK', 'Sachs', 'TRW', 'Gates', 'SKF', 'Valeo'];
const products = []; // {art,name,uom,min,cost,qty,loc,model,serial,unit}
const arts = new Set();
const mkArt = pre => { let a; do a = `${pre}-${ri(10000, 99999)}-${ri(100, 999)}`; while (arts.has(a)); arts.add(a); return a; };
MODELS.forEach((m, mi) => SPECIFIC.forEach(([cat, uom, lo, hi, serial]) => {
  for (let v = 0; v < 3; v++) {
    const cost = Math.round((lo + rnd() * (hi - lo)) * 100) / 100;
    products.push({ art: mkArt('M' + String(mi).padStart(2, '0')), name: `${cat} (${m}) ${BRANDS[(mi + v) % BRANDS.length]}`, uom, min: ri(1, 4), cost, model: m, serial: !!serial, unit: 1 });
  }
}));
const OILS = ['5W-30', '5W-40', '10W-40', '15W-40 HD', '80W-90', 'ATF', '0W-20', '75W-90'];
OILS.forEach(o => ['Castrol', 'Mobil', 'Shell', 'Total', 'Liqui Moly', 'Motul'].forEach(b => products.push({ art: mkArt('OIL'), name: `ძრავის ზეთი ${o} ${b}`, uom: 'ლიტრი', min: 40, cost: ri(12, 45), liquid: true })));
['ანტიფრიზი G12', 'ანტიფრიზი G13', 'სამუხრუჭე სითხე DOT4', 'სამუხრუჭე სითხე DOT5.1', 'მინის სითხე', 'AdBlue', 'ჰიდრავლიკის ზეთი HLP46'].forEach(n => ['A', 'B', 'C'].forEach(b => products.push({ art: mkArt('FL'), name: `${n} ${b}`, uom: 'ლიტრი', min: 30, cost: ri(4, 25), liquid: true })));
[60, 74, 90, 100, 140, 190, 225].forEach(ah => ['Varta', 'Bosch', 'Exide', 'Mutlu'].forEach(b => products.push({ art: mkArt('BAT'), name: `აკუმულატორი ${ah}Ah ${b}`, uom: 'ცალი', min: 2, cost: ri(250, 1200), serial: true, unit: 1 })));
const SIZES = ['195/65 R15', '205/55 R16', '215/65 R16C', '225/70 R15C', '235/65 R16C', '245/70 R16', '265/65 R17', '265/70 R17', '285/70 R19.5', '295/80 R22.5', '315/70 R22.5', '315/80 R22.5', '385/65 R22.5', '205/75 R17.5', '215/75 R17.5', '225/75 R17.5', '235/75 R17.5', '7.50 R16', '185 R14C', '195 R14C', '205/70 R15C', '215/60 R17', '225/65 R17', '235/55 R18', '255/55 R18', '275/65 R18', '265/60 R18', '245/75 R16', '225/75 R16C', '195/75 R16C'];
SIZES.forEach(s => ['Michelin', 'Continental', 'Bridgestone', 'Kumho', 'Hankook'].forEach(b => products.push({ art: mkArt('TYR'), name: `საბურავი ${s} ${b}`, uom: 'ცალი', min: 4, cost: ri(180, 1400), serial: true, unit: 2 })));
['H1', 'H3', 'H4', 'H7', 'H11', 'P21W', 'W5W', 'R10W', 'D2S', 'D4S'].forEach(n => ['12V', '24V'].forEach(v => ['Osram', 'Philips'].forEach(b => products.push({ art: mkArt('BLB'), name: `ნათურა ${n} ${v} ${b}`, uom: 'ცალი', min: 10, cost: ri(4, 90) }))));
while (products.length < 3000) {
  const k = products.length;
  const kind = pick([['ჭანჭიკი M' + pick([6, 8, 10, 12, 14, 16]) + '×' + pick([20, 30, 40, 60, 80]), 'ცალი', 0.5, 4], ['სადები, ' + pick(['სპილენძის', 'ალუმინის', 'რეზინის']) + ' Ø' + ri(8, 30), 'ცალი', 0.3, 3], ['შლანგი Ø' + ri(6, 32) + ' მმ', 'მეტრი', 3, 25], ['კაბელი ' + pick(['1.5', '2.5', '4', '6']) + ' მმ²', 'მეტრი', 1, 8], ['საპოხი ' + pick(['EP2', 'Li', 'MoS2']), 'კგ', 8, 30], ['დამცველი ' + ri(5, 40) + 'A', 'ცალი', 0.5, 3], ['სამაგრი ' + ri(10, 90) + ' მმ', 'ცალი', 1, 6]]);
  products.push({ art: mkArt('U' + (k % 97)), name: `${kind[0]} #${k}`, uom: kind[1], min: ri(5, 50), cost: Math.round((kind[2] + rnd() * (kind[3] - kind[2])) * 100) / 100, liquid: kind[1] !== 'ცალი' });
}

// 1,000 grid locations in the main warehouse, 200 free-form ones in the branch.
const L1 = []; for (const r of 'ABCDEFGHIJKLMNOPQRSTUVWXY') for (let s = 1; s <= 5; s++) for (let b = 1; b <= 8; b++) L1.push(`${r}-0${s}-0${b}`);
const L2 = Array.from({ length: 200 }, (_, i) => `ფილიალი-${String(i + 1).padStart(3, '0')}`);
timed('bulk: 1000 locations wh1', () => X('location.bulkAdd', { wh: 1, codes: L1.slice(0, 900).join('\n') }));
X('location.bulkAdd', { wh: 2, codes: L2.join('\n') });
products.forEach((p, i) => { p.qty = p.liquid ? ri(40, 300) : ri(0, 12); p.loc = i < 2900 ? L1[i % L1.length] : ''; });

/* ---------- CSV import of products (the remaining 100 grid locations are created by the import) ---------- */
const csvRows = products.map(p => [p.art, p.name, p.uom, String(p.min), String(p.cost).replace('.', ','), String(p.qty), p.loc]);
const badRows = [['', 'უარტიკულო', 'ცალი', '1', '1', '1', ''], ['BAD-UOM-1', 'უცნობი ერთეული', 'ყუთი', '1', '1', '1', ''], ['BAD-NUM-1', 'ცუდი რიცხვი', 'ცალი', 'x', '1', '1', ''], [products[5].art, 'დუბლიკატი ფაილში', 'ცალი', '1', '1', '1', '']];
const imported = [...csvRows, ...badRows];
const check = timed('import.check 3004 products', () => DB.exec('import.check', { type: 'products', rows: imported }));
const importSummary = { new: check.filter(r => r.st === 'new').length, upd: check.filter(r => r.st === 'upd').length, err: check.filter(r => r.st === 'err').length, newLocations: check.filter(r => /ახალი ლოკაცია/.test(r.msg)).length };
const applied = timed('import.apply 3004 products', () => DB.exec('import.apply', { type: 'products', rows: imported }));

/* ---------- vehicles by CSV ---------- */
const VIN = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
const vins = new Set(), plates = new Set();
const mkVin = () => { let v; do v = Array.from({ length: 17 }, () => pick(VIN)).join(''); while (vins.has(v)); vins.add(v); return v; };
const L = 'ABCDEFGHIKLMNOPRSTUVWXYZ';
const mkPlate = () => { let p; do p = `${pick(L)}${pick(L)}-${ri(100, 999)}-${pick(L)}${pick(L)}`; while (plates.has(p)); plates.add(p); return p; };
const vehRows = Array.from({ length: 600 }, (_, i) => { const m = MODELS[i % MODELS.length].split(' '); return [mkPlate(), mkVin(), m[0], m.slice(1).join(' '), String(ri(2008, 2025)), String(ri(5000, 450000)), pick(['ლოგისტიკა', 'მიწოდება', 'სატვირთო', 'ადმინისტრაცია', 'სერვისი'])]; });
const vehBad = [['ZZ-000-ZZ', 'SHORTVIN', 'Ford', 'Transit', '2019', '1', ''], ['QQ-111-QQ', 'IOQIOQIOQIOQIOQIO', 'Ford', 'Transit', '2019', '1', '']];
const vehCheck = timed('import.check 602 vehicles', () => DB.exec('import.check', { type: 'vehicles', rows: [...vehRows, ...vehBad] }));
const vehApplied = timed('import.apply 602 vehicles', () => DB.exec('import.apply', { type: 'vehicles', rows: [...vehRows, ...vehBad] }));

const suppliers = Array.from({ length: 60 }, (_, i) => X('supplier.save', { name: `შპს „მომწოდებელი ${i + 1}“`, tin: String(400000000 + i), phone: '+995 5' + ri(10000000, 99999999) }).r);

/* ---------- shadow model from the imported state ---------- */
let st = timed('getState', () => DB.getState());
// A copy of the service orders kept the way the screen keeps it: full list once, then only change notices (delta).
let client = st.sos;
const soOrder = (a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
let deltaSent = 0, deltaCalls = 0;
function sync() {
  const d = timed('getState delta', () => DB.getState({ delta: true }));
  if (d.sos) { client = d.sos; return client; }
  deltaCalls++; deltaSent += d.sosUpsert.length;
  const up = new Map(d.sosUpsert.map(o => [o.id, o])), known = new Set(client.map(o => o.id));
  client = client.map(o => up.get(o.id) || o);
  const added = d.sosUpsert.filter(o => !known.has(o.id));
  if (added.length) client = [...added, ...client].sort(soOrder);
  return client;
}
const SH = { stock: {}, avg: {}, info: {} };
const byArt = new Map(st.products.map(p => [p.art, p]));
products.forEach(p => { const d = byArt.get(p.art); p.id = d.id; SH.stock[d.id] = { 1: d.stock[1].q, 2: d.stock[2].q }; SH.avg[d.id] = d.cost; SH.info[d.id] = p; });
const importOk = products.every(p => { const d = byArt.get(p.art); return d.stock[1].q === p.qty && Math.abs(d.cost - p.cost) < 1e-9 && d.stock[1].loc === p.loc && d.min === p.min; });
const vehicles = st.vehicles.map(v => ({ ...v, model: v.make + ' ' + v.model }));
const prodByModel = {}; products.filter(p => p.model).forEach(p => (prodByModel[p.model] ??= []).push(p));
const universal = products.filter(p => !p.model);
// Manual catalog links for one brand of each model-specific product.
products.filter((p, i) => p.model && i % 3 === 0).forEach(p => X('catalog.toggle', { model: p.model, pid: p.id }));

const RESP = Array.from({ length: 25 }, (_, i) => pick(['ნ.', 'დ.', 'ლ.', 'ზ.', 'გ.', 'თ.', 'ა.', 'მ.']) + ' ' + ['ბერიძე', 'მაისურაძე', 'გელაშვილი', 'ხუციშვილი', 'კაპანაძე', 'ჯაფარიძე', 'ლომიძე', 'წიკლაური', 'ქავთარაძე', 'მამულაშვილი'][i % 10] + (i >= 10 ? ' ' + (i - 9) : ''));
const SVC = ['ზეთის შეცვლა', 'დიაგნოსტიკა', 'ხუნდების შეცვლა', 'საბურავის მონტაჟი', 'ბალანსირება', 'ტექნიკური მომსახურება', 'ელექტრო დიაგნოსტიკა', 'გაგრილების სისტემის რეცხვა', 'სავალი ნაწილის შეკეთება', 'კონდიციონერის დატენვა'];
const SO = {};          // id → {vid, status, lastChange, lines:[{lid,pid,wh,qty,ret,serials,back}], cost}
let serialSeq = 0; const activeSerial = new Map(); // product|serial(lower) → so id (serials are unique per product)
let expectedSpend = 0;

function shadowAutoClose() {
  const t = iso(now), n = 7;
  for (const [id, o] of Object.entries(SO)) if (o.status === 'open' && dayDiff(o.lastChange, t) >= n) o.status = 'auto';
}
function buy(pids) {
  const lines = pids.map(pid => { const p = SH.info[pid]; const q = p.liquid ? ri(100, 400) : Math.max(p.min * 3, 6); return { pid, qty: q, price: Math.round(p.cost * (0.85 + rnd() * 0.3) * 100) / 100 }; });
  const wh = chance(0.1) ? 2 : 1;
  const r = X('po.create', { sup: pick(suppliers), wh, lines });
  if (r.ok) lines.forEach(l => { const s = SH.stock[l.pid], total = s[1] + s[2]; SH.avg[l.pid] = r4((SH.avg[l.pid] * total + l.qty * l.price) / (total + l.qty)); s[wh] = r4(s[wh] + l.qty); });
  return r.ok;
}
function issue(id, o, p, wh, qty, serials) {
  const s = SH.stock[p.id];
  const clash = serials.some(x => activeSerial.has(p.id + '|' + x.toLowerCase()));
  const expect = s[wh] >= qty && !clash && serials.length <= qty;
  const r = X('so.issue', { id, pid: p.id, wh, qty, serials: serials.join(', ') }, expect);
  if (r.ok) {
    s[wh] = r4(s[wh] - qty);
    o.lines.push({ pid: p.id, wh, qty, ret: 0, price: SH.avg[p.id], serials, back: [] });
    serials.forEach(x => activeSerial.set(p.id + '|' + x.toLowerCase(), id));
    expectedSpend += qty * SH.avg[p.id];
    o.lastChange = iso(now);
  }
  return r.ok;
}

/* ---------- one simulated year ---------- */
const checkpoints = [];
const START = new Date(now);
let day = 0;
while (iso(now) <= '2026-11-02') {
  day++;
  // Opening the app every morning: state load (also runs auto-close).
  sync();
  if (day % 30 === 1) { const t0 = process.hrtime.bigint(); st = DB.getState(); checkpoints.push({ day, date: iso(now), sos: st.sos.length, ms: ms(t0), json: JSON.stringify(st).length }); }
  shadowAutoClose();
  // Replenish anything below its minimum.
  const low = Object.keys(SH.stock).filter(pid => SH.stock[pid][1] < SH.info[pid].min);
  for (let i = 0; i < low.length; i += 25) buy(low.slice(i, i + 25));

  const isWork = now.getDay() !== 0;
  const nSO = isWork ? ri(10, 20) : ri(0, 3);
  for (let k = 0; k < nSO; k++) {
    now = new Date(now.getTime() + 15 * 60000);
    const v = pick(vehicles);
    const r = X('so.create', { vid: v.id, resp: pick(RESP), km: String(v.km + ri(200, 3000)) });
    if (!r.ok) continue;
    const id = r.r;
    v.km += 1500;
    const o = SO[id] = { vid: v.id, status: 'open', lastChange: iso(now), lines: [], svc: 0 };
    const nParts = ri(1, 5);
    for (let j = 0; j < nParts; j++) {
      const fromModel = chance(0.75) && prodByModel[v.model];
      const p = fromModel ? pick(prodByModel[v.model]) : pick(universal);
      let qty = p.liquid ? Math.round(ri(4, 18)) / 2 : (p.unit === 2 ? pick([2, 4]) : ri(1, 2));
      const wh = chance(0.08) ? 2 : 1;
      let serials = [];
      if (p.serial && chance(0.85)) serials = Array.from({ length: Math.floor(qty) }, () => `SN${String(++serialSeq).padStart(7, '0')}`);
      else if (!p.serial && chance(0.05)) serials = [`X${++serialSeq}`];
      if (SH.stock[p.id][wh] < qty && !chance(0.3)) { if (SH.stock[p.id][wh] >= 1) qty = Math.min(qty, Math.floor(SH.stock[p.id][wh])); else continue; serials = serials.slice(0, Math.floor(qty)); }
      if (qty <= 0) continue;
      issue(id, o, p, wh, qty, serials);
    }
    for (let j = ri(0, 2); j > 0; j--) {
      const price = chance(0.5) ? '' : String(ri(20, 300));
      if (X('so.addService', { id, name: pick(SVC), price }).ok) { o.svc += price === '' ? 0 : +price; expectedSpend += price === '' ? 0 : +price; }
    }
    // Deliberate mistakes the program must refuse.
    if (chance(0.03) && o.lines.length) { const l = o.lines[0]; issue(id, o, SH.info[l.pid], l.wh, 1e6, []); }
    if (chance(0.02) && activeSerial.size) { const [key] = [...activeSerial.keys()].slice(-1); const [pid, sn] = key.split('|'); issue(id, o, SH.info[pid], 1, 1, [sn.toUpperCase()]); }
    if (chance(0.3)) { X('so.close', { id }); o.status = 'closed'; }
  }
  // Follow-up work on recent orders: returns, serial corrections, field edits, reopening.
  const recent = Object.entries(SO).slice(-60);
  for (const [id, o] of recent) {
    if (o.status !== 'open') { if (o.status === 'auto' && chance(0.01)) { if (X('so.reopen', { id }).ok) { o.status = 'open'; o.lastChange = iso(now); } } continue; }
    if (chance(0.06) && o.lines.length) {
      const st2 = sync().find(x => x.id === id);
      const li = ri(0, o.lines.length - 1), l = o.lines[li], dl = st2.parts[li];
      const net = r4(l.qty - l.ret);
      if (net > 0) {
        const out = l.serials.filter(s => !l.back.includes(s));
        const back = out.length ? [out[0]] : [];
        const q = back.length ? 1 : Math.min(net, l.qty >= 2 ? 1 : net);
        if (X('so.return', { id, lid: dl.lid, qty: q, reason: 'არ დასჭირდა', serials: back }).ok) {
          l.ret = r4(l.ret + q); l.back.push(...back); back.forEach(s => activeSerial.delete(l.pid + '|' + s.toLowerCase()));
          SH.stock[l.pid][l.wh] = r4(SH.stock[l.pid][l.wh] + q); expectedSpend -= q * l.price; o.lastChange = iso(now);
        }
        if (chance(0.2)) X('so.return', { id, lid: dl.lid, qty: 1e6 }, false);
      }
    }
    if (chance(0.02)) { if (X('so.update', { id, km: String(ri(1000, 500000)) }).ok) o.lastChange = iso(now); }
    if (chance(0.04)) { X('so.close', { id }); o.status = 'closed'; }
  }
  // Transfers between warehouses and location housekeeping.
  for (let k = isWork ? ri(0, 2) : 0; k > 0; k--) {
    const p = pick(products), from = chance(0.8) ? 1 : 2, to = from === 1 ? 2 : 1;
    const q = p.liquid ? 10 : 1, ok = SH.stock[p.id][from] >= q;
    if (X('transfer.create', { pid: p.id, from, qty: q, loc: to === 2 ? pick(L2) : '' }, ok).ok) { SH.stock[p.id][from] = r4(SH.stock[p.id][from] - q); SH.stock[p.id][to] = r4(SH.stock[p.id][to] + q); }
  }
  if (day % 7 === 0) {
    const used = pick(L1);
    X('location.delete', { wh: 1, code: used }, false);
    X('location.save', { wh: 1, code: `TMP-${day}`, note: 'დროებითი' });
    X('location.delete', { wh: 1, code: `TMP-${day}` });
    X('location.assign', { pid: pick(products).id, wh: 1, loc: 'არარსებული-' + day }, false);
    X('vehicle.save', { plate: 'X', vin: 'BAD', make: 'a', model: 'b' }, false);
    X('product.save', { art: products[0].art, name: 'დუბლიკატი' }, false);
  }
  if (day % 30 === 0) { timed('catalog.learn', () => X('catalog.learn', {})); }
  now = new Date(START.getTime() + day * 864e5);
}
// Rename a busy location: every product on it must follow.
const busy = L1[3];
const onBusy = products.filter(p => p.loc === busy).length;
X('location.save', { wh: 1, oldCode: busy, code: busy + '-R', note: 'გადარქმეული' });
sync(); shadowAutoClose();

/* ---------- verification ---------- */
sync();
const t0 = process.hrtime.bigint(); st = DB.getState(); const finalStateMs = ms(t0);
const deltaMatchesFull = JSON.stringify(client) === JSON.stringify(st.sos);
DB.close(); DB.open(DBFILE);
const rebuilt = DB.getState();
const cacheMatchesRebuild = JSON.stringify(rebuilt.sos) === JSON.stringify(st.sos);
const d0 = process.hrtime.bigint(); DB.exec('so.addService', { id: st.sos.find(o => o.status === 'open').id, name: 'delta' }); const dOne = DB.getState({ delta: true }); const deltaMs = ms(d0);
const stateJson = JSON.stringify(st).length;
const diffs = [];
st.products.forEach(p => {
  const s = SH.stock[p.id];
  if (!s) return;
  if (Math.abs(p.stock[1].q - s[1]) > 1e-9 || Math.abs(p.stock[2].q - s[2]) > 1e-9) diffs.push(`stock ${p.id}: db ${p.stock[1].q}/${p.stock[2].q} expected ${s[1]}/${s[2]}`);
  if (Math.abs(p.cost - SH.avg[p.id]) > 1e-6) diffs.push(`cost ${p.id}: db ${p.cost} expected ${SH.avg[p.id]}`);
  if (p.stock[1].q < 0 || p.stock[2].q < 0) diffs.push(`NEGATIVE ${p.id}`);
});
const statusDiffs = [];
st.sos.forEach(o => { const s = SO[o.id]; if (s && s.status !== o.status) statusDiffs.push(`${o.id}: db ${o.status} expected ${s.status} (last ${o.lastChange})`); });
const autoBad = st.sos.filter(o => o.status === 'open' && dayDiff(o.lastChange, st.today) >= 7).length;
const spend = st.sos.reduce((a, o) => a + o.parts.reduce((b, l) => b + (l.qty - l.ret) * l.price, 0) + o.svcs.reduce((b, s) => b + (+s.price || 0), 0), 0);
const serialSeen = new Map(); let serialDup = 0;
st.sos.forEach(o => o.parts.forEach(l => l.serials.forEach(sn => { if (l.retSerials.includes(sn)) return; const k = l.pid + '|' + sn.toLowerCase(); if (serialSeen.has(k)) serialDup++; serialSeen.set(k, o.id); })));
const h = DB.handle();
const one = sql => h.prepare(sql).get();
const counts = Object.fromEntries(['products', 'stock', 'vehicles', 'suppliers', 'locations', 'purchase_orders', 'po_lines', 'service_orders', 'so_parts', 'so_services', 'catalog', 'moves', 'transfers'].map(t => [t, one(`SELECT COUNT(*) AS n FROM ${t}`).n]));
const integrity = Object.values(one('PRAGMA integrity_check'))[0];
const fk = h.prepare('PRAGMA foreign_key_check').all().length;
const renamedOk = one(`SELECT COUNT(*) AS n FROM stock WHERE wh_id=1 AND loc='${busy}-R'`).n === onBusy && one(`SELECT COUNT(*) AS n FROM stock WHERE wh_id=1 AND loc='${busy}'`).n === 0;
const statusCount = st.sos.reduce((a, o) => (a[o.status] = (a[o.status] || 0) + 1, a), {});

(async () => {
  const bdir = path.join(OUT, 'usb'); fs.rmSync(bdir, { recursive: true, force: true }); fs.mkdirSync(bdir);
  const bfile = await timedAsync('backup.run', () => Backup.run(bdir));
  const sizeDb = fs.statSync(DBFILE).size, sizeBk = fs.statSync(bfile).size;
  const before = JSON.stringify(DB.getState().products.slice(0, 50));
  X('so.addService', { id: Object.keys(SO).find(id => SO[id].status === 'open') || st.sos[0].id, name: 'დროებითი' });
  await timedAsync('backup.restore', () => Backup.restore(bfile, DBFILE, path.join(OUT, 'safety')));
  const restoredSame = JSON.stringify(DB.getState().products.slice(0, 50)) === before && DB.getState().sos.length === st.sos.length;
  const perf = Object.fromEntries(Object.entries(T).map(([k, v]) => { const s = [...v].sort((a, b) => a - b); return [k, { n: v.length, avg: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), max: +s[s.length - 1].toFixed(2) }]; }));
  const report = {
    simulated: { from: iso(START), to: iso(now), days: day },
    counts, statusCount, importSummary, importApplied: applied, importValuesMatch: importOk, vehiclesImport: { check: { new: vehCheck.filter(r => r.st === 'new').length, err: vehCheck.filter(r => r.st === 'err').length }, applied: vehApplied },
    operations: { ok: stats.ok, rejected: stats.rejected, expectedRejections: stats.expectedRejections },
    problems: { crashes: stats.crashes, unexpectedRejections: stats.unexpectedRejections.slice(0, 30), unexpectedRejectionCount: stats.unexpectedRejections.length, wronglyAccepted: stats.wronglyAccepted, stockOrCostDiffs: diffs.slice(0, 30), stockOrCostDiffCount: diffs.length, statusDiffs: statusDiffs.slice(0, 30), statusDiffCount: statusDiffs.length, openButOverdue: autoBad, activeSerialDuplicates: serialDup },
    money: { reportSpend: +spend.toFixed(2), expectedSpend: +expectedSpend.toFixed(2), diff: +(spend - expectedSpend).toFixed(4) },
    database: { integrity, foreignKeyErrors: fk, sizeMB: +(sizeDb / 1048576).toFixed(2), backupMB: +(sizeBk / 1048576).toFixed(2), restoredSame, renamedLocationMovedProducts: renamedOk, productsOnRenamed: onBusy },
    state: { getStateMs: +finalStateMs.toFixed(1), jsonMB: +(stateJson / 1048576).toFixed(2), checkpoints, deltaMatchesFull, cacheMatchesRebuild, deltaCalls, avgSOsPerDelta: +(deltaSent / Math.max(1, deltaCalls)).toFixed(1), oneCommandDelta: { ms: +deltaMs.toFixed(1), jsonMB: +(JSON.stringify(dOne).length / 1048576).toFixed(2), sosSent: dOne.sosUpsert.length } },
    perf
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  DB.close();
  console.log(JSON.stringify(report, null, 2));
})();
