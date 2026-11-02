'use strict';
// Business-rule tests: run with `npm test` (Node 22.5+ has node:sqlite built in).
const test = require('node:test');
const assert = require('node:assert/strict');
const DB = require('../src/main/db');

let now = new Date(2026, 10, 2, 10, 0, 0);
DB.setClock(() => now);
const day = (y, m, d) => { now = new Date(y, m - 1, d, 10, 0, 0); };

function fresh() {
  DB.close();
  DB.open(':memory:');
  day(2026, 11, 2);
  DB.exec('setup.complete', { company: { name: 'ტესტ კომპანია' }, whName: 'მთავარი' });
  DB.exec('location.bulkAdd', { wh: 1, codes: 'A-01-01\nA-01-02' });
  const sup = DB.exec('supplier.save', { name: 'მომწოდებელი' });
  const pid = DB.exec('product.save', { art: 'OF-1', name: 'ზეთის ფილტრი', uom: 'ცალი', min: 2, locs: { 1: 'A-01-01' } });
  const vid = DB.exec('vehicle.save', { plate: 'AA-001-AA', vin: 'MR0HA3CD1M0512345', make: 'Toyota', model: 'Hilux', year: 2021, km: 1000 });
  return { sup, pid, vid };
}
const prod = (st, id) => st.products.find(p => p.id === id);
const so = (st, id) => st.sos.find(o => o.id === id);

test('purchase order adds stock and keeps a weighted average cost', () => {
  const { sup, pid } = fresh();
  DB.exec('po.create', { sup, wh: 1, lines: [{ pid, qty: 10, price: 20 }] });
  DB.exec('po.create', { sup, wh: 1, lines: [{ pid, qty: 10, price: 30 }] });
  const p = prod(DB.getState(), pid);
  assert.equal(p.stock[1].q, 20);
  assert.equal(p.cost, 25);
});

test('document numbers are sequential per year', () => {
  const { sup, pid } = fresh();
  const a = DB.exec('po.create', { sup, lines: [{ pid, qty: 1, price: 1 }] });
  const b = DB.exec('po.create', { sup, lines: [{ pid, qty: 1, price: 1 }] });
  assert.equal(a, 'PO-2026-0001');
  assert.equal(b, 'PO-2026-0002');
  assert.equal(pid, 'P-00001');
});

test('issuing more than in stock is refused and nothing changes', () => {
  const { sup, pid, vid } = fresh();
  DB.exec('po.create', { sup, lines: [{ pid, qty: 2, price: 10 }] });
  const id = DB.exec('so.create', { vid, resp: 'ნ. ბერიძე' });
  assert.throws(() => DB.exec('so.issue', { id, pid, qty: 3 }), /არასაკმარისი ნაშთი/);
  const st = DB.getState();
  assert.equal(prod(st, pid).stock[1].q, 2);
  assert.equal(so(st, id).parts.length, 0);
});

test('issue and return move stock and price parts at average cost', () => {
  const { sup, pid, vid } = fresh();
  DB.exec('po.create', { sup, lines: [{ pid, qty: 5, price: 12 }] });
  const id = DB.exec('so.create', { vid, resp: 'ნ. ბერიძე' });
  DB.exec('so.issue', { id, pid, qty: 2 });
  let st = DB.getState();
  const lid = so(st, id).parts[0].lid;
  assert.equal(prod(st, pid).stock[1].q, 3);
  assert.equal(so(st, id).parts[0].price, 12);
  assert.throws(() => DB.exec('so.return', { id, lid, qty: 3 }), /დასაბრუნებელი/);
  DB.exec('so.return', { id, lid, qty: 1, reason: 'არ დასჭირდა' });
  st = DB.getState();
  assert.equal(prod(st, pid).stock[1].q, 4);
  assert.equal(so(st, id).parts[0].ret, 1);
});

test('service orders auto-close N days after the last change, not after opening', () => {
  const { vid } = fresh();
  day(2026, 11, 1);
  const id = DB.exec('so.create', { vid, resp: 'ა' });
  day(2026, 11, 6);
  DB.exec('so.addService', { id, name: 'დიაგნოსტიკა', price: '' });
  day(2026, 11, 10);
  assert.equal(so(DB.getState(), id).status, 'open');
  day(2026, 11, 13);
  const o = so(DB.getState(), id);
  assert.equal(o.status, 'auto');
  assert.equal(o.closedAt, '2026-11-13');
  assert.throws(() => DB.exec('so.addService', { id, name: 'x' }), /დახურულია/);
  DB.exec('so.reopen', { id });
  assert.equal(so(DB.getState(), id).status, 'open');
});

test('services accept an empty price', () => {
  const { vid } = fresh();
  const id = DB.exec('so.create', { vid, resp: 'ა' });
  DB.exec('so.addService', { id, name: 'ზეთის შეცვლა', price: '' });
  assert.equal(so(DB.getState(), id).svcs[0].price, null);
});

test('transfers need the second warehouse and enough stock', () => {
  const { sup, pid } = fresh();
  DB.exec('po.create', { sup, lines: [{ pid, qty: 5, price: 1 }] });
  assert.throws(() => DB.exec('transfer.create', { pid, from: 1, qty: 1 }), /მეორე საწყობი/);
  DB.exec('settings.set', { key: 'wh2', value: true });
  DB.exec('location.save', { wh: 2, code: 'B-01-01' });
  assert.throws(() => DB.exec('transfer.create', { pid, from: 1, qty: 6 }), /არასაკმარისი/);
  assert.throws(() => DB.exec('transfer.create', { pid, from: 1, qty: 1, loc: 'A-01-01' }), /არ არის სიაში/);
  DB.exec('transfer.create', { pid, from: 1, qty: 2, loc: 'B-01-01' });
  const p = prod(DB.getState(), pid);
  assert.deepEqual([p.stock[1].q, p.stock[2].q, p.stock[2].loc], [3, 2, 'B-01-01']);
  assert.throws(() => DB.exec('settings.set', { key: 'wh2', value: false }), /მეორე საწყობში ნაშთია/);
});

test('validation: duplicate article, bad VIN, unknown location', () => {
  fresh();
  assert.throws(() => DB.exec('product.save', { art: 'of-1', name: 'x' }), /უკვე არსებობს/);
  assert.throws(() => DB.exec('vehicle.save', { plate: 'X', vin: 'SHORT', make: 'a', model: 'b' }), /VIN/);
  assert.throws(() => DB.exec('product.save', { art: 'Z', name: 'z', locs: { 1: 'shelf 3' } }), /არ არის სიაში/);
});

test('locations: free codes, case-insensitive, rename moves products, delete only when empty', () => {
  const { pid } = fresh();
  DB.exec('location.save', { wh: 1, code: 'გარე საწყობი', note: 'ეზოში' });
  assert.throws(() => DB.exec('location.save', { wh: 1, code: 'a-01-01' }), /უკვე არსებობს/);
  assert.equal(DB.exec('location.bulkAdd', { wh: 1, codes: 'ZONE-3\na-01-02\n\nZONE-4' }), 2);
  DB.exec('product.save', { id: pid, art: 'OF-1', name: 'ზეთის ფილტრი', uom: 'ცალი', locs: { 1: 'zone-3' } });
  assert.equal(prod(DB.getState(), pid).stock[1].loc, 'ZONE-3');
  DB.exec('location.save', { wh: 1, oldCode: 'ZONE-3', code: 'ZONE-03' });
  assert.equal(prod(DB.getState(), pid).stock[1].loc, 'ZONE-03');
  assert.throws(() => DB.exec('location.delete', { wh: 1, code: 'ZONE-03' }), /პროდუქტია/);
  DB.exec('location.delete', { wh: 1, code: 'ZONE-4' });
  DB.exec('location.save', { wh: 1, oldCode: 'A-01-02', code: 'A-01-02', active: false });
  assert.throws(() => DB.exec('location.assign', { pid, wh: 1, loc: 'A-01-02' }), /გამორთულია/);
  const st = DB.getState();
  assert.deepEqual(st.locations.map(l => l.code).sort(), ['A-01-01', 'A-01-02', 'ZONE-03', 'გარე საწყობი']);
});

test('serial numbers: optional, one per unit, never on two vehicles at once', () => {
  const { sup, pid, vid } = fresh();
  DB.exec('po.create', { sup, lines: [{ pid, qty: 5, price: 10 }] });
  const a = DB.exec('so.create', { vid, resp: 'ა' });
  DB.exec('so.issue', { id: a, pid, qty: 1 });
  assert.throws(() => DB.exec('so.issue', { id: a, pid, qty: 1, serials: 'SN1, SN2' }), /მეტია რაოდენობაზე/);
  DB.exec('so.issue', { id: a, pid, qty: 2, serials: 'SN1, SN2' });
  const b = DB.exec('so.create', { vid, resp: 'ბ' });
  assert.throws(() => DB.exec('so.issue', { id: b, pid, qty: 1, serials: 'sn2' }), /SN2.*გაცემულია|უკვე გაცემულია/);
  let line = so(DB.getState(), a).parts[1];
  assert.deepEqual(line.serials, ['SN1', 'SN2']);
  DB.exec('so.return', { id: a, lid: line.lid, qty: 1, serials: ['SN2'] });
  DB.exec('so.issue', { id: b, pid, qty: 1, serials: 'SN2' });
  const first = so(DB.getState(), a).parts[0];
  DB.exec('so.setSerials', { id: a, lid: first.lid, serials: 'SN9' });
  assert.deepEqual(so(DB.getState(), a).parts[0].serials, ['SN9']);
  line = so(DB.getState(), a).parts[1];
  assert.deepEqual([line.retSerials, line.ret], [['SN2'], 1]);
});

test('catalog learns products used twice on the same model', () => {
  const { sup, pid, vid } = fresh();
  DB.exec('po.create', { sup, lines: [{ pid, qty: 5, price: 1 }] });
  for (let i = 0; i < 2; i++) { const id = DB.exec('so.create', { vid, resp: 'ა' }); DB.exec('so.issue', { id, pid, qty: 1 }); }
  assert.equal(DB.exec('catalog.learn'), 1);
  assert.deepEqual(DB.getState().catalog, [{ model: 'Toyota Hilux', pid }]);
  assert.equal(DB.exec('catalog.toggle', { model: 'Toyota Hilux', pid }), false);
});

test('CSV import checks rows and applies only valid ones', () => {
  fresh();
  const rows = [['OF-1', 'ზეთის ფილტრი', 'ცალი', '3', '', '', 'A-01-02'], ['BP-1', 'ხუნდები', 'კომპლექტი', '1', '140,5', '4', 'A-02-01'], ['', '', 'ცალი', '', 'abc', '', '']];
  assert.deepEqual(DB.exec('import.check', { type: 'products', rows }).map(r => r.st), ['upd', 'new', 'err']);
  assert.deepEqual(DB.exec('import.apply', { type: 'products', rows }), { n: 1, u: 1, skipped: 1 });
  const st = DB.getState(), bp = st.products.find(p => p.art === 'BP-1');
  assert.deepEqual([bp.stock[1].q, bp.cost, bp.stock[1].loc], [4, 140.5, 'A-02-01']);
  assert.deepEqual(DB.exec('import.apply', { type: 'stock', rows: [['BP-1', '2', '', '', '1']] }), { n: 0, u: 1, skipped: 0 });
  assert.equal(DB.getState().products.find(p => p.art === 'BP-1').stock[1].q, 2);
});

test('company name is required to finish setup', () => {
  DB.close(); DB.open(':memory:');
  assert.equal(DB.getState().settings.setupDone, false);
  assert.throws(() => DB.exec('setup.complete', { company: { name: ' ' } }), /კომპანიის/);
});
