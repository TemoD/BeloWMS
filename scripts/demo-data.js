'use strict';
// Builds a presentation database: 800 products in stock, 100 vehicles in 40 model+year groups, 2 warehouses with
// 50 locations each, 30 suppliers, 100 purchase orders and 500 service orders over the last six months.
// Everything goes through the same commands the app uses. Run: node scripts/demo-data.js [folder]   (default .demo)
// then open it: BELO_DATA=.demo npx electron .
const fs = require('node:fs');
const path = require('node:path');
const DB = require('../src/main/db');

const OUT = path.resolve(process.argv[2] || '.demo');
fs.mkdirSync(OUT, { recursive: true });
const FILE = path.join(OUT, 'axioma-wms.db');
for (const f of [FILE, FILE + '-wal', FILE + '-shm', path.join(OUT, 'belo-wms.db')]) fs.rmSync(f, { force: true });

let seed = 42;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
const chance = p => rnd() < p;
const END = new Date(2026, 10, 6, 18, 0, 0);
let now = new Date(2026, 4, 6, 9, 0, 0);
DB.setClock(() => now);
const day = ms => { now = new Date(now.getTime() + ms); };
const ok = (name, args) => { try { return DB.exec(name, args); } catch (e) { if (e instanceof DB.UserError) return null; throw e; } };

DB.open(FILE);
DB.exec('setup.complete', { company: { name: 'შპს „დემო სერვის ცენტრი“', tin: '405112233', address: 'თბილისი, დავით აღმაშენებლის ხეივანი 150', phone: '+995 32 2 00 00 00' }, whName: 'მთავარი საწყობი — თბილისი' });
DB.exec('settings.set', { key: 'wh2', value: true });
DB.exec('settings.set', { key: 'wh2Name', value: 'ფილიალი — რუსთავი' });

/* ---------- locations: 50 per warehouse ---------- */
const L1 = [], L2 = [];
for (const r of 'ABCDE') for (let s = 1; s <= 2; s++) for (let b = 1; b <= 5; b++) L1.push(`${r}-0${s}-0${b}`);
for (let i = 1; i <= 50; i++) L2.push(`რ-${String(i).padStart(2, '0')}`);
DB.exec('location.bulkAdd', { wh: 1, codes: L1.join('\n') });
DB.exec('location.bulkAdd', { wh: 2, codes: L2.join('\n') });
DB.exec('location.save', { wh: 1, oldCode: 'E-02-05', code: 'E-02-05', note: 'საბურავები, იატაკზე' });
DB.exec('location.save', { wh: 1, oldCode: 'A-01-01', code: 'A-01-01', note: 'ფილტრები' });

/* ---------- 30 suppliers ---------- */
const SUP = ['ავტონაწილი პლუსი', 'ოილ მარკეტი', 'ტრაკ პარტსი', 'ელექტრო ავტო', 'მაშინერი სერვისი', 'ჰიდრავლიკა ჯგუფი', 'საბურავების სახლი', 'ფილტრ ცენტრი', 'კავკასია პარტსი', 'ევრო ტრაკი',
  'იმპორტ მოტორსი', 'ავტო ლაინი', 'ტექნო ტრეიდი', 'სამხრეთის ნაწილები', 'ბატარეა ცენტრი', 'მძიმე ტექნიკა', 'ჯი-ემ-ეს', 'ნაწილები 24', 'ავტო ბაზარი', 'ქართული ლუბრიკანტი',
  'ტრანს ლოჯისტიკი', 'სერვის პარტნერი', 'ინდუსტრიალი', 'ავტო ექსპრესი', 'მეგა პარტსი', 'კოლხეთი ტრეიდი', 'ალფა მოტორსი', 'ომეგა ნაწილები', 'გზა და ტექნიკა', 'ზენიტ სერვისი']
  .map((n, i) => DB.exec('supplier.save', { name: `შპს „${n}“`, tin: String(404100000 + i * 137), phone: `+995 5${ri(50, 99)} ${ri(10, 99)} ${ri(10, 99)} ${ri(10, 99)}`, contact: pick(['გ.', 'ნ.', 'ლ.', 'თ.', 'მ.']) + ' ' + pick(['ბერიძე', 'კაპანაძე', 'ლომიძე', 'გოგოლაძე', 'ჯაფარიძე', 'წიკლაური']) }));

/* ---------- 40 model+year groups, 100 vehicles ---------- */
// [make, model, years, machinery?]
const MODELS = [['JCB', '3CX', [2019, 2021], 1], ['JCB', '4CX', [2018, 2022], 1], ['JCB', 'JS220', [2020, 2023], 1], ['Caterpillar', '320', [2017, 2021], 1], ['Caterpillar', '432F', [2019, 2022], 1],
  ['Komatsu', 'PC200', [2018, 2020], 1], ['Hyundai', 'R210', [2019, 2022], 1], ['Volvo', 'FH', [2018, 2021], 0], ['Scania', 'R450', [2019, 2022], 0], ['MAN', 'TGS', [2017, 2020], 0],
  ['Mercedes-Benz', 'Actros', [2018, 2023], 0], ['Isuzu', 'NPR', [2016, 2020], 0], ['Ford', 'Transit', [2019, 2022], 0], ['Toyota', 'Hilux', [2018, 2021], 0], ['Toyota', 'Land Cruiser', [2017, 2020], 0],
  ['Mitsubishi', 'L200', [2019, 2023], 0], ['Nissan', 'Navara', [2018, 2021], 0], ['Iveco', 'Daily', [2019, 2022], 0], ['Volkswagen', 'Crafter', [2020, 2023], 0], ['Renault', 'Master', [2018, 2021], 0]];
const VINCH = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789', LET = 'ABCEHIKMNOPTXY';
const used = new Set();
const uniq = f => { let v; do v = f(); while (used.has(v)); used.add(v); return v; };
const vehicles = [];
const groups = MODELS.flatMap(([make, model, years, mach]) => years.map(year => ({ make, model, year, mach })));
groups.forEach((g, i) => {
  const n = i < 20 ? 3 : 2; // 20 groups × 3 + 20 groups × 2 = 100 vehicles
  for (let k = 0; k < n; k++) {
    // Machinery gets manufacturer serial numbers of other lengths; road vehicles a standard 17-character VIN.
    const vin = uniq(() => g.mach ? g.make.slice(0, 3).toUpperCase() + g.model.replace(/\s/g, '').toUpperCase() + Array.from({ length: ri(3, 5) }, () => ri(0, 9)).join('')
      : Array.from({ length: 17 }, () => pick(VINCH)).join(''));
    const plate = uniq(() => `${pick(LET)}${pick(LET)}-${ri(100, 999)}-${pick(LET)}${pick(LET)}`);
    const id = DB.exec('vehicle.save', { plate, vin, make: g.make, model: g.model, year: g.year, km: g.mach ? ri(800, 9000) : ri(20000, 380000),
      dept: g.mach ? pick(['სამშენებლო', 'კარიერი', 'საგზაო']) : pick(['ლოგისტიკა', 'მიწოდება', 'სატვირთო', 'ადმინისტრაცია']) });
    vehicles.push({ id, ...g });
  }
});

/* ---------- 800 products ---------- */
const SPEC = [['ზეთის ფილტრი', 'ცალი', 25, 90], ['ჰაერის ფილტრი', 'ცალი', 40, 220], ['საწვავის ფილტრი', 'ცალი', 30, 180], ['ჰიდრავლიკის ფილტრი', 'ცალი', 60, 320], ['სალონის ფილტრი', 'ცალი', 15, 60],
  ['სამუხრუჭე ხუნდები, წინა', 'კომპლექტი', 90, 450], ['სამუხრუჭე ხუნდები, უკანა', 'კომპლექტი', 80, 400], ['სამუხრუჭე დისკი', 'ცალი', 120, 650], ['ამორტიზატორი', 'ცალი', 150, 800], ['ღვედი, გენერატორის', 'ცალი', 40, 200],
  ['გამანაწილებელი ღვედის კომპლექტი', 'კომპლექტი', 200, 950], ['წყლის ტუმბო', 'ცალი', 120, 600], ['გენერატორი', 'ცალი', 500, 2200, 1], ['სტარტერი', 'ცალი', 400, 1800, 1], ['ჰაბის საკისარი', 'ცალი', 80, 380],
  ['ჰიდრავლიკური შლანგი', 'ცალი', 70, 400], ['ციცხვის კბილი', 'ცალი', 45, 160], ['ჭიქის საკისარი', 'ცალი', 90, 420], ['გადაბმულობის კომპლექტი', 'კომპლექტი', 400, 1700], ['სანთელი / სანთურა', 'ცალი', 12, 80],
  ['რადიატორი', 'ცალი', 350, 1400], ['ტურბინის მილი', 'ცალი', 60, 260], ['მინასაწმენდი', 'ცალი', 15, 50], ['ფარი', 'ცალი', 180, 900], ['სარკე', 'ცალი', 90, 380], ['ძრავის ბალიში', 'ცალი', 70, 300],
  ['სიჩქარის ტროსი', 'ცალი', 30, 120], ['ჰიდროცილინდრის ჩობალი', 'კომპლექტი', 80, 350], ['წინა სტაბილიზატორის ბუშინგი', 'ცალი', 15, 60], ['ტემპერატურის გადამწოდი', 'ცალი', 35, 150]];
const BR = ['OEM', 'Bosch', 'Mann', 'Donaldson', 'Fleetguard', 'SKF', 'Gates', 'TRW', 'Sachs', 'Valeo'];
const prods = [];
const art = pre => uniq(() => `${pre}-${ri(10000, 99999)}`);
MODELS.forEach(([make, model], mi) => SPEC.forEach(([cat, uom, lo, hi, serial], ci) => {
  prods.push({ art: art(make.slice(0, 2).toUpperCase() + String(mi).padStart(2, '0')), name: `${cat} (${make} ${model}) ${BR[(mi + ci) % BR.length]}`, uom, min: ri(1, 3), cost: Math.round((lo + rnd() * (hi - lo)) * 100) / 100, base: `${make} ${model}`, serial: !!serial });
}));
const UNIV = [];
['5W-30', '10W-40', '15W-40 HD', '80W-90', 'ATF', 'HLP 46 ჰიდრავლიკის'].forEach(o => ['Castrol', 'Mobil', 'Shell', 'Total', 'Liqui Moly'].forEach(b => UNIV.push([`ზეთი ${o} ${b}`, 'ლიტრი', 14, 45, 0, 1])));
['ანტიფრიზი G12', 'ანტიფრიზი G13', 'სამუხრუჭე სითხე DOT4', 'AdBlue', 'მინის სითხე'].forEach(n => ['A', 'B', 'C'].forEach(b => UNIV.push([`${n} ${b}`, 'ლიტრი', 4, 25, 0, 1])));
[74, 100, 140, 180, 225].forEach(ah => ['Varta', 'Bosch', 'Exide', 'Mutlu'].forEach(b => UNIV.push([`აკუმულატორი ${ah}Ah ${b}`, 'ცალი', 280, 1200, 1])));
['265/70 R17', '235/65 R16C', '315/80 R22.5', '385/65 R22.5', '295/80 R22.5', '16.9-28 (ტრაქტორის)', '12.5/80-18', '17.5-25', '225/75 R16C', '205/75 R16C'].forEach(sz => ['Michelin', 'Continental', 'Bridgestone', 'Kumho'].forEach(b => UNIV.push([`საბურავი ${sz} ${b}`, 'ცალი', 220, 2400, 1])));
['H4', 'H7', 'H1', 'P21W', 'W5W', 'R10W'].forEach(n => ['12V', '24V'].forEach(v => UNIV.push([`ნათურა ${n} ${v}`, 'ცალი', 4, 60])));
while (prods.length + UNIV.length < 800) UNIV.push([`ჭანჭიკი M${pick([8, 10, 12, 14, 16, 20])}×${pick([30, 40, 60, 80, 100])} ${pick(['8.8', '10.9'])} #${UNIV.length}`, 'ცალი', 1, 9]);
UNIV.forEach(([name, uom, lo, hi, serial, liquid]) => prods.push({ art: art('U'), name, uom, min: liquid ? 40 : ri(2, 10), cost: Math.round((lo + rnd() * (hi - lo)) * 100) / 100, serial: !!serial, liquid: !!liquid }));
prods.forEach((p, i) => { p.loc = L1[i % 50]; p.qty = p.liquid ? ri(80, 300) : ri(6, 25); });
// Products and their stock come in through the same CSV import a user would run.
const head = ['არტიკული', 'დასახელება', 'ზომის ერთეული', 'მინ. ნაშთი', 'რაოდენობა', 'ღირებულება', 'ლოკაცია', 'საწყობი'];
DB.exec('import.apply', { type: 'products', rows: [head, ...prods.map(p => [p.art, p.name, p.uom, String(p.min), String(p.qty), String(p.cost).replace('.', ','), p.loc, ''])] });
const byArt = new Map(DB.getState().products.map(p => [p.art, p]));
prods.forEach(p => { p.id = byArt.get(p.art).id; });
// The branch holds a share of the range.
const branch = prods.filter((_, i) => i % 5 === 0);
DB.exec('import.apply', { type: 'products', rows: [head, ...branch.map((p, i) => [p.art, '', '', '', String(p.liquid ? ri(30, 80) : ri(3, 10)), '', L2[i % 50], '2'])] });

/* ---------- catalog and VIN fitment ---------- */
const specificFor = base => prods.filter(p => p.base === base);
groups.forEach(g => specificFor(`${g.make} ${g.model}`).filter((_, i) => i % 2 === 0).forEach(p => DB.exec('catalog.toggle', { model: `${g.make} ${g.model} ${g.year}`, pid: p.id })));
vehicles.filter(v => v.mach).forEach(v => specificFor(`${v.make} ${v.model}`).filter(() => chance(0.6)).forEach(p => DB.exec('fitment.toggle', { vid: v.id, pid: p.id })));

/* ---------- six months: 100 purchase orders, 500 service orders ---------- */
const RESP = ['დავით დავითიძე', 'გიორგი გიორგაძე', 'ნიკა ბერიძე', 'ლევან კაპანაძე', 'თორნიკე ლომიძე', 'ზურაბ ხუციშვილი', 'მიხეილ ჯაფარიძე', 'ირაკლი წიკლაური', 'სანდრო მამულაშვილი', 'ბექა გოგოლაძე'];
const SVC = [['ზეთის შეცვლა', ''], ['ტექნიკური მომსახურება', '150'], ['დიაგნოსტიკა', '50'], ['ხუნდების შეცვლა', ''], ['ჰიდრავლიკის შემოწმება', '80'], ['საბურავის მონტაჟი', '40'], ['ელექტრო დიაგნოსტიკა', '70'], ['სავალი ნაწილის შეკეთება', '']];
const days = Math.round((END - now) / 864e5);
const soDays = Array.from({ length: 500 }, () => ri(0, days - 1)).sort((a, b) => a - b);
const poDays = Array.from({ length: 98 }, () => ri(0, days - 1)).sort((a, b) => a - b);
const START = new Date(now);
const at = (d, h) => new Date(START.getTime() + d * 864e5 + h * 36e5);
let si = 0, pi = 0, sn = 1000;
const sos = [];
for (let d = 0; d < days; d++) {
  now = at(d, 8); DB.getState();
  while (pi < poDays.length && poDays[pi] === d) {
    now = at(d, 9);
    const lines = Array.from({ length: ri(5, 12) }, () => pick(prods)).filter((p, i, a) => a.indexOf(p) === i)
      .map(p => ({ pid: p.id, qty: p.liquid ? ri(60, 200) : ri(5, 20), price: Math.round(p.cost * (0.9 + rnd() * 0.2) * 100) / 100 }));
    ok('po.create', { sup: pick(SUP), wh: chance(0.15) ? 2 : 1, lines });
    pi++;
  }
  while (si < soDays.length && soDays[si] === d) {
    now = at(d, 10 + (si % 7));
    const v = pick(vehicles);
    const id = ok('so.create', { vid: v.id, resp: pick(RESP), km: '' });
    if (id) {
      const own = specificFor(`${v.make} ${v.model}`);
      for (let k = ri(1, 4); k > 0; k--) {
        const p = chance(0.75) ? pick(own) : pick(prods.filter(x => !x.base));
        const qty = p.liquid ? ri(4, 24) : ri(1, 2);
        const serials = p.serial && chance(0.8) ? Array.from({ length: qty }, () => `SN${++sn}`).join(', ') : '';
        ok('so.issue', { id, pid: p.id, wh: 1, qty, serials });
      }
      for (let k = ri(0, 2); k > 0; k--) { const [name, price] = pick(SVC); ok('so.addService', { id, name, price }); }
      sos.push({ id, d });
      if (chance(0.08)) { const o = DB.getState().sos.find(x => x.id === id); const l = o.parts[0]; if (l) ok('so.return', { id, lid: l.lid, qty: 1, reason: pick(['არ დასჭირდა', 'არასწორი ნაწილი']), serials: l.serials.slice(0, 1) }); }
      if (d < days - 10 && chance(0.45)) ok('so.close', { id });
    }
    si++;
  }
  if (d % 9 === 4) { const p = pick(branch); ok('transfer.create', { pid: p.id, from: 1, qty: p.liquid ? 20 : 1, loc: '' }); }
}
// Two last purchase orders bring every product back above zero, so all 800 are in stock.
now = new Date(END.getTime() - 3 * 36e5);
const empty = DB.getState().products.filter(p => p.stock[1].q <= 0);
const top = empty.map(p => ({ pid: p.id, qty: 10, price: p.cost || 10 }));
ok('po.create', { sup: SUP[0], wh: 1, lines: top.length ? top.slice(0, Math.ceil(top.length / 2)) : [{ pid: prods[0].id, qty: 20, price: prods[0].cost }] });
ok('po.create', { sup: SUP[1], wh: 1, lines: top.length > 1 ? top.slice(Math.ceil(top.length / 2)) : [{ pid: prods[1].id, qty: 20, price: prods[1].cost }] });
DB.exec('catalog.learn');
now = END;
const st = DB.getState();
const h = DB.handle(), n = t => h.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
console.log(JSON.stringify({
  file: FILE, products: st.products.length, inStock: st.products.filter(p => p.stock[1].q + p.stock[2].q > 0).length,
  vehicles: st.vehicles.length, modelYearGroups: new Set(st.vehicles.map(v => [v.make, v.model, v.year].join(' '))).size,
  warehouses: Object.keys(st.wh).length, locations: { wh1: st.locations.filter(l => l.wh === 1).length, wh2: st.locations.filter(l => l.wh === 2).length },
  suppliers: st.suppliers.length, purchaseOrders: st.pos.length, serviceOrders: st.sos.length,
  status: st.sos.reduce((a, o) => (a[o.status] = (a[o.status] || 0) + 1, a), {}), partLines: n('so_parts'), returns: n("moves WHERE type='ret'"),
  transfers: n('transfers'), catalogLinks: n('catalog'), vinLinks: n('fitment'), integrity: Object.values(h.prepare('PRAGMA integrity_check').get())[0]
}, null, 1));
DB.close();
