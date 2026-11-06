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
  assert.throws(() => DB.exec('vehicle.save', { plate: 'X', vin: 'AB12', make: 'a', model: 'b' }), /5–25/);
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

test('CSV import: one file creates products and updates stock; empty cells leave values unchanged', () => {
  fresh();
  const cols = r => r; // rows below are in template order: art, name, uom, min, qty, cost, loc, wh
  const rows = [
    cols(['OF-1', '', '', '', '20', '', 'A-01-02', '']),                     // existing: only stock and location change
    cols(['BP-1', 'ხუნდები', 'კომპლექტი', '1', '4', '140,5', 'A-02-01', '']), // new product with stock
    cols(['OF-1', '', '', '', '', '', '', '']),                               // duplicate for warehouse 1
    cols(['NEW-2', '', 'ცალი', '', '1', '', '', '']),                         // new product without a name
    cols(['OF-1', '', '', '', '3', '', '', '2'])                              // warehouse 2 is off
  ];
  const check = DB.exec('import.check', { type: 'products', rows });
  assert.deepEqual(check.rows.map(r => r.st), ['upd', 'new', 'err', 'err', 'err']);
  assert.equal(check.header, false);
  assert.match(check.rows[0].msg, /ნაშთი 0 → 20/);
  assert.match(check.rows[0].msg, /ლოკაცია A-01-01 → A-01-02/);
  assert.match(check.rows[1].msg, /ახალი ლოკაცია/);
  assert.deepEqual(DB.exec('import.apply', { type: 'products', rows }), { n: 1, u: 1, same: 0, skipped: 3 });
  let st = DB.getState();
  const of = st.products.find(p => p.art === 'OF-1'), bp = st.products.find(p => p.art === 'BP-1');
  assert.deepEqual([of.name, of.min, of.stock[1].q, of.stock[1].loc], ['ზეთის ფილტრი', 2, 20, 'A-01-02'], 'blank cells kept name and minimum');
  assert.deepEqual([bp.stock[1].q, bp.cost, bp.stock[1].loc], [4, 140.5, 'A-02-01']);
  // Same file again: nothing to change.
  assert.deepEqual(DB.exec('import.apply', { type: 'products', rows: rows.slice(0, 2) }), { n: 0, u: 0, same: 2, skipped: 0 });
  // Second warehouse: same article on two rows is fine when the warehouse differs.
  DB.exec('settings.set', { key: 'wh2', value: true });
  DB.exec('location.save', { wh: 2, code: 'Z-1' });
  const two = [['BP-1', '', '', '', '2', '', '', '1'], ['BP-1', '', '', '', '5', '', 'Z-1', '2']];
  assert.deepEqual(DB.exec('import.apply', { type: 'products', rows: two }), { n: 0, u: 2, same: 0, skipped: 0 });
  st = DB.getState();
  const b2 = st.products.find(p => p.art === 'BP-1');
  assert.deepEqual([b2.stock[1].q, b2.stock[2].q, b2.stock[2].loc], [2, 5, 'Z-1']);
});

test('CSV import recognises columns by header name, including the earlier templates', () => {
  fresh();
  // Earlier products template: price before quantity.
  const oldProducts = [['არტიკული', 'დასახელება', 'ზომის ერთეული', 'მინ. ნაშთი', 'ღირებულება', 'რაოდენობა', 'ლოკაცია'], ['AF-1', 'ანტიფრიზი', 'ლიტრი', '10', '9,5', '40', 'A-01-01']];
  const c1 = DB.exec('import.check', { type: 'products', rows: oldProducts });
  assert.equal(c1.header, true);
  assert.deepEqual(c1.missing, ['wh']);
  DB.exec('import.apply', { type: 'products', rows: oldProducts });
  let af = DB.getState().products.find(p => p.art === 'AF-1');
  assert.deepEqual([af.stock[1].q, af.cost], [40, 9.5], 'quantity and price not swapped');
  // Earlier opening-stock template: article, quantity, price, location, warehouse.
  const oldStock = [['არტიკული', 'რაოდენობა', 'ღირებულება', 'ლოკაცია', 'საწყობი'], ['AF-1', '25', '', '', '1'], ['UNKNOWN-9', '5', '', '', '1']];
  const c2 = DB.exec('import.check', { type: 'products', rows: oldStock });
  assert.deepEqual(c2.rows.map(r => r.st), ['upd', 'err']);
  assert.match(c2.rows[1].msg, /დასახელება/);
  DB.exec('import.apply', { type: 'products', rows: oldStock });
  af = DB.getState().products.find(p => p.art === 'AF-1');
  assert.deepEqual([af.name, af.stock[1].q, af.cost], ['ანტიფრიზი', 25, 9.5]);
  // Columns in any order with a header.
  const shuffled = [['რაოდენობა', 'არტიკული', 'დასახელება'], ['7', 'SH-1', 'ნათურა']];
  DB.exec('import.apply', { type: 'products', rows: shuffled });
  assert.equal(DB.getState().products.find(p => p.art === 'SH-1').stock[1].q, 7);
});

test('company name is required to finish setup', () => {
  DB.close(); DB.open(':memory:');
  assert.equal(DB.getState().settings.setupDone, false);
  assert.throws(() => DB.exec('setup.complete', { company: { name: ' ' } }), /კომპანიის/);
});

test('after a command only changed service orders are sent, and they match a full reload', () => {
  const { sup, pid, vid } = fresh();
  DB.exec('po.create', { sup, lines: [{ pid, qty: 5, price: 10 }] });
  const a = DB.exec('so.create', { vid, resp: 'ა' });
  DB.exec('so.create', { vid, resp: 'ბ' });
  DB.getState();
  DB.exec('so.issue', { id: a, pid, qty: 1 });
  const d = DB.getState({ delta: true });
  assert.equal(d.sos, undefined);
  assert.deepEqual(d.sosUpsert.map(o => o.id), [a]);
  assert.equal(d.sosUpsert[0].parts.length, 1);
  assert.equal(DB.getState({ delta: true }).sosUpsert.length, 0);
  day(2026, 11, 20);
  assert.equal(DB.getState({ delta: true }).sosUpsert.length, 2, 'auto-closed orders are sent as changes');
  const full = DB.getState();
  DB.close(); DB.open(':memory:');
  assert.equal(full.sos.every(o => o.status === 'auto'), true);
});

test('catalog recommendation can be switched off and on; negative stock stays forbidden', () => {
  fresh();
  assert.equal(DB.getState().settings.catalogRec, true);
  DB.exec('settings.set', { key: 'catalogRec', value: false });
  assert.equal(DB.getState().settings.catalogRec, false);
  DB.exec('settings.set', { key: 'catalogRec', value: true });
  assert.equal(DB.getState().settings.catalogRec, true);
  assert.throws(() => DB.exec('settings.set', { key: 'negativeStock', value: true }), /უცნობი პარამეტრი/);
});

test('VIN: 17 characters for road vehicles (no I/O/Q), 5–25 for machinery serials such as JCB', () => {
  fresh();
  const ok = ['JCB123456', 'JCB3CX1234', 'JCB3CX12345A', 'JCB3CX14TC1234567X', 'JCBJS220LC123456789AB', 'jcb-3cx-001234'];
  ok.forEach((vin, i) => DB.exec('vehicle.save', { plate: 'M-' + i, vin, make: 'JCB', model: '3CX' }));
  const saved = DB.getState().vehicles.map(v => v.vin);
  assert.ok(saved.includes('JCB-3CX-001234'), 'stored in capitals');
  assert.ok(saved.some(v => v.length === 21) && saved.some(v => v.length === 9));
  assert.throws(() => DB.exec('vehicle.save', { plate: 'Y', vin: 'JCB1', make: 'JCB', model: '3CX' }), /5–25/);
  assert.throws(() => DB.exec('vehicle.save', { plate: 'Y', vin: 'A'.repeat(26), make: 'JCB', model: '3CX' }), /5–25/);
  assert.throws(() => DB.exec('vehicle.save', { plate: 'Y', vin: 'JCB 3CX 12', make: 'JCB', model: '3CX' }), /ლათინური/);
  assert.throws(() => DB.exec('vehicle.save', { plate: 'Y', vin: 'MR0HA3CD1M051234O', make: 'Toyota', model: 'Hilux' }), /I, O, Q/);
  assert.deepEqual(DB.exec('import.check', { type: 'vehicles', rows: [['P1', 'JCBJS220LC987654321XY', 'JCB', 'JS220', '2019', '100', ''], ['P2', 'X1', 'JCB', '3CX', '', '', '']] }).rows.map(r => r.st), ['new', 'err']);
});

test('fitment matrix: VIN rows × article columns, marks, info columns, add-only and replace', () => {
  const { pid, vid } = fresh();
  const p2 = DB.exec('product.save', { art: 'BP-9', name: 'ხუნდები' });
  const v2 = DB.exec('vehicle.save', { plate: 'JC-001', vin: 'JCB3CX12345', make: 'JCB', model: '3CX' });
  const head = ['VIN', 'სახ. ნომერი', 'მოდელი', 'OF-1', 'bp-9', 'NOT-A-PART'];
  const rows = [head,
    ['MR0HA3CD1M0512345', 'AA-001-AA', 'Hilux', '1', '', 'x'],
    ['jcb3cx12345', 'JC-001', '3CX', 'x', '✓', ''],
    ['UNKNOWNVIN999', '', '', '1', '1', ''],
    ['JCB3CX12345', '', '', '', '', '']];
  const c = DB.exec('import.check', { type: 'fitment', rows });
  assert.deepEqual(c.unknown, ['NOT-A-PART']);
  assert.equal(c.articles, 2, 'info columns are not taken as articles; article match ignores case');
  assert.deepEqual(c.rows.map(r => r.st), ['upd', 'upd', 'err', 'err']);
  assert.deepEqual(DB.exec('import.apply', { type: 'fitment', rows }), { n: 3, u: 2, same: 0, skipped: 2 });
  assert.deepEqual(DB.getState().fitment, { [vid]: [pid], [v2]: [pid, p2].sort() });
  // Add-only: an empty cell does not remove an existing link.
  assert.deepEqual(DB.exec('import.apply', { type: 'fitment', rows: [['VIN', 'OF-1', 'BP-9'], ['JCB3CX12345', '', '1']] }), { n: 0, u: 0, same: 1, skipped: 0 });
  // Replace: only the marked parts stay for that VIN; other VINs are untouched.
  assert.match(DB.exec('import.check', { type: 'fitment', rows: [['VIN', 'OF-1', 'BP-9'], ['JCB3CX12345', '', '1']], replace: true }).rows[0].msg, /1 წაიშლება/);
  DB.exec('import.apply', { type: 'fitment', rows: [['VIN', 'OF-1', 'BP-9'], ['JCB3CX12345', '', '1']], replace: true });
  assert.deepEqual(DB.getState().fitment, { [vid]: [pid], [v2]: [p2] });
  // Manual link from the vehicle page, and the map is only re-sent when it changed.
  DB.getState({ delta: true });
  assert.equal('fitment' in DB.getState({ delta: true }), false);
  assert.equal(DB.exec('fitment.toggle', { vid: v2, pid }), true);
  assert.deepEqual(DB.getState({ delta: true }).fitment[v2].sort(), [pid, p2].sort());
  assert.throws(() => DB.exec('import.check', { type: 'fitment', rows: [head] }), /სათაურის/);
});
