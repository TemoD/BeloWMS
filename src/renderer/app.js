'use strict';
/* Axioma WMS — screens. Data lives in the local SQLite database; every change goes through window.api (src/preload.js)
   to src/main/db.js, which validates it and returns the fresh state. */

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
let S = null, TODAY = '';
const MONTHS = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (Math.round((n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ') + ' ₾';
const qfmt = n => (Math.round((n || 0) * 100) / 100).toLocaleString('en-US').replace(/,/g, ' ');
const fmtD = d => d ? d.slice(0, 10).split('-').reverse().join('.') : '—';
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const norm = s => String(s || '').toUpperCase().replace(/[\s\-]/g, '');
const pad2 = n => String(n).padStart(2, '0');
const jsq = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); // for values placed inside onclick='…' strings

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.5 12h12l2-8H6.2"/>',
  truck: '<path d="M2 6h11v10H2z"/><path d="M13 9h4l4 4v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 9h18M3 15h18M12 3v18"/>',
  car: '<path d="M5 12l1.8-5h10.4L19 12"/><rect x="3" y="12" width="18" height="5" rx="1.5"/><circle cx="7.5" cy="17.5" r="1.6"/><circle cx="16.5" cy="17.5" r="1.6"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  arrowIn: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
  arrowOut: '<path d="M12 20V8M7 13l5-5 5 5M5 4h14"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  chevronL: '<path d="M15 6l-6 6 6 6"/>',
  chevronR: '<path d="M9 6l6 6-6 6"/>',
  folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
};
const ic = n => `<svg class="i" viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`;
const btn = (label, on, cls = '', icon = '', dis = false, id = '') => `<button class="btn ${cls}" ${id ? `id="${id}"` : ''} onclick="${on}" ${dis ? 'disabled' : ''}>${icon ? ic(icon) : ''}${label}</button>`;
const plate = p => `<span class="plate"><i>GE</i><span>${esc(p)}</span></span>`;

/* ================= talking to the database ================= */
// A full state carries `sos`; after a command only the changed service orders arrive in `sosUpsert` and are merged here.
function apply(st) {
  if (!st.sos) {
    const up = new Map((st.sosUpsert || []).map(o => [o.id, o]));
    const prev = S ? S.sos : [];
    const known = new Set(prev.map(o => o.id));
    const merged = up.size ? prev.map(o => up.get(o.id) || o) : prev;
    const added = [...up.values()].filter(o => !known.has(o.id));
    st.sos = added.length ? [...added, ...merged].sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : merged;
  }
  if (!st.fitment) st.fitment = S ? S.fitment : {};
  delete st.sosUpsert;
  S = st; TODAY = st.today;
}
// Runs a command; on success the page re-renders with the new state and the command's result is returned.
async function call(name, args, okMsg) {
  const r = await window.api.invoke('cmd', name, args);
  if (!r.ok) { toast(r.error, 'err'); return undefined; }
  apply(r.state); render();
  if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r.result) : okMsg);
  return r.result === undefined || r.result === null ? true : r.result;
}

/* ================= model helpers ================= */
// Lookups by id and the catalog are indexed once per state (S is replaced, never mutated, after each command).
let _ix = null, _ixFor = null;
function ix() {
  if (_ixFor === S) return _ix;
  const byId = list => new Map(list.map(x => [x.id, x]));
  _ix = { p: byId(S.products), v: byId(S.vehicles), so: byId(S.sos), sup: byId(S.suppliers), cat: null, at: null };
  _ixFor = S;
  return _ix;
}
const P = id => ix().p.get(id);
const V = id => ix().v.get(id);
const SO = id => ix().so.get(id);
const SUP = id => ix().sup.get(id) || { name: '—' };
const whs = () => S.settings.wh2 ? [1, 2] : [1];
const totQ = p => whs().reduce((a, w) => a + p.stock[w].q, 0);
const isLow = p => p.min > 0 && totQ(p) < p.min;
// Catalog group: make + model + year (year left out when unknown). Same rule as MODEL_SQL in db.js.
const modelKey = v => [v.make, v.model, v.year].filter(Boolean).join(' ');
const models = () => [...new Set(S.vehicles.map(modelKey))].sort();
const partsCost = o => o.parts.reduce((a, l) => a + (l.qty - l.ret) * l.price, 0);
const svcCost = o => o.svcs.reduce((a, s) => a + (+s.price || 0), 0);
const soCost = o => partsCost(o) + svcCost(o);
const autoBase = o => o.lastChange || o.date;
const daysLeft = o => S.settings.autoClose - daysBetween(autoBase(o), TODAY);
const refAct = r => r.startsWith('SO') ? `go('so','${r}')` : r.startsWith('PO') ? `viewPO('${r}')` : '';
const lastBackup = () => { try { return JSON.parse(S.settings.lastBackup); } catch { return null; } };
// model → Map(pid → {pid, manual, hist}); hist = number of service orders that still have the part on that model.
function catIndex() {
  const x = ix();
  if (x.cat) return x.cat;
  const idx = new Map();
  const entry = (m, pid) => { let mm = idx.get(m); if (!mm) idx.set(m, mm = new Map()); let e = mm.get(pid); if (!e) mm.set(pid, e = { pid, manual: false, hist: 0 }); return e; };
  S.catalog.forEach(c => { entry(c.model, c.pid).manual = true; });
  S.sos.forEach(o => {
    const v = V(o.vid);
    if (v) new Set(o.parts.filter(l => l.qty - l.ret > 0).map(l => l.pid)).forEach(pid => { entry(modelKey(v), pid).hist++; });
  });
  return (x.cat = idx);
}
const usedPids = o => new Set(o.parts.filter(l => l.qty - l.ret > 0).map(l => l.pid));
function catEntries(model, excludeSO) {
  const mm = catIndex().get(model);
  if (!mm) return [];
  const own = excludeSO && SO(excludeSO) ? usedPids(SO(excludeSO)) : null;
  return [...mm.values()].map(e => own && own.has(e.pid) ? { ...e, hist: e.hist - 1 } : e)
    .filter(e => (e.manual || e.hist > 0) && P(e.pid)).sort((a, b) => (b.manual - a.manual) || (b.hist - a.hist));
}
// Parts linked to one exact vehicle (VIN), e.g. from the fitment matrix import.
const fitOf = vid => (S.fitment && S.fitment[vid]) || [];
const fitsVin = (vid, pid) => fitOf(vid).includes(pid);
// Recommendations for a service order: the VIN's own parts first, then the model catalog and history.
function recsFor(o, v) {
  const m = modelKey(v), own = fitOf(v.id).filter(pid => P(pid));
  const ownSet = new Set(own);
  return [...own.map(pid => ({ pid, vin: true, manual: !!catEntry(m, pid)?.manual, hist: catEntry(m, pid)?.hist || 0 })),
    ...catEntries(m, o.id).filter(e => !ownSet.has(e.pid))];
}
const catEntry = (model, pid) => { const e = catIndex().get(model)?.get(pid); return e && (e.manual || e.hist > 0) ? e : null; };
const inCatalog = (model, pid) => !!catEntry(model, pid);

// Long lists show the first rows and a "show more" button; search still covers everything.
const PAGE = 200;
let LIM = {};
function limited(key, list) {
  const n = LIM[key] || PAGE;
  return { rows: list.slice(0, n), more: list.length > n ? `<div style="padding:12px;text-align:center;border-top:1px solid var(--line2)"><button class="btn" onclick="LIM['${key}']=${n + 500};render()">მეტის ჩვენება · ნაჩვენებია ${n} / ${list.length}</button></div>` : '' };
}
function findProduct(str) {
  const s = String(str || '').trim();
  if (!s) return null;
  const tok = s.split(' · ')[0].trim();
  return P(tok) || S.products.find(p => norm(p.art) === norm(tok)) || S.products.find(p => p.name.toLowerCase().includes(s.toLowerCase()));
}
function statusBadge(o) {
  if (o.status === 'open') return '<span class="badge b-open">ღია</span>';
  if (o.status === 'auto') return '<span class="badge b-auto">ავტო-დახურული</span>';
  return '<span class="badge b-closed">დახურული</span>';
}
const stockBadge = p => isLow(p) ? '<span class="badge b-low">მცირე მარაგი</span>' : '<span class="badge b-ok">საკმარისი</span>';
const natural = (a, b) => a.localeCompare(b, 'ka', { numeric: true, sensitivity: 'base' });
const sameCode = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const locsOf = (wh, activeOnly = false) => S.locations.filter(l => l.wh === +wh && (!activeOnly || l.active)).sort((a, b) => natural(a.code, b.code));
// Products grouped by warehouse and location (lower-case code), built once per state.
function productsAt(wh, code) {
  const x = ix();
  if (!x.at) { x.at = new Map(); S.products.forEach(p => [1, 2].forEach(w => { const k = w + '|' + String(p.stock[w].loc || '').toLowerCase(); if (!x.at.has(k)) x.at.set(k, []); x.at.get(k).push(p); })); }
  return x.at.get(wh + '|' + String(code || '').toLowerCase()) || [];
}
// Every serial on a service-order line that is still on the vehicle (issued, not returned).
const outSerials = l => l.serials.filter(s => !l.retSerials.some(x => sameCode(x, s)));
function fillDatalists() {
  $('#dlp').innerHTML = S.products.map(p => `<option value="${p.id} · ${esc(p.art)} · ${esc(p.name)}">`).join('');
  $('#dls').innerHTML = [...new Set(S.sos.flatMap(o => o.svcs.map(s => s.name)))].map(n => `<option value="${esc(n)}">`).join('');
  const rs = [];
  S.sos.slice().sort((a, b) => autoBase(b).localeCompare(autoBase(a))).forEach(o => { if (o.resp && !rs.includes(o.resp)) rs.push(o.resp); });
  $('#dlr').innerHTML = rs.map(r => `<option value="${esc(r)}">`).join('');
  [1, 2].forEach(w => { $('#dlloc' + w).innerHTML = locsOf(w, true).map(l => `<option value="${esc(l.code)}">${esc(l.note)}</option>`).join(''); });
}

/* ================= UI shell ================= */
const NAV = [
  ['ოპერაციები', [['dashboard', 'მთავარი', 'home'], ['sos', 'სერვის ორდერები', 'wrench'], ['purchases', 'შესყიდვის ორდერები', 'cart']]],
  ['მასტერ დატა', [['products', 'პროდუქტები', 'box'], ['stock', 'საწყობი და ლოკაციები', 'grid'], ['vehicles', 'ტექნიკის რეესტრი', 'car'], ['catalog', 'კატალოგი', 'book'], ['suppliers', 'მომწოდებლები', 'truck']]],
  ['ანალიტიკა', [['reports', 'რეპორტები', 'chart']]]
];
const PARENT = { so: 'sos', vehicle: 'vehicles' };
let route = { page: 'dashboard', id: null };
function go(page, id = null) { if (page !== route.page) LIM = {}; route = { page, id }; render(); $('#content').scrollTop = 0; }
function renderNav() {
  const act = PARENT[route.page] || route.page, openN = S.sos.filter(o => o.status === 'open').length, lowN = S.products.filter(isLow).length;
  const item = ([k, l, i]) => `<button class="nav ${act === k ? 'on' : ''}" onclick="go('${k}')" title="${l}">${ic(i)}<span class="lab">${l}</span>${k === 'sos' && openN ? `<span class="cnt">${openN}</span>` : ''}${k === 'products' && lowN ? `<span class="cnt" style="background:#7a2a24">${lowN}</span>` : ''}</button>`;
  $('#side').innerHTML = NAV.map(([h, items]) => `<h6>${h}</h6>` + items.map(item).join('')).join('') + `<div class="spacer"></div>${item(['settings', 'პარამეტრები', 'gear'])}`;
  $('#sbWh').textContent = 'საწყობი: ' + whs().map(w => S.wh[w]).join(', ');
  const lb = lastBackup();
  $('#sbBk').textContent = 'სარეზერვო ასლი: ' + (lb ? lb.at.slice(0, 16).split(' ').map((x, i) => i ? x : fmtD(x)).join(' ') : 'ჯერ არ შექმნილა') + (S.settings.backupDir && !S.backupOk ? ' · დისკი არ არის მიერთებული' : '');
  $('#sbVer').textContent = 'Axioma WMS v' + S.app.version;
}
const VIEWS = {};
function render() {
  if (!S) return;
  document.body.classList.toggle('setup', !S.settings.setupDone);
  if (!S.settings.setupDone) { $('#page').innerHTML = vSetup(); return; }
  renderNav(); fillDatalists();
  $('#page').innerHTML = (VIEWS[route.page] || VIEWS.dashboard)(route.id);
  if (route.page === 'settings') loadBackups();
}
const ph = (title, sub, acts = '', crumb = '') => `${crumb ? `<div class="crumb">${crumb}</div>` : ''}<div class="ph"><div><h1>${title}</h1>${sub ? `<div class="sub muted">${sub}</div>` : ''}</div><div class="acts">${acts}</div></div>`;
const kpi = (l, v, s, cls = '') => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = ic(type === 'ok' ? 'check' : type === 'err' ? 'alert' : 'info') + '<span>' + esc(msg) + '</span>';
  $('#toasts').appendChild(t);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  setTimeout(() => t.remove(), type === 'err' ? 6000 : 3400);
}
function openModal(title, body, foot, wide = false) {
  $('#mt').textContent = title; $('#mbody').innerHTML = body; $('#mfoot').innerHTML = foot;
  $('#mbox').className = 'modal' + (wide ? ' wide' : ''); $('#modal').hidden = false;
  setTimeout(() => { const f = $('#mbody [autofocus]'); if (f) f.focus(); }, 30);
}
function closeModal() { $('#modal').hidden = true; }
const whSelect = (id, val = 1, on = '') => S.settings.wh2 ? `<select id="${id}" onchange="${on}">${whs().map(w => `<option value="${w}" ${+val === w ? 'selected' : ''}>${esc(S.wh[w])}</option>`).join('')}</select>` : '';
const emptyRow = (cols, text) => `<tr><td colspan="${cols}" class="empty">${text}</td></tr>`;
// Keeps focus in a search box that re-renders the page on every keystroke.
function refocus(sel) { const e = $(sel); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }

/* ================= first-run setup ================= */
let compLogo = '';
function logoInput(prevId) {
  return `<label class="btn sm">${ic('upload')}ფაილის არჩევა<input type="file" hidden accept="image/png,image/jpeg,image/webp" onchange="readLogo(this.files[0],'${prevId}')"></label>`;
}
function readLogo(f, prevId) {
  if (!f) return;
  if (f.size > 500 * 1024) return toast('ლოგო ძალიან დიდია — მაქსიმუმ 500 KB', 'err');
  const r = new FileReader();
  r.onload = () => { compLogo = r.result; const el = document.getElementById(prevId); if (el) el.innerHTML = `<img class="logo-prev" src="${compLogo}" alt="">`; };
  r.readAsDataURL(f);
}
function companyFields(c) {
  return `<div class="field"><label class="req">კომპანიის დასახელება</label><input id="cn" value="${esc(c.name)}" autofocus placeholder="შპს „…“"><span class="hint">ჩანს PDF ფორმებზე</span></div>
   <div class="grid2"><div class="field"><label>საიდენტიფიკაციო კოდი (ს/კ)</label><input id="ct" value="${esc(c.tin)}"></div>
    <div class="field"><label>ტელეფონი</label><input id="cp" value="${esc(c.phone)}"></div></div>
   <div class="field"><label>მისამართი</label><input id="ca" value="${esc(c.address)}"></div>
   <div class="field"><label>ლოგო (არასავალდებულო)</label><div style="display:flex;gap:12px;align-items:center"><span id="logoPrev">${c.logo ? `<img class="logo-prev" src="${c.logo}" alt="">` : ''}</span>${logoInput('logoPrev')}${c.logo ? btn('წაშლა', "compLogo='';$('#logoPrev').innerHTML=''", 'sm ghost danger') : ''}</div></div>`;
}
const companyValues = () => ({ name: $('#cn').value, tin: $('#ct').value, phone: $('#cp').value, address: $('#ca').value, logo: compLogo });
function vSetup() {
  compLogo = S.settings.company.logo || '';
  return `<div class="setup-card"><header><h1>კეთილი იყოს თქვენი მობრძანება Axioma WMS-ში</h1><div class="muted">პირველი გაშვება: შეავსეთ კომპანიის მონაცემები. ყველაფერი ინახება ამ კომპიუტერზე, ინტერნეტი არ არის საჭირო.</div></header>
   <div class="body">${companyFields(S.settings.company)}
    <div class="field"><label>მთავარი საწყობის დასახელება</label><input id="cw" value="${esc(S.wh[1])}"></div></div>
   <footer>${btn('დაწყება', 'finishSetup()', 'primary', 'check')}</footer></div>`;
}
async function finishSetup() {
  if (await call('setup.complete', { company: companyValues(), whName: $('#cw').value })) { go('dashboard'); toast('მზადაა — დაიწყეთ მონაცემების იმპორტით'); }
}

/* ================= global search ================= */
function gSearch() {
  const q = $('#gs').value.trim(), box = $('#gsr');
  if (q.length < 2) { box.hidden = true; return; }
  const n = norm(q), ql = q.toLowerCase();
  const vs = S.vehicles.filter(v => norm(v.plate).includes(n) || norm(v.vin).includes(n) || modelKey(v).toLowerCase().includes(ql)).slice(0, 5);
  const ps = S.products.filter(p => norm(p.art).includes(n) || norm(p.id).includes(n) || p.name.toLowerCase().includes(ql) || whs().some(w => norm(p.stock[w].loc).startsWith(n))).slice(0, 6);
  const os = [...S.sos, ...S.pos].filter(o => norm(o.id).includes(n)).slice(0, 5);
  const sns = [];
  S.sos.forEach(o => o.parts.forEach(l => l.serials.forEach(s => { if (norm(s).includes(n)) sns.push({ o, l, s }); })));
  let h = '';
  if (sns.length) h += '<h6>სერიული ნომრები</h6>' + sns.slice(0, 6).map(({ o, l, s }) => `<button onmousedown="go('so','${o.id}')"><span class="mono"><b>${esc(s)}</b></span><span>${esc(P(l.pid).name)}</span><span class="sub" style="margin-left:auto">${esc(V(o.vid).plate)} · ${o.id}${l.retSerials.some(x => sameCode(x, s)) ? ' · დაბრუნებულია' : ''}</span></button>`).join('');
  if (vs.length) h += '<h6>ტექნიკა</h6>' + vs.map(v => `<button onmousedown="go('vehicle','${v.id}')">${plate(v.plate)}<span>${esc(modelKey(v))}</span><span class="mono sub" style="margin-left:auto">${esc(v.vin)}</span></button>`).join('');
  if (ps.length) h += '<h6>პროდუქტები</h6>' + ps.map(p => `<button onmousedown="openProduct('${p.id}')"><span class="mono">${esc(p.art)}</span><span>${esc(p.name)}</span><span class="sub" style="margin-left:auto">${ic('pin')} ${esc(p.stock[1].loc || '—')} · ${qfmt(totQ(p))} ${esc(p.uom)}</span></button>`).join('');
  if (os.length) h += '<h6>დოკუმენტები</h6>' + os.map(o => `<button onmousedown="${o.vid ? `go('so','${o.id}')` : `viewPO('${o.id}')`}"><span class="mono">${o.id}</span><span class="sub">${fmtD(o.date)}</span>${o.vid ? statusBadge(o) : ''}</button>`).join('');
  box.innerHTML = h || '<div class="empty">ვერაფერი მოიძებნა</div>';
  box.hidden = false;
}

/* ================= dashboard ================= */
VIEWS.dashboard = () => {
  const val = S.products.reduce((a, p) => a + totQ(p) * p.cost, 0), open = S.sos.filter(o => o.status === 'open'), low = S.products.filter(isLow);
  const ym = TODAY.slice(0, 7), mc = S.sos.filter(o => o.date.startsWith(ym)).reduce((a, o) => a + soCost(o), 0);
  const steps = [
    [S.locations.length > 0, 'ლოკაციების სია', "go('stock')", 'თაროები, ზონები — ან შეიქმნება CSV იმპორტისას'],
    [S.products.length > 0, 'პროდუქტების და ნაშთის იმპორტი CSV-დან', "openImport('products')", 'რაოდენობა, ფასი, ლოკაცია — ერთ ფაილში; ან ხელით „პროდუქტები“ გვერდზე'],
    [S.vehicles.length > 0, 'ტექნიკის იმპორტი CSV-დან', "openImport('vehicles')", 'ან დაამატეთ ხელით „ტექნიკის რეესტრში“'],
    [!!S.settings.backupDir, 'სარეზერვო საქაღალდის არჩევა (USB / SSD)', 'chooseBackupDir()', 'ასლი ავტომატურად იქმნება პროგრამის დახურვისას']
  ];
  const start = steps.some(s => !s[0]) ? `<div class="card"><header><h3>${ic('spark')} დაწყება</h3><span class="sub">${steps.filter(s => s[0]).length} / ${steps.length}</span></header><div class="steps">
    ${steps.map(([done, t, on, sub]) => `<div class="rec ${done ? 'done' : ''}"><div class="n"><div>${t}</div><div class="sub">${sub}</div></div>${done ? '<span class="badge b-ok">შესრულებულია</span>' : btn('გახსნა', on, 'sm')}</div>`).join('')}</div></div>` : '';
  return ph('მთავარი', 'დღეს: ' + fmtD(TODAY) + ' · ' + whs().map(w => esc(S.wh[w])).join(', ')) + start +
    `<div class="kpis">
    ${kpi('ნაშთის ღირებულება', money(val), S.products.length + ' პროდუქტი')}
    ${kpi('ღია სერვის ორდერი', open.length, 'ავტო-დახურვა ბოლო ცვლილებიდან ' + S.settings.autoClose + ' დღეში')}
    ${kpi('მცირე მარაგი', low.length, 'მინიმალურ ნაშთზე ნაკლები', low.length ? 'warn' : '')}
    ${kpi('დანახარჯი — ' + MONTHS[+ym.slice(5) - 1], money(mc), 'ნაწილები + მომსახურება')}
  </div>
  <div class="quick">
    <button onclick="newSO()">${ic('wrench')}ახალი სერვის ორდერი</button>
    <button onclick="openPO()">${ic('cart')}ახალი შესყიდვა</button>
    <button onclick="openProduct()">${ic('box')}ახალი პროდუქტი</button>
    <button onclick="go('stock')">${ic('pin')}ლოკაციით ძებნა</button>
  </div>
  <div class="cols">
    <div class="card"><header><h3>ღია სერვის ორდერები</h3><div class="acts">${btn('ყველა', "go('sos')", 'ghost sm')}</div></header>
      <div class="tw"><table class="t"><thead><tr><th>№</th><th>ტექნიკა</th><th>პასუხისმგებელი</th><th class="num">ჯამი</th><th>ავტო-დახურვა</th></tr></thead><tbody>
      ${open.map(o => { const v = V(o.vid), d = daysLeft(o); return `<tr class="click" onclick="go('so','${o.id}')"><td class="mono">${o.id}</td><td>${plate(v.plate)} <span class="sub">${esc(modelKey(v))}</span></td><td>${esc(o.resp)}</td><td class="num">${money(soCost(o))}</td><td><span class="badge ${d <= 2 ? 'b-auto' : 'b-closed'}">${d <= 0 ? 'დღეს' : d + ' დღეში'}</span></td></tr>`; }).join('') || emptyRow(5, 'ღია ორდერი არ არის')}
      </tbody></table></div></div>
    <div class="card"><header><h3>მცირე მარაგი</h3></header>
      ${low.map(p => `<div class="rec"><div class="n"><div>${esc(p.name)}</div><div class="sub mono">${esc(p.art)} · ${esc(p.stock[1].loc || '—')}</div></div><div class="num"><b style="color:var(--bad)">${qfmt(totQ(p))}</b> <span class="sub">/ მინ. ${qfmt(p.min)}</span></div>${btn('შესყიდვა', `openPO('${p.id}')`, 'sm', 'cart')}</div>`).join('') || '<div class="empty">ყველა პოზიცია საკმარისია</div>'}
    </div>
  </div>
  <div class="card"><header><h3>ბოლო მოძრაობები</h3><div class="acts">${btn('ჟურნალი', "repTab='moves';go('reports')", 'ghost sm')}</div></header>${movesTable(S.moves.slice(0, 8))}</div>`;
};
const MOVE_T = { in: ['შემოსავალი', 'b-ok'], out: ['გაცემა', 'b-open'], ret: ['დაბრუნება', 'b-auto'], tr: ['გადაადგილება', 'b-closed'], imp: ['იმპორტი', 'b-ok'] };
const moveSign = t => ({ out: '−', tr: '↔ ', imp: '= ' }[t] ?? '+');
function movesTable(list) {
  const wh2 = S.settings.wh2;
  return `<div class="tw"><table class="t"><thead><tr><th>თარიღი</th><th>ტიპი</th><th>დოკუმენტი</th><th>პროდუქტი</th>${wh2 ? '<th>საწყობი</th>' : ''}<th class="num">რაოდენობა</th></tr></thead><tbody>
  ${list.map(m => { const p = P(m.pid) || { name: m.pid, art: '', uom: '' }, t = MOVE_T[m.type] || [m.type, '']; const act = refAct(m.ref); return `<tr><td>${fmtD(m.date)}</td><td><span class="badge ${t[1]}">${t[0]}</span></td><td class="mono">${act ? `<a style="color:var(--accent);cursor:pointer" onclick="${act}">${esc(m.ref)}</a>` : esc(m.ref)}</td><td>${esc(p.name)} <span class="sub mono">${esc(p.art)}</span>${m.note ? ` <span class="sub">· ${esc(m.note)}</span>` : ''}</td>${wh2 ? `<td>${m.type === 'tr' ? esc(S.wh[m.wh]) + ' → ' + esc(S.wh[m.to]) : esc(S.wh[m.wh])}</td>` : ''}<td class="num">${moveSign(m.type)}${qfmt(m.qty)} ${esc(p.uom)}</td></tr>`; }).join('') || emptyRow(wh2 ? 6 : 5, 'მოძრაობა ჯერ არ არის')}
  </tbody></table></div>`;
}

/* ================= service orders ================= */
let soFilter = 'all', soQ = '';
VIEWS.sos = () => {
  const n = norm(soQ);
  const match = k => o => k === 'all' || (k === 'open' ? o.status === 'open' : o.status !== 'open');
  const list = S.sos.filter(match(soFilter)).filter(o => { if (!n) return true; const v = V(o.vid); return norm(o.id).includes(n) || norm(v.plate).includes(n) || norm(v.vin).includes(n) || norm(o.resp).includes(n); });
  return ph('სერვის ორდერები', 'ნაწილების გაცემა/დაბრუნება მანქანაზე · ღია ორდერი ავტომატურად იხურება ბოლო ცვლილებიდან ' + S.settings.autoClose + ' დღეში', btn('ახალი სერვის ორდერი', 'newSO()', 'primary', 'plus')) +
    `<div class="filters"><div class="seg">${[['all', 'ყველა'], ['open', 'ღია'], ['closed', 'დახურული']].map(([k, l]) => `<button class="${soFilter === k ? 'on' : ''}" onclick="soFilter='${k}';render()">${l} (${S.sos.filter(match(k)).length})</button>`).join('')}</div>
   <input id="soq" placeholder="ძებნა: №, სახ. ნომერი, VIN, პასუხისმგებელი" value="${esc(soQ)}" oninput="soQ=this.value;LIM={};render();refocus('#soq')" style="width:340px"></div>
  <div class="card"><div class="tw"><table class="t"><thead><tr><th>№</th><th>თარიღი</th><th>ტექნიკა</th><th>VIN</th><th>პასუხისმგებელი</th><th class="num">ნაწილები</th><th class="num">მომსახურება</th><th class="num">სულ</th><th>სტატუსი</th></tr></thead><tbody>
  ${limited('sos', list).rows.map(o => { const v = V(o.vid); return `<tr class="click" onclick="go('so','${o.id}')"><td class="mono">${o.id}</td><td>${fmtD(o.date)}</td><td>${plate(v.plate)} <span class="sub">${esc(modelKey(v))}</span></td><td class="mono sub">${esc(v.vin)}</td><td>${esc(o.resp)}</td><td class="num">${money(partsCost(o))}</td><td class="num">${o.svcs.length ? money(svcCost(o)) : '—'}</td><td class="num"><b>${money(soCost(o))}</b></td><td>${statusBadge(o)}${o.status === 'open' ? `<div class="sub">${daysLeft(o) <= 0 ? 'იხურება დღეს' : 'იხურება ' + daysLeft(o) + ' დღეში'}</div>` : ''}</td></tr>`; }).join('') || emptyRow(9, S.sos.length ? 'ორდერი ვერ მოიძებნა' : 'სერვის ორდერი ჯერ არ არის — დააჭირეთ „ახალი სერვის ორდერი“')}
  </tbody></table></div>${limited('sos', list).more}</div>`;
};
let nsVid = null, soRecAll = false;
function newSO(vid = null) {
  if (!S.vehicles.length) { toast('ჯერ დაამატეთ ტექნიკა რეესტრში', 'info'); go('vehicles'); return; }
  nsVid = vid;
  const v = vid ? V(vid) : null;
  openModal('ახალი სერვის ორდერი', `
   <div class="field"><label class="req">ტექნიკის ძებნა — სახელმწიფო ნომრით ან VIN კოდით</label><input id="nsq" ${v ? '' : 'autofocus'} value="${v ? esc(v.plate) : ''}" placeholder="მაგ. TB-482 ან MR0HA3…" oninput="nsSearch()" autocomplete="off"></div>
   <div class="pick" id="nsres"></div>
   <div class="grid2">
    <div class="field"><label class="req">პასუხისმგებელი პირი</label><input id="nsr" list="dlr" ${v ? 'autofocus' : ''} placeholder="სახელი, გვარი" autocomplete="off"><span class="hint">თავისუფალი ტექსტი · აკრეფისას გთავაზობთ ბოლო შეყვანილებს</span></div>
    <div class="field"><label>გარბენი (კმ / საათი)</label><input id="nsk" type="number" min="0" placeholder="${v ? 'ბოლო: ' + v.km : ''}"></div>
   </div>`, btn('გაუქმება', 'closeModal()') + btn('ორდერის გახსნა', 'createSO()', 'primary', 'check'));
  nsSearch();
}
function nsPick(id) {
  nsVid = id;
  const v = V(id), last = S.sos.find(o => o.vid === id);
  $('#nsk').placeholder = 'ბოლო: ' + v.km;
  $('#nsr').placeholder = last ? 'ბოლო: ' + last.resp : 'სახელი, გვარი';
  nsSearch();
}
function nsSearch() {
  const n = norm($('#nsq')?.value);
  const list = S.vehicles.filter(v => !n || norm(v.plate).includes(n) || norm(v.vin).includes(n)).slice(0, 50);
  $('#nsres').innerHTML = list.map(v => `<button class="${nsVid === v.id ? 'on' : ''}" onclick="nsPick('${v.id}')">${plate(v.plate)}<span>${esc(modelKey(v))}${v.year ? ' · ' + esc(v.year) : ''}</span><span class="mono sub" style="margin-left:auto">${esc(v.vin)}</span></button>`).join('') || `<div class="empty">ტექნიკა ვერ მოიძებნა · <a style="color:var(--accent);cursor:pointer" onclick="openVehicle()">რეესტრში დამატება</a></div>`;
}
async function createSO() {
  if (!nsVid) return toast('აირჩიეთ ტექნიკა სიიდან', 'err');
  const id = await call('so.create', { vid: nsVid, resp: $('#nsr').value, km: $('#nsk').value });
  if (id) { closeModal(); go('so', id); toast('სერვის ორდერი ' + id + ' გაიხსნა'); }
}
VIEWS.so = id => {
  const o = SO(id);
  if (!o) return VIEWS.sos();
  const v = V(o.vid), closed = o.status !== 'open', m = modelKey(v), wh2 = S.settings.wh2;
  const recAll = recsFor(o, v), inOrder = new Set(o.parts.map(l => l.pid)), dl = daysLeft(o);
  const state = o.status === 'open'
    ? `<div class="note info">${ic('clock')}<div>ორდერი ღიაა. ბოლო ცვლილება: <b>${fmtD(autoBase(o))}</b>. ავტომატურად დაიხურება <b>${dl <= 0 ? 'დღეს' : dl + ' დღეში'}</b> (${fmtD(addDays(autoBase(o), S.settings.autoClose))}), თუ ახალი ცვლილება არ შევა.</div></div>`
    : `<div class="note ${o.status === 'auto' ? 'warn' : ''}">${ic('lock')}<div>${o.status === 'auto' ? 'ორდერი <b>ავტომატურად დაიხურა</b>' : 'ორდერი <b>ხელით დაიხურა</b>'} ${fmtD(o.closedAt)}. ცვლილებისთვის გახსენით ხელახლა.</div></div>`;
  const acts = (closed ? btn('ხელახლა გახსნა', `call('so.reopen',{id:'${o.id}'},'ორდერი ხელახლა გაიხსნა')`, '', 'unlock') : btn('ორდერის დახურვა', `call('so.close',{id:'${o.id}'},'ორდერი დაიხურა')`, '', 'lock')) + btn('PDF ფორმა', `printSO('${o.id}')`, '', 'download');
  return ph(`სერვის ორდერი <span class="mono" style="font-size:19px">${o.id}</span> ${statusBadge(o)}`, 'გახსნილია ' + fmtD(o.date), acts, `<a onclick="go('sos')">სერვის ორდერები</a> / ${o.id}`) + state +
    `<div class="info-strip">
    <div><label>ტექნიკა</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${plate(v.plate)}<a style="color:var(--accent);cursor:pointer;font-weight:500" onclick="go('vehicle','${v.id}')">${esc(modelKey(v))}${v.year ? ' · ' + esc(v.year) : ''}</a></div><div class="mono sub" style="margin-top:4px">VIN ${esc(v.vin)}</div></div>
    <div><label>პასუხისმგებელი პირი</label><input list="dlr" autocomplete="off" value="${esc(o.resp)}" ${closed ? 'disabled' : ''} onchange="call('so.update',{id:'${o.id}',resp:this.value},'შენახულია')"></div>
    <div><label>გარბენი (კმ / საათი)</label><input type="number" min="0" value="${o.km ?? ''}" ${closed ? 'disabled' : ''} onchange="call('so.update',{id:'${o.id}',km:this.value},'შენახულია')"></div>
    <div><label>სულ ღირებულება</label><div style="font-size:19px;font-weight:700">${money(soCost(o))}</div></div>
  </div>
  <div class="card"><header><h3>გაცემული ნაწილები</h3><span class="sub">${o.parts.length} ხაზი</span></header>
     <div class="tw"><table class="t"><thead><tr><th>არტიკული</th><th>დასახელება</th>${wh2 ? '<th>საწყობი</th>' : ''}<th class="num">რაოდენობა</th><th class="num">ფასი</th><th class="num">ჯამი</th><th></th></tr></thead><tbody>
     ${o.parts.map(l => {
       // A fully returned line is greyed and struck through; a partly returned one shows the net quantity.
       const p = P(l.pid), net = l.qty - l.ret, gone = net <= 0;
       return `<tr class="${gone ? 'ret' : ''}"><td class="mono"><span class="st">${esc(p.art)}</span><div class="sub">${p.id}</div></td><td><span class="st">${esc(p.name)}</span>${gone ? '<div class="sub">დაბრუნდა</div>' : ''}${l.serials.length ? `<div class="sub mono" style="margin-top:2px">S/N: ${l.serials.map(s => `<span style="white-space:nowrap">${l.retSerials.some(x => sameCode(x, s)) ? `<s title="დაბრუნებულია">${esc(s)}</s>` : esc(s)}</span>`).join(', ')}</div>` : ''}</td>${wh2 ? `<td>${esc(S.wh[l.wh])}</td>` : ''}<td class="num"><span class="st">${qfmt(gone ? l.qty : net)} ${esc(p.uom)}</span>${l.ret && !gone ? `<div class="sub">გაიცა ${qfmt(l.qty)}, დაბრუნდა ${qfmt(l.ret)}</div>` : ''}</td><td class="num">${money(l.price)}</td><td class="num">${gone ? '—' : `<b>${money(net * l.price)}</b>`}</td><td style="white-space:nowrap">${!closed && !gone ? btn('S/N', `editSerials('${o.id}',${l.lid})`, 'sm ghost', '', false) : ''}${!closed && !gone ? `<button class="btn sm ghost" title="დაბრუნება საწყობში" onclick="retPart('${o.id}',${l.lid})">${ic('undo')}</button>` : ''}</td></tr>`;
     }).join('') || emptyRow(wh2 ? 7 : 6, 'ნაწილი ჯერ არ გაცემულა — აირჩიეთ ქვემოთ ან შემოთავაზებიდან')}
     </tbody><tfoot><tr><td colspan="${wh2 ? 5 : 4}">ნაწილები სულ</td><td class="num">${money(partsCost(o))}</td><td></td></tr></tfoot></table></div>
     ${closed ? '' : `<div class="addrow"><input id="sop" list="dlp" placeholder="არტიკული, კოდი ან დასახელება…" oninput="soWarn('${o.id}')" autocomplete="off"><input id="soqty" type="number" min="0" step="any" value="1" class="w80" title="რაოდენობა" oninput="soWarn('${o.id}')" onkeydown="if(event.key==='Enter')addPart('${o.id}')"><input id="sosn" class="mono w160" style="width:200px" autocomplete="off" placeholder="სერიული № (არასავალდ.)" title="რამდენიმე — მძიმით გამოყოფილი" onkeydown="if(event.key==='Enter')addPart('${o.id}')">${whSelect('sowh', 1, `soWarn('${o.id}')`)}<button class="btn primary" onclick="addPart('${o.id}')">${ic('arrowOut')}გაცემა</button></div><div id="sowarn" style="padding:0 16px"></div>`}
     ${S.settings.catalogRec && !closed && recAll.length ? `<div class="recstrip"><div class="recstrip-h">${ic('spark')}<b>შემოთავაზება ამ ტექნიკისთვის</b><span class="sub">VIN · კატალოგი · ისტორია — მხოლოდ რეკომენდაცია</span>${recAll.length > 6 ? `<a class="link" style="margin-left:auto" onclick="soRecAll=!soRecAll;render()">${soRecAll ? 'ნაკლები' : 'ყველა ' + recAll.length + ' ›'}</a>` : ''}</div>
      <div class="recgrid">${(soRecAll ? recAll : recAll.slice(0, 6)).map(r => { const p = P(r.pid), added = inOrder.has(p.id); return `<div class="recchip ${added ? 'added' : ''}" title="აირჩიეთ — რაოდენობა შეიყვანეთ გაცემის ველში" onclick="pickRec('${o.id}','${p.id}')"><div class="n"><div>${esc(p.name)}</div><div class="sub"><span class="mono">${esc(p.art)}</span> · ${qfmt(totQ(p))} ${esc(p.uom)} · ${esc(p.stock[1].loc || '—')}${r.vin ? ' · <span class="vin">VIN</span>' : ''}</div></div>${added ? ic('check') : ''}<button class="btn sm" tabindex="-1">${ic('plus')}</button></div>`; }).join('')}</div></div>` : ''}
    </div>
    <div class="card"><header><h3>მომსახურება</h3><span class="sub">თავისუფალი დასახელება · ფასი არასავალდებულოა</span></header>
     <div class="tw"><table class="t"><thead><tr><th>დასახელება</th><th class="num">ფასი</th><th></th></tr></thead><tbody>
     ${o.svcs.map(s => `<tr><td>${esc(s.name)}</td><td class="num">${s.price != null ? money(s.price) : '<span class="sub">ფასის გარეშე</span>'}</td><td style="width:40px">${closed ? '' : btn('', `call('so.delService',{id:'${o.id}',sid:${s.sid}})`, 'sm ghost danger', 'x')}</td></tr>`).join('') || emptyRow(3, 'მომსახურება არ არის დამატებული')}
     </tbody>${o.svcs.length ? `<tfoot><tr><td>მომსახურება სულ</td><td class="num">${money(svcCost(o))}</td><td></td></tr></tfoot>` : ''}</table></div>
     ${closed ? '' : `<div class="addrow"><input id="svn" list="dls" class="grow" placeholder="მომსახურების დასახელება, მაგ. „ზეთის შეცვლა“"><input id="svp" type="number" min="0" step="any" class="w160" placeholder="ფასი (არასავალდ.)"><button class="btn" onclick="addSvc('${o.id}')">${ic('plus')}დამატება</button></div>`}
    </div>`;
};
// Picking a suggestion fills the issue row; the quantity (and S/N, warehouse) is then set before clicking "გაცემა".
function pickRec(oid, pid) {
  const p = P(pid), q = $('#soqty');
  $('#sop').value = `${p.id} · ${p.art} · ${p.name}`;
  q.value = 1;
  soWarn(oid);
  q.focus(); q.select();
  $('#sop').closest('.addrow').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function soWarn(oid) {
  const o = SO(oid), p = findProduct($('#sop').value), m = modelKey(V(o.vid)), w = $('#sowarn');
  if (!p) { w.innerHTML = ''; return; }
  const wh = +($('#sowh')?.value || 1), q = +$('#soqty').value || 0, avail = p.stock[wh].q;
  let h = '';
  if (S.settings.catalogRec && !inCatalog(m, p.id) && !fitsVin(o.vid, p.id)) h += `<div class="note warn" style="margin:10px 0">${ic('info')}<div><b>${esc(p.name)}</b> კატალოგში არ არის მიბმული მოდელზე ${esc(m)}. გაცემა მაინც შესაძლებელია — კავშირი ისტორიიდან აისახება კატალოგში.</div></div>`;
  if (q > avail) h += `<div class="note" style="margin:10px 0;background:var(--bad-bg);color:var(--bad)">${ic('alert')}<div>ნაშთი არასაკმარისია: ხელმისაწვდომია ${qfmt(avail)} ${esc(p.uom)}. უარყოფითი ნაშთი დაუშვებელია.</div></div>`;
  h += `<div class="sub" style="margin:${h ? '0' : '10px'} 0 12px">ნაშთი: <b>${qfmt(avail)} ${esc(p.uom)}</b> · ლოკაცია ${esc(p.stock[wh].loc || '—')} · საშ. ფასი ${money(p.cost)}</div>`;
  w.innerHTML = h;
}
async function addPart(oid, pid) {
  const o = SO(oid), p = pid ? P(pid) : findProduct($('#sop').value);
  if (!p) return toast('აირჩიეთ პროდუქტი სიიდან', 'err');
  const qty = pid ? 1 : $('#soqty').value, wh = pid ? 1 : +($('#sowh')?.value || 1), wasCat = inCatalog(modelKey(V(o.vid)), p.id);
  const serials = pid ? '' : $('#sosn').value;
  await call('so.issue', { id: oid, pid: p.id, wh, qty, serials }, () => `გაცემულია: ${p.name} × ${qfmt(+qty)} · ნაშთი ${qfmt(P(p.id).stock[wh].q)}` + (serials.trim() ? ' · S/N შენახულია' : '') + (wasCat ? '' : ' · კატალოგი განახლდა'));
}
function editSerials(oid, lid) {
  const l = SO(oid).parts.find(x => x.lid === lid), p = P(l.pid);
  openModal('სერიული ნომრები', `<div class="note">${ic('info')}<div><b>${esc(p.name)}</b> · <span class="mono">${esc(p.art)}</span><br>გაცემულია ${qfmt(l.qty)} ${esc(p.uom)} — მაქსიმუმ ${Math.floor(l.qty)} სერიული ნომერი. არასავალდებულოა.</div></div>
   <div class="field"><label>სერიული ნომრები — თითო სტრიქონზე ან მძიმით გამოყოფილი</label><textarea id="snl" rows="5" class="mono" autofocus>${esc(l.serials.join('\n'))}</textarea>${l.retSerials.length ? `<span class="hint">დაბრუნებული: ${l.retSerials.map(esc).join(', ')}</span>` : ''}</div>`,
  btn('გაუქმება', 'closeModal()') + btn('შენახვა', `saveSerials('${oid}',${lid})`, 'primary', 'check'));
}
async function saveSerials(oid, lid) {
  if (await call('so.setSerials', { id: oid, lid, serials: $('#snl').value }, 'სერიული ნომრები შენახულია')) closeModal();
}
function retPart(oid, lid) {
  const l = SO(oid).parts.find(x => x.lid === lid), p = P(l.pid), net = l.qty - l.ret, out = outSerials(l);
  openModal('ნაწილის დაბრუნება საწყობში', `<div class="note">${ic('undo')}<div><b>${esc(p.name)}</b><br><span class="mono">${esc(p.art)}</span> · გაცემულია ${qfmt(net)} ${esc(p.uom)}</div></div>
   <div class="field"><label class="req">დასაბრუნებელი რაოდენობა</label><input id="rq" type="number" min="0" max="${net}" step="any" value="${out.length ? 1 : net}" autofocus></div>
   ${out.length ? `<div class="field"><label>რომელი სერიული ნომერი ბრუნდება</label><div class="chips">${out.map(s => `<label class="chip" style="cursor:pointer"><input type="checkbox" class="rsn" value="${esc(s)}" onchange="const n=document.querySelectorAll('.rsn:checked').length;if(n)$('#rq').value=n"><span class="mono">${esc(s)}</span></label>`).join('')}</div><span class="hint">მონიშვნისას რაოდენობა ავტომატურად შეიცვლება</span></div>` : ''}
   <div class="field"><label>მიზეზი</label><select id="rr"><option>არ დასჭირდა</option><option>არასწორი ნაწილი</option><option>დეფექტი</option><option>სხვა</option></select></div>`,
  btn('გაუქმება', 'closeModal()') + btn('დაბრუნება', `doRet('${oid}',${lid})`, 'primary', 'undo'));
}
async function doRet(oid, lid) {
  const l = SO(oid).parts.find(x => x.lid === lid), p = P(l.pid), q = $('#rq').value;
  const serials = [...document.querySelectorAll('.rsn:checked')].map(x => x.value);
  if (await call('so.return', { id: oid, lid, qty: q, reason: $('#rr').value, serials }, `დაბრუნდა საწყობში: ${p.name} × ${q}${serials.length ? ' (S/N ' + serials.join(', ') + ')' : ''} → ${p.stock[l.wh].loc || S.wh[l.wh]}`)) closeModal();
}
async function addSvc(oid) {
  const pr = $('#svp').value;
  await call('so.addService', { id: oid, name: $('#svn').value, price: pr }, 'მომსახურება დაემატა' + (pr === '' ? ' (ფასის გარეშე)' : ''));
}

/* ================= purchases ================= */
let po = null;
VIEWS.purchases = () => {
  const tot = o => o.lines.reduce((a, l) => a + l.qty * l.price, 0);
  return ph('შესყიდვის ორდერები', 'შენახვისთანავე პროდუქცია ემატება საწყობის ნაშთს და განახლდება საშუალო ღირებულება', btn('ახალი შესყიდვის ორდერი', 'openPO()', 'primary', 'plus')) +
    `<div class="card"><div class="tw"><table class="t"><thead><tr><th>№</th><th>თარიღი</th><th>მომწოდებელი</th>${S.settings.wh2 ? '<th>საწყობი</th>' : ''}<th class="num">პოზიცია</th><th class="num">ღირებულება</th><th>სტატუსი</th></tr></thead><tbody>
  ${limited('purchases', S.pos).rows.map(o => `<tr class="click" onclick="viewPO('${o.id}')"><td class="mono">${o.id}</td><td>${fmtD(o.date)}</td><td>${esc(SUP(o.sup).name)}</td>${S.settings.wh2 ? `<td>${esc(S.wh[o.wh])}</td>` : ''}<td class="num">${o.lines.length}</td><td class="num"><b>${money(tot(o))}</b></td><td><span class="badge b-ok">მარაგში მიღებულია</span></td></tr>`).join('') || emptyRow(7, 'შესყიდვის ორდერი ჯერ არ არის')}
  </tbody></table></div>${limited('purchases', S.pos).more}</div>`;
};
function openPO(pid) {
  const p = pid ? P(pid) : null;
  po = { sup: S.suppliers.length === 1 ? S.suppliers[0].id : '', date: TODAY, wh: 1, note: '', lines: p ? [{ pid, qty: Math.max(p.min * 2 - totQ(p), 1), price: p.cost }] : [{ pid: '', qty: 1, price: '' }] };
  reopenPO();
}
function reopenPO() {
  openModal('ახალი შესყიდვის ორდერი', '<div id="pobody"></div>', '<span class="left" id="pototal"></span>' + btn('გაუქმება', 'closeModal()') + btn('შენახვა და მარაგში მიღება', 'savePO()', 'primary', 'check'), true);
  poRender();
}
function poRender() {
  $('#pobody').innerHTML = `<div class="note info">${ic('info')}<div>შენახვისას ყველა პოზიცია <b>მაშინვე აისახება ნაშთზე</b> და განახლდება საშუალო ღირებულება.</div></div>
  <div class="grid3">
   <div class="field"><label class="req">მომწოდებელი</label><select onchange="po.sup=this.value"><option value="">— აირჩიეთ —</option>${S.suppliers.map(s => `<option value="${s.id}" ${po.sup === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select><a class="hint" style="color:var(--accent);cursor:pointer" onclick="openSupplier(null,true)">+ ახალი მომწოდებელი</a></div>
   <div class="field"><label>თარიღი</label><input type="date" value="${po.date}" max="${TODAY}" onchange="po.date=this.value"></div>
   <div class="field"><label>საწყობი</label>${S.settings.wh2 ? whSelect('powh', po.wh, 'po.wh=+this.value') : `<input value="${esc(S.wh[1])}" disabled>`}</div>
  </div>
  <table class="t" style="border:1px solid var(--line);border-radius:8px"><thead><tr><th>პროდუქტი</th><th class="num">რაოდენობა</th><th class="num">ერთ. ფასი (₾)</th><th class="num">ჯამი</th><th></th></tr></thead><tbody>
  ${po.lines.map((l, i) => { const p = P(l.pid); return `<tr><td><select style="width:100%" onchange="poSet(${i},'pid',this.value)"><option value="">— აირჩიეთ პროდუქტი —</option>${S.products.map(x => `<option value="${x.id}" ${l.pid === x.id ? 'selected' : ''}>${esc(x.art)} — ${esc(x.name)}</option>`).join('')}</select>${p ? `<div class="sub" style="margin-top:3px">ნაშთი ${qfmt(totQ(p))} ${esc(p.uom)} · ${esc(p.stock[1].loc || 'ლოკაცია არ არის')}</div>` : ''}</td>
   <td class="num"><input type="number" min="0" step="any" class="w80" value="${l.qty}" oninput="poSet(${i},'qty',this.value)"> <span class="sub">${p ? esc(p.uom) : ''}</span></td>
   <td class="num"><input type="number" min="0" step="any" class="w120" value="${l.price}" oninput="poSet(${i},'price',this.value)"></td>
   <td class="num" id="pol${i}">${money((+l.qty || 0) * (+l.price || 0))}</td><td>${po.lines.length > 1 ? btn('', `po.lines.splice(${i},1);poRender()`, 'sm ghost danger', 'x') : ''}</td></tr>`; }).join('')}
  </tbody></table>
  <div style="margin-top:10px;display:flex;gap:8px">${btn('ხაზის დამატება', "po.lines.push({pid:'',qty:1,price:''});poRender()", '', 'plus')}${btn('ახალი პროდუქტი', 'openProduct(null,true)', 'ghost', 'box')}</div>`;
  poTotal();
}
function poSet(i, k, v) {
  const l = po.lines[i];
  if (k === 'pid') { l.pid = v; const p = P(v); if (p && l.price === '') l.price = p.cost; poRender(); return; }
  l[k] = v;
  $('#pol' + i).textContent = money((+l.qty || 0) * (+l.price || 0));
  poTotal();
}
function poTotal() { $('#pototal').textContent = 'სულ: ' + money(po.lines.reduce((a, l) => a + (+l.qty || 0) * (+l.price || 0), 0)); }
async function savePO() {
  const id = await call('po.create', { sup: po.sup, date: po.date, wh: po.wh, lines: po.lines }, r => `${r} შენახულია · მარაგი განახლდა`);
  if (id) { closeModal(); go('purchases'); }
}
function viewPO(id) {
  const o = S.pos.find(x => x.id === id), tot = o.lines.reduce((a, l) => a + l.qty * l.price, 0);
  openModal('შესყიდვის ორდერი ' + o.id, `<div class="grid3" style="margin-bottom:12px"><div><div class="sub">მომწოდებელი</div><b>${esc(SUP(o.sup).name)}</b></div><div><div class="sub">თარიღი</div><b>${fmtD(o.date)}</b></div><div><div class="sub">საწყობი</div><b>${esc(S.wh[o.wh])}</b></div></div>
   <table class="t" style="border:1px solid var(--line)"><thead><tr><th>არტიკული</th><th>დასახელება</th><th class="num">რაოდ.</th><th class="num">ფასი</th><th class="num">ჯამი</th></tr></thead><tbody>${o.lines.map(l => { const p = P(l.pid); return `<tr><td class="mono">${esc(p.art)}</td><td>${esc(p.name)}</td><td class="num">${qfmt(l.qty)} ${esc(p.uom)}</td><td class="num">${money(l.price)}</td><td class="num">${money(l.qty * l.price)}</td></tr>`; }).join('')}</tbody><tfoot><tr><td colspan="4">სულ</td><td class="num">${money(tot)}</td></tr></tfoot></table>`,
  btn('დახურვა', 'closeModal()', 'primary'), true);
}

/* ================= suppliers ================= */
VIEWS.suppliers = () => ph('მომწოდებლები', S.suppliers.length + ' მომწოდებელი', btn('ახალი მომწოდებელი', 'openSupplier()', 'primary', 'plus')) +
  `<div class="card"><div class="tw"><table class="t"><thead><tr><th>კოდი</th><th>დასახელება</th><th>საიდენტიფიკაციო კოდი</th><th>საკონტაქტო პირი</th><th>ტელეფონი</th><th class="num">ორდერი</th><th class="num">შესყიდვა სულ</th></tr></thead><tbody>
  ${S.suppliers.map(s => { const ps = S.pos.filter(o => o.sup === s.id); return `<tr class="click" onclick="openSupplier('${s.id}')"><td class="mono">${s.id}</td><td><b style="font-weight:500">${esc(s.name)}</b></td><td class="mono">${esc(s.tin)}</td><td>${esc(s.contact)}</td><td>${esc(s.phone)}</td><td class="num">${ps.length}</td><td class="num">${money(ps.reduce((a, o) => a + o.lines.reduce((b, l) => b + l.qty * l.price, 0), 0))}</td></tr>`; }).join('') || emptyRow(7, 'მომწოდებელი ჯერ არ არის')}
  </tbody></table></div></div>`;
function openSupplier(id, fromPO = false) {
  const s = id ? S.suppliers.find(x => x.id === id) : {};
  openModal(id ? 'მომწოდებელი ' + id : 'ახალი მომწოდებელი', `<div class="field"><label class="req">დასახელება</label><input id="sn" autofocus value="${esc(s.name)}" placeholder="შპს „…“"></div><div class="grid2"><div class="field"><label>საიდენტიფიკაციო კოდი</label><input id="st" value="${esc(s.tin)}"></div><div class="field"><label>ტელეფონი</label><input id="sp" value="${esc(s.phone)}"></div></div><div class="field"><label>საკონტაქტო პირი</label><input id="sc" value="${esc(s.contact)}"></div>`,
  btn('გაუქმება', fromPO ? 'reopenPO()' : 'closeModal()') + btn('შენახვა', `saveSupplier(${id ? `'${id}'` : 'null'},${fromPO})`, 'primary', 'check'));
}
async function saveSupplier(id, fromPO) {
  const sid = await call('supplier.save', { id, name: $('#sn').value, tin: $('#st').value, phone: $('#sp').value, contact: $('#sc').value }, id ? 'მომწოდებელი განახლდა' : 'მომწოდებელი დაემატა');
  if (!sid) return;
  if (fromPO) { po.sup = sid; reopenPO(); } else closeModal();
}

/* ================= products ================= */
let prQ = '', prLow = false;
VIEWS.products = () => {
  const ql = prQ.toLowerCase(), n = norm(prQ), wh2 = S.settings.wh2;
  const list = S.products.filter(p => (!prQ || p.name.toLowerCase().includes(ql) || norm(p.art).includes(n) || norm(p.id).includes(n) || whs().some(w => norm(p.stock[w].loc).startsWith(n))) && (!prLow || isLow(p)));
  return ph('პროდუქტები', 'პროდუქტის მასტერ დატა: არტიკული, უნიკალური ნომერი, ზომის ერთეული, ნაშთი, ლოკაცია', btn('CSV იმპორტი', "openImport('products')", '', 'upload') + btn('ახალი პროდუქტი', 'openProduct()', 'primary', 'plus')) +
    `<div class="filters"><input id="prq" placeholder="ძებნა: დასახელება, არტიკული, № ან ლოკაცია" value="${esc(prQ)}" style="width:340px" oninput="prQ=this.value;LIM={};render();refocus('#prq')">
   <label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" ${prLow ? 'checked' : ''} onchange="prLow=this.checked;render()">მხოლოდ მცირე მარაგი</label><span class="sub">${list.length} / ${S.products.length}</span></div>
  <div class="card"><div class="tw"><table class="t"><thead><tr><th>უნიკ. №</th><th>არტიკული</th><th>დასახელება</th><th>ზომის ერთ.</th>${wh2 ? `<th class="num">${esc(S.wh[1])}</th><th class="num">${esc(S.wh[2])}</th>` : '<th class="num">ნაშთი</th>'}<th>ლოკაცია</th><th class="num">საშ. ღირებ.</th><th class="num">ღირებულება</th><th>სტატუსი</th></tr></thead><tbody>
  ${limited('products', list).rows.map(p => `<tr class="click" onclick="openProduct('${p.id}')"><td class="mono">${p.id}</td><td class="mono">${esc(p.art)}</td><td><b style="font-weight:500">${esc(p.name)}</b></td><td>${esc(p.uom)}</td>${whs().map(w => `<td class="num">${qfmt(p.stock[w].q)}</td>`).join('')}<td class="mono">${whs().map(w => esc(p.stock[w].loc || '—')).join(' / ')}</td><td class="num">${money(p.cost)}</td><td class="num">${money(totQ(p) * p.cost)}</td><td>${stockBadge(p)}</td></tr>`).join('') || emptyRow(wh2 ? 11 : 10, S.products.length ? 'ვერ მოიძებნა' : 'პროდუქტი ჯერ არ არის — დაამატეთ ხელით ან CSV იმპორტით')}
  </tbody></table></div>${limited('products', list).more}</div>`;
};
function openProduct(id, fromPO = false) {
  const p = id ? P(id) : null;
  const fits = p ? models().filter(m => inCatalog(m, p.id)) : [];
  const mv = p ? S.moves.filter(m => m.pid === p.id).slice(0, 6) : [];
  openModal(p ? p.name : 'ახალი პროდუქტი', `
   <div class="grid2">
    <div class="field"><label>უნიკალური №</label><input class="mono" value="${p ? p.id : 'ავტომატურად'}" disabled><span class="hint">ენიჭება შენახვისას</span></div>
    <div class="field"><label class="req">არტიკული</label><input id="pa" class="mono" value="${p ? esc(p.art) : ''}" ${p ? '' : 'autofocus'} placeholder="მწარმოებლის კოდი"></div>
   </div>
   <div class="field"><label class="req">დასახელება</label><input id="pn" value="${p ? esc(p.name) : ''}"></div>
   <div class="grid3">
    <div class="field"><label>ზომის ერთეული</label><select id="pu">${S.uoms.map(u => `<option ${p && p.uom === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div>
    <div class="field"><label>მინ. ნაშთი</label><input id="pm" type="number" min="0" step="any" value="${p ? p.min : 0}"></div>
    <div class="field"><label>საშ. ღირებულება</label><input id="pc" type="number" min="0" step="any" value="${p ? Math.round(p.cost * 100) / 100 : ''}" ${p ? 'disabled' : ''} placeholder="₾"><span class="hint">${p ? 'ითვლება შესყიდვებიდან' : 'საწყისი, თუ ცნობილია'}</span></div>
   </div>
   <div class="grid2">${whs().map(w => `<div class="field"><label>${ic('pin')} ლოკაცია — ${esc(S.wh[w])}</label><input id="pl${w}" class="mono" list="dlloc${w}" autocomplete="off" value="${esc(p ? p.stock[w].loc : '')}" placeholder="${locsOf(w, true).length ? 'აირჩიეთ სიიდან' : 'ჯერ დაამატეთ ლოკაციები'}"><span class="hint">ლოკაციების სიიდან${p ? ` · ნაშთი ${qfmt(p.stock[w].q)} ${esc(p.uom)}` : ''}</span></div>`).join('')}</div>
   ${p ? `<div class="field"><label>რომელ ტექნიკაზე ყენდება (კატალოგი)</label><div class="chips">${fits.map(m => `<span class="chip">${ic('car')}${esc(m)}</span>`).join('') || '<span class="sub">მოდელზე არ არის მიბმული</span>'}${(() => { const n = Object.values(S.fitment || {}).filter(a => a.includes(p.id)).length; return n ? `<span class="chip">${ic('car')}VIN-ით: ${n} ტექნიკა</span>` : ''; })()}</div></div>
   <div class="field"><label>ბოლო მოძრაობები</label>${mv.length ? `<table class="t" style="border:1px solid var(--line)">${mv.map(m => `<tr><td>${fmtD(m.date)}</td><td>${(MOVE_T[m.type] || [m.type])[0]}</td><td class="mono">${esc(m.ref)}</td><td class="num">${moveSign(m.type)}${qfmt(m.qty)} ${esc(p.uom)}</td></tr>`).join('')}</table>` : '<span class="sub">მოძრაობა არ არის</span>'}</div>` : ''}`,
  (p && S.settings.wh2 ? btn('გადაადგილება', `openTransfer('${p.id}')`, 'ghost', 'swap') : '') + btn('გაუქმება', fromPO ? 'reopenPO()' : 'closeModal()') + btn('შენახვა', `saveProduct(${p ? `'${p.id}'` : 'null'},${fromPO})`, 'primary', 'check'));
}
async function saveProduct(id, fromPO) {
  const locs = {}; whs().forEach(w => { locs[w] = $('#pl' + w).value; });
  const pid = await call('product.save', { id, art: $('#pa').value, name: $('#pn').value, uom: $('#pu').value, min: $('#pm').value, cost: id ? undefined : $('#pc').value, locs }, r => id ? 'პროდუქტი განახლდა' : 'პროდუქტი ' + r + ' შეიქმნა');
  if (!pid) return;
  if (fromPO) { po.lines = po.lines.filter(l => l.pid); po.lines.push({ pid, qty: 1, price: P(pid).cost || '' }); reopenPO(); } else closeModal();
}

/* ================= stock & locations ================= */
let stWh = 1, stQ = '', stSel = null, stEmpty = false, stOff = false;
VIEWS.stock = () => {
  if (!S.settings.wh2) stWh = 1;
  const ql = stQ.trim().toLowerCase(), n = norm(stQ);
  const rows = locsOf(stWh).map(l => ({ ...l, ps: productsAt(stWh, l.code) }));
  const match = r => !ql || r.code.toLowerCase().includes(ql) || r.note.toLowerCase().includes(ql) || r.ps.some(p => p.name.toLowerCase().includes(ql) || norm(p.art).includes(n));
  const list = rows.filter(r => (stOff || r.active) && (!stEmpty || !r.ps.length) && match(r));
  const unplaced = S.products.filter(p => !p.stock[stWh].loc && p.stock[stWh].q > 0);
  const sel = stSel === '' ? { code: '', note: '', active: true, ps: unplaced } : rows.find(r => sameCode(r.code, stSel));
  const value = ps => ps.reduce((a, p) => a + p.stock[stWh].q * p.cost, 0);
  const offN = rows.filter(r => !r.active).length;
  return ph('საწყობი და ლოკაციები', 'ლოკაციების სია: ნებისმიერი კოდი (მაგ. A-01-02, ZONE-3, გარე საწყობი). პროდუქტს ენიჭება მხოლოდ სიაში არსებული ლოკაცია.',
    (S.settings.wh2 ? `<div class="seg">${[1, 2].map(w => `<button class="${stWh === w ? 'on' : ''}" onclick="stWh=${w};stSel=null;render()">${esc(S.wh[w])}</button>`).join('')}</div>` + btn('გადაადგილება', 'openTransfer()', '', 'swap') : '') +
    btn('სიით დამატება', 'openBulkLoc()', '', 'plus') + btn('ახალი ლოკაცია', 'openLocation()', 'primary', 'plus')) +
  `<div class="filters"><div class="gsearch" style="max-width:420px">${ic('search')}<input id="stq" placeholder="ლოკაცია, აღწერა ან პროდუქტი…" value="${esc(stQ)}" oninput="stQ=this.value;LIM={};render();refocus('#stq')"></div>
   <label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" ${stEmpty ? 'checked' : ''} onchange="stEmpty=this.checked;render()">მხოლოდ თავისუფალი</label>
   ${offN ? `<label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" ${stOff ? 'checked' : ''} onchange="stOff=this.checked;render()">გამორთულიც (${offN})</label>` : ''}
   <span class="sub">${list.length} / ${rows.length} ლოკაცია</span></div>
  <div class="cols">
   <div class="card"><div class="tw"><table class="t"><thead><tr><th>კოდი</th><th>აღწერა</th><th class="num">პროდუქტი</th><th class="num">ღირებულება</th><th>სტატუსი</th></tr></thead><tbody>
    ${limited('stock', list).rows.map(r => `<tr class="click" ${sameCode(stSel, r.code) ? 'style="background:var(--accent-bg)"' : ''} onclick="stSel=this.dataset.c;render()" data-c="${esc(r.code)}"><td class="mono"><b>${esc(r.code)}</b></td><td>${esc(r.note) || '<span class="sub">—</span>'}</td><td class="num">${r.ps.length || '<span class="sub">თავისუფალი</span>'}</td><td class="num">${r.ps.length ? money(value(r.ps)) : ''}</td><td>${r.active ? '<span class="badge b-ok">აქტიური</span>' : '<span class="badge b-closed">გამორთული</span>'}</td></tr>`).join('') || emptyRow(5, rows.length ? 'ვერ მოიძებნა' : 'ლოკაცია ჯერ არ არის — დააჭირეთ „ახალი ლოკაცია“ ან „სიით დამატება“')}
    ${unplaced.length && !ql && !stEmpty ? `<tr class="click" ${stSel === '' ? 'style="background:var(--accent-bg)"' : ''} onclick="stSel='';render()"><td><span class="badge b-auto">ლოკაციის გარეშე</span></td><td class="sub">ნაშთი აქვს, ლოკაცია არ აქვს</td><td class="num">${unplaced.length}</td><td class="num">${money(value(unplaced))}</td><td></td></tr>` : ''}
   </tbody></table></div>${limited('stock', list).more}</div>
   <div>
    <div class="card"><header><h3>${sel ? (sel.code ? `${ic('pin')} ${esc(sel.code)}` : 'ლოკაციის გარეშე') : 'ლოკაციის დეტალები'}</h3>${sel && sel.code ? `<div class="acts">${btn('', `openLocation(stSel)`, 'sm ghost', 'edit')}${sel.ps.length ? '' : btn('', `deleteLocation(stSel)`, 'sm ghost danger', 'x')}</div>` : ''}</header>
     ${sel ? `${sel.note ? `<div class="body sub" style="padding-bottom:0">${esc(sel.note)}</div>` : ''}${sel.code && !sel.active ? `<div class="body" style="padding-bottom:0"><span class="badge b-closed">გამორთულია — ახალ პროდუქტს ვერ მიენიჭება</span></div>` : ''}
      ${sel.ps.map(p => `<div class="rec"><div class="n"><div>${esc(p.name)}</div><div class="sub mono">${esc(p.art)} · ${p.id}</div></div><div class="num"><b>${qfmt(p.stock[stWh].q)}</b> <span class="sub">${esc(p.uom)}</span></div>${S.settings.wh2 ? btn('', `openTransfer('${p.id}')`, 'sm ghost', 'swap') : ''}${btn('', `openProduct('${p.id}')`, 'sm ghost', 'edit')}</div>`).join('') || '<div class="empty">ლოკაცია თავისუფალია</div>'}
      ${sel.code && sel.active ? `<div class="addrow">${btn('პროდუქტის მინიჭება', 'assignLoc(stSel)', 'sm', 'plus')}</div>` : ''}` : '<div class="empty">აირჩიეთ ლოკაცია სიიდან</div>'}
    </div>
    ${S.settings.wh2 && S.transfers.length ? `<div class="card"><header><h3>ბოლო გადაადგილებები</h3></header>${S.transfers.slice(0, 6).map(t => { const p = P(t.pid); return `<div class="rec"><span class="tag mono">${t.id}</span><div class="n"><div>${esc(p.name)}</div><div class="sub">${esc(S.wh[t.from])} → ${esc(S.wh[t.to])} · ${fmtD(t.date)}</div></div><b>${qfmt(t.qty)}</b><span class="sub">${esc(p.uom)}</span></div>`; }).join('')}</div>` : ''}
    <div class="note">${ic('info')}<div>ლოკაციის კოდი თავისუფალია. გადარქმევისას მასზე მყოფი პროდუქტები ახალ კოდზე გადადის. წაშლა შესაძლებელია მხოლოდ ცარიელი ლოკაციის; გამორთული ლოკაცია ახალ პროდუქტს არ ენიჭება.</div></div>
   </div>
  </div>`;
};
function openLocation(code) {
  const l = code ? S.locations.find(x => x.wh === stWh && sameCode(x.code, code)) : null;
  openModal(l ? 'ლოკაცია ' + l.code : 'ახალი ლოკაცია — ' + S.wh[stWh], `
   <div class="field"><label class="req">კოდი</label><input id="lcode" class="mono" autofocus value="${esc(l ? l.code : '')}" maxlength="30" placeholder="მაგ. A-01-02, ZONE-3, გარე საწყობი">${l ? `<span class="hint">გადარქმევისას ${productsAt(stWh, l.code).length} პროდუქტი ახალ კოდზე გადავა</span>` : ''}</div>
   <div class="field"><label>აღწერა</label><input id="lnote" value="${esc(l ? l.note : '')}" maxlength="120" placeholder="მაგ. ფილტრები, ზედა თარო"></div>
   ${l ? `<label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="lact" ${l.active ? 'checked' : ''}>აქტიური (შეიძლება მიენიჭოს პროდუქტს)</label>` : ''}`,
  btn('გაუქმება', 'closeModal()') + btn('შენახვა', `saveLocation(${l ? `'${esc(jsq(l.code))}'` : 'null'})`, 'primary', 'check'));
}
async function saveLocation(oldCode) {
  const act = $('#lact');
  const code = await call('location.save', { wh: stWh, code: $('#lcode').value, oldCode, note: $('#lnote').value, active: act ? act.checked : true }, oldCode ? 'ლოკაცია განახლდა' : 'ლოკაცია დაემატა');
  if (!code) return;
  closeModal(); stSel = code; render();
}
function openBulkLoc() {
  openModal('ლოკაციების დამატება სიით — ' + S.wh[stWh], `<div class="field"><label class="req">კოდები — თითო სტრიქონზე ერთი</label><textarea id="lbulk" rows="10" class="mono" autofocus placeholder="A-01-01&#10;A-01-02&#10;ZONE-3&#10;გარე საწყობი"></textarea><span class="hint">შეგიძლიათ ჩასვათ Excel-ის სვეტიდან. არსებული კოდები გამოტოვდება.</span></div>`,
    btn('გაუქმება', 'closeModal()') + btn('დამატება', 'saveBulkLoc()', 'primary', 'plus'));
}
async function saveBulkLoc() {
  const n = await call('location.bulkAdd', { wh: stWh, codes: $('#lbulk').value }, r => (r === true ? 0 : r) + ' ახალი ლოკაცია დაემატა');
  if (n !== undefined) closeModal();
}
function deleteLocation(code) {
  openModal('ლოკაციის წაშლა', `<div class="note warn">${ic('alert')}<div>წაიშლება ლოკაცია <b class="mono">${esc(code)}</b> (${esc(S.wh[stWh])}).</div></div>`,
    btn('გაუქმება', 'closeModal()') + btn('წაშლა', `doDeleteLocation('${esc(jsq(code))}')`, 'primary', 'x'));
}
async function doDeleteLocation(code) {
  if (await call('location.delete', { wh: stWh, code }, 'ლოკაცია წაიშალა')) { closeModal(); stSel = null; render(); }
}
function assignLoc(loc) {
  openModal('პროდუქტის მინიჭება — ' + loc, `<div class="field"><label class="req">პროდუქტი</label><input id="alp" list="dlp" autofocus placeholder="არტიკული ან დასახელება…"></div><div class="note">${ic('info')}<div>პროდუქტის წინა ლოკაცია (${esc(S.wh[stWh])}) შეიცვლება <b>${esc(loc)}</b>-ით.</div></div>`,
    btn('გაუქმება', 'closeModal()') + btn('მინიჭება', `doAssign('${esc(jsq(loc))}')`, 'primary', 'pin'));
}
async function doAssign(loc) {
  const p = findProduct($('#alp').value);
  if (!p) return toast('აირჩიეთ პროდუქტი', 'err');
  const old = p.stock[stWh].loc;
  if (await call('location.assign', { pid: p.id, wh: stWh, loc }, `${p.name}: ${old || '—'} → ${loc}`)) closeModal();
}

/* ================= transfers ================= */
function openTransfer(pid) {
  if (!S.settings.wh2) return toast('ჯერ ჩართეთ მეორე საწყობი პარამეტრებში', 'err');
  const p = pid ? P(pid) : null, f = route.page === 'stock' ? stWh : 1;
  openModal('გადაადგილება საწყობებს შორის', `
   <div class="field"><label class="req">პროდუქტი</label><input id="trp" list="dlp" autocomplete="off" placeholder="არტიკული ან დასახელება…" value="${p ? `${p.id} · ${esc(p.art)} · ${esc(p.name)}` : ''}" oninput="trInfo()" ${p ? '' : 'autofocus'}></div>
   <div class="grid2"><div class="field"><label>საიდან</label><select id="trf" onchange="$('#trl').dataset.auto='1';trInfo()">${[1, 2].map(w => `<option value="${w}" ${w === f ? 'selected' : ''}>${esc(S.wh[w])}</option>`).join('')}</select></div>
    <div class="field"><label>სად</label><input id="trt" disabled></div></div>
   <div class="grid2"><div class="field"><label class="req">რაოდენობა</label><input id="trq" type="number" min="0" step="any" value="1" ${p ? 'autofocus' : ''}></div>
    <div class="field"><label>${ic('pin')} ლოკაცია მიმღებ საწყობში</label><input id="trl" class="mono" list="dlloc2" autocomplete="off" data-auto="1" oninput="this.dataset.auto=''" placeholder="სიიდან"></div></div>
   <div id="trinfo"></div>`, btn('გაუქმება', 'closeModal()') + btn('გადაადგილება', 'doTransfer()', 'primary', 'swap'));
  trInfo();
}
function trInfo() {
  const p = findProduct($('#trp').value), f = +$('#trf').value, t = f === 1 ? 2 : 1;
  $('#trt').value = S.wh[t];
  $('#trl').setAttribute('list', 'dlloc' + t);
  if (!p) { $('#trinfo').innerHTML = ''; return; }
  // Suggest the product's location in the receiving warehouse, else the same code if it exists there.
  const same = locsOf(t, true).find(l => sameCode(l.code, p.stock[f].loc));
  if ($('#trl').dataset.auto) $('#trl').value = p.stock[t].loc || (same ? same.code : '');
  $('#trinfo').innerHTML = `<div class="note">${ic('info')}<div><b>${esc(p.name)}</b><br>${esc(S.wh[f])}: <b>${qfmt(p.stock[f].q)} ${esc(p.uom)}</b> (${esc(p.stock[f].loc || '—')}) · ${esc(S.wh[t])}: <b>${qfmt(p.stock[t].q)} ${esc(p.uom)}</b> (${esc(p.stock[t].loc || '—')})</div></div>`;
}
async function doTransfer() {
  const p = findProduct($('#trp').value);
  if (!p) return toast('აირჩიეთ პროდუქტი', 'err');
  const f = +$('#trf').value;
  if (await call('transfer.create', { pid: p.id, from: f, qty: $('#trq').value, loc: $('#trl').value }, r => `${r}: ${p.name} → ${S.wh[f === 1 ? 2 : 1]}`)) closeModal();
}

/* ================= vehicles ================= */
let vQ = '';
VIEWS.vehicles = () => {
  const n = norm(vQ);
  const list = S.vehicles.filter(v => !n || norm(v.plate).includes(n) || norm(v.vin).includes(n) || norm(modelKey(v)).includes(n));
  const st = v => { const os = S.sos.filter(o => o.vid === v.id); return [os.length, os.reduce((a, o) => a + soCost(o), 0)]; };
  return ph('ტექნიკის რეესტრი', S.vehicles.length + ' ერთეული · ძებნა VIN კოდით ან სახელმწიფო ნომრით', btn('CSV იმპორტი', "openImport('vehicles')", '', 'upload') + btn('ახალი ტექნიკა', 'openVehicle()', 'primary', 'plus')) +
    `<div class="filters"><div class="gsearch" style="max-width:440px">${ic('search')}<input id="vq" placeholder="VIN ან სახელმწიფო ნომერი, მაგ. TB-482 / WF0XXX…" value="${esc(vQ)}" oninput="vQ=this.value;LIM={};render();refocus('#vq')"></div></div>
  <div class="card"><div class="tw"><table class="t"><thead><tr><th>სახ. ნომერი</th><th>VIN კოდი</th><th>მარკა / მოდელი</th><th class="num">წელი</th><th class="num">გარბენი (კმ / საათი)</th><th>განყოფილება</th><th class="num">ორდერი</th><th class="num">დანახარჯი სულ</th></tr></thead><tbody>
  ${limited('vehicles', list).rows.map(v => { const [c, t] = st(v); return `<tr class="click" onclick="go('vehicle','${v.id}')"><td>${plate(v.plate)}</td><td class="mono">${esc(v.vin)}</td><td><b style="font-weight:500">${esc(v.make)}</b> ${esc(v.model)}</td><td class="num">${esc(v.year || '')}</td><td class="num">${qfmt(v.km)}</td><td>${esc(v.dept)}</td><td class="num">${c}</td><td class="num"><b>${money(t)}</b></td></tr>`; }).join('') || emptyRow(8, S.vehicles.length ? 'ვერ მოიძებნა' : 'ტექნიკა ჯერ არ არის — დაამატეთ ხელით ან CSV იმპორტით')}
  </tbody></table></div>${limited('vehicles', list).more}</div>`;
};
// Same rule as vinProblem() in db.js: 17 = road-vehicle VIN without I/O/Q; 5–25 = machinery serial (e.g. JCB).
function vinHint(v) {
  const n = v.length;
  if (!n) return '17 სიმბოლო — ავტომობილი · 5–25 — ტექნიკა (მაგ. JCB)';
  if (!/^[A-Z0-9-]*$/.test(v)) return n + ' · მხოლოდ ლათინური ასოები, ციფრები და „-“';
  if (n === 17) return '17 · სტანდარტული VIN' + (/[IOQ]/.test(v) ? ' · I, O, Q დაუშვებელია' : '');
  if (n < 5) return n + ' · მინიმუმ 5 სიმბოლო';
  return n + ' · ტექნიკის სერიული ნომერი';
}
function openVehicle(id) {
  const v = id ? V(id) : {};
  openModal(id ? 'ტექნიკის რედაქტირება' : 'ახალი ტექნიკა', `<div class="grid2"><div class="field"><label class="req">სახელმწიფო ნომერი</label><input id="vp" class="mono" autofocus value="${esc(v.plate)}" placeholder="AA-123-BB"></div><div class="field"><label class="req">VIN / სერიული №</label><input id="vv" class="mono" maxlength="25" value="${esc(v.vin)}" placeholder="17 (ავტომობილი) ან 5–25 (ტექნიკა)" oninput="this.value=this.value.toUpperCase();$('#vvh').textContent=vinHint(this.value)"><span class="hint" id="vvh">${vinHint(v.vin || '')}</span></div></div>
   <div class="grid3"><div class="field"><label class="req">მარკა</label><input id="vm" list="dlmk" value="${esc(v.make)}"><datalist id="dlmk">${[...new Set(S.vehicles.map(x => x.make))].map(m => `<option value="${esc(m)}">`).join('')}</datalist></div><div class="field"><label class="req">მოდელი</label><input id="vmo" value="${esc(v.model)}"></div><div class="field"><label>წელი</label><input id="vy" type="number" value="${esc(v.year ?? '')}" placeholder="2024"></div></div>
   <div class="grid2"><div class="field"><label>გარბენი (კმ / საათი)</label><input id="vk" type="number" min="0" value="${esc(v.km ?? '')}"></div><div class="field"><label>განყოფილება</label><input id="vd" value="${esc(v.dept)}"></div></div>`,
  btn('გაუქმება', 'closeModal()') + btn('შენახვა', `saveVehicle(${id ? `'${id}'` : 'null'})`, 'primary', 'check'));
}
async function saveVehicle(id) {
  const vid = await call('vehicle.save', { id, plate: $('#vp').value, vin: $('#vv').value, make: $('#vm').value, model: $('#vmo').value, year: $('#vy').value, km: $('#vk').value, dept: $('#vd').value }, id ? 'შენახულია' : 'ტექნიკა დაემატა რეესტრს');
  if (!vid) return;
  closeModal();
  if (!id) go('vehicle', vid);
}
VIEWS.vehicle = id => {
  const v = V(id);
  if (!v) return VIEWS.vehicles();
  const os = S.sos.filter(o => o.vid === id), tot = os.reduce((a, o) => a + soCost(o), 0), pts = os.reduce((a, o) => a + partsCost(o), 0);
  const agg = {};
  os.forEach(o => o.parts.forEach(l => { agg[l.pid] = agg[l.pid] || { q: 0, c: 0 }; agg[l.pid].q += l.qty - l.ret; agg[l.pid].c += (l.qty - l.ret) * l.price; }));
  const top = Object.entries(agg).filter(a => a[1].q > 0).sort((a, b) => b[1].c - a[1].c).slice(0, 6);
  return ph(`${plate(v.plate)} <span style="margin-left:6px">${esc(modelKey(v))}</span>`, `VIN <span class="mono">${esc(v.vin)}</span> · ` + [v.year, qfmt(v.km) + ' კმ / საათი', v.dept].filter(Boolean).map(esc).join(' · '),
    btn('რედაქტირება', `openVehicle('${v.id}')`, '', 'edit') + btn('სერვის ორდერი ამ მანქანაზე', `newSO('${v.id}')`, 'primary', 'plus'), `<a onclick="go('vehicles')">ტექნიკის რეესტრი</a> / ${esc(v.plate)}`) +
    `<div class="kpis">${kpi('დანახარჯი სულ', money(tot), 'ყველა სერვის ორდერი')}${kpi('ნაწილები', money(pts), 'გაცემული − დაბრუნებული')}${kpi('მომსახურება', money(tot - pts), 'ფასიანი მომსახურება')}${kpi('სერვის ორდერი', os.length, os[0] ? 'ბოლო: ' + fmtD(os[0].date) : '—')}</div>
  <div class="cols">
   <div class="card"><header><h3>სერვისის ისტორია</h3></header><div class="tw"><table class="t"><thead><tr><th>№</th><th>თარიღი</th><th class="num">გარბენი (კმ / საათი)</th><th>ნაწილები / მომსახურება</th><th class="num">ჯამი</th><th>სტატუსი</th></tr></thead><tbody>
   ${os.map(o => `<tr class="click" onclick="go('so','${o.id}')"><td class="mono">${o.id}</td><td>${fmtD(o.date)}</td><td class="num">${qfmt(o.km)}</td><td class="sub" style="max-width:280px">${[...o.parts.map(l => P(l.pid).name), ...o.svcs.map(s => s.name)].map(esc).join(', ') || '—'}</td><td class="num"><b>${money(soCost(o))}</b></td><td>${statusBadge(o)}</td></tr>`).join('') || emptyRow(6, 'ისტორია ცარიელია')}
   </tbody></table></div></div>
   <div>
   <div class="card"><header><h3>${ic('book')} შესაფერისი ნაწილები (VIN)</h3><span class="sub">${fitOf(v.id).length}</span></header>
    ${fitOf(v.id).map(pid => { const p = P(pid); return p ? `<div class="rec"><div class="n"><div>${esc(p.name)}</div><div class="sub"><span class="mono">${esc(p.art)}</span> · ნაშთი ${qfmt(totQ(p))} ${esc(p.uom)} · ${ic('pin')} ${esc(p.stock[1].loc || '—')}</div></div>${btn('', `call('fitment.toggle',{vid:'${v.id}',pid:'${p.id}'},'კავშირი მოიხსნა')`, 'sm ghost danger', 'x')}</div>` : ''; }).join('') || '<div class="empty">ნაწილი ჯერ არ არის მიბმული — დაამატეთ ქვემოთ ან CSV მატრიცით</div>'}
    <div class="addrow"><input id="fitp" list="dlp" class="grow" placeholder="არტიკული ან დასახელება…" autocomplete="off">${btn('მიბმა', `addFit('${v.id}')`, '', 'plus')}</div>
   </div>
   <div class="card"><header><h3>ყველაზე ხარჯიანი ნაწილები</h3></header>${top.map(([pid, a]) => { const p = P(pid); return `<div class="rec"><div class="n"><div>${esc(p.name)}</div><div class="sub">${qfmt(a.q)} ${esc(p.uom)}</div></div><b>${money(a.c)}</b></div>`; }).join('') || '<div class="empty">—</div>'}</div>
   </div>
  </div>`;
};
async function addFit(vid) {
  const p = findProduct($('#fitp').value);
  if (!p) return toast('აირჩიეთ პროდუქტი სიიდან', 'err');
  if (fitsVin(vid, p.id)) return toast('ეს ნაწილი უკვე მიბმულია', 'info');
  await call('fitment.toggle', { vid, pid: p.id }, `მიება: ${p.name}`);
}

/* ================= catalog ================= */
// Columns are "make model year" groups. Make and model filters narrow them; at most CAT_COLS are drawn at a time.
let catMake = 'all', catModel = 'all', catQ = '', catCol = 0;
const CAT_COLS = 20;
function catGroups() {
  const g = new Map();
  S.vehicles.forEach(v => { const k = modelKey(v); if (!g.has(k)) g.set(k, { key: k, make: v.make, base: v.make + ' ' + v.model, year: v.year || '' }); });
  return [...g.values()].sort((x, y) => natural(x.base, y.base) || String(x.year).localeCompare(String(y.year)));
}
VIEWS.catalog = () => {
  const groups = catGroups();
  if (!groups.length) return ph('კატალოგი', 'რომელ ტექნიკაზე რა პროდუქტი ყენდება') + '<div class="card"><div class="empty">კატალოგისთვის ჯერ დაამატეთ ტექნიკა და პროდუქტები</div></div>';
  const makes = [...new Set(groups.map(g => g.make))].sort(natural);
  if (catMake !== 'all' && !makes.includes(catMake)) catMake = 'all';
  const bases = [...new Set(groups.filter(g => catMake === 'all' || g.make === catMake).map(g => g.base))];
  if (catModel !== 'all' && !bases.includes(catModel)) catModel = 'all';
  const cols = groups.filter(g => (catMake === 'all' || g.make === catMake) && (catModel === 'all' || g.base === catModel));
  const pages = Math.ceil(cols.length / CAT_COLS);
  if (catCol >= pages) catCol = 0;
  const shown = cols.slice(catCol * CAT_COLS, catCol * CAT_COLS + CAT_COLS), ms = shown.map(g => g.key);
  const ql = catQ.trim().toLowerCase(), n = norm(catQ);
  // Without a search the rows are products linked to a visible column; a search lists any product, to link it.
  const linked = p => ms.some(m => catEntry(m, p.id));
  const all = S.products.filter(p => ql ? (p.name.toLowerCase().includes(ql) || norm(p.art).includes(n)) : linked(p));
  const { rows, more } = limited('catalog', all);
  let histN = 0;
  catIndex().forEach(mm => mm.forEach(e => { if (!e.manual && e.hist > 0) histN++; }));
  const sel = (id, val, opts, allLabel, on) => `<select id="${id}" onchange="${on}"><option value="all">${allLabel}</option>${opts.map(o => `<option ${val === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const colNav = pages > 1 ? `<span class="sub">სვეტები ${catCol * CAT_COLS + 1}–${catCol * CAT_COLS + shown.length} / ${cols.length}</span>${btn('', 'catCol--;render()', 'sm', 'chevronL', catCol === 0)}${btn('', 'catCol++;render()', 'sm', 'chevronR', catCol >= pages - 1)}` : `<span class="sub">${cols.length} მოდელი / წელი</span>`;
  return ph('კატალოგი', 'რომელ ტექნიკაზე რა პროდუქტი ყენდება — მარკა, მოდელი და წელი · ივსება ხელით და სერვის ორდერების ისტორიიდან', btn('ისტორიიდან შევსება', "call('catalog.learn',{},n=>n?n+' კავშირი (2+ გამოყენება) დადასტურდა':'ახალი კავშირი ვერ მოიძებნა')", '', 'spark')) +
    `<div class="note ok">${ic('spark')}<div>სერვის ორდერების ისტორიიდან ნაპოვნია <b>${histN}</b> დაუდასტურებელი კავშირი. დააჭირეთ უჯრას ხელით მისაბმელად ან მოსახსნელად. კატალოგი სერვის ორდერში მხოლოდ <b>რეკომენდაციაა</b> და გაცემას არ ზღუდავს.</div></div>
  <div class="filters">${sel('catmk', catMake, makes, 'ყველა მარკა', "catMake=this.value;catModel='all';catCol=0;LIM={};render()")}${sel('catmd', catModel, bases, 'ყველა მოდელი', 'catModel=this.value;catCol=0;LIM={};render()')}
   <div class="gsearch" style="max-width:360px">${ic('search')}<input id="catq" placeholder="პროდუქტის ძებნა მისაბმელად" value="${esc(catQ)}" oninput="catQ=this.value;LIM={};render();refocus('#catq')"></div>
   <span class="sub">${all.length} პროდუქტი${ql ? '' : ' კავშირით'}</span><span style="margin-left:auto;display:flex;gap:6px;align-items:center">${colNav}</span></div>
  <div class="card"><div class="tw catwrap"><table class="t matrix"><thead><tr><th>პროდუქტი</th>${shown.map(g => `<th title="${esc(g.key)}"><div class="mx-h">${esc(g.base)}</div><div class="sub">${esc(g.year || '—')}</div></th>`).join('')}</tr></thead><tbody>
  ${rows.map(p => `<tr><td><div style="font-weight:500">${esc(p.name)}</div><div class="sub mono">${esc(p.art)}</div></td>${ms.map(m => { const e = catEntry(m, p.id); const cls = e ? (e.manual && e.hist ? 'both' : e.manual ? 'man' : 'hist') : ''; return `<td><button class="mx ${cls}" onclick="call('catalog.toggle',{model:'${esc(jsq(m))}',pid:'${p.id}'},r=>r?'მიება: ${esc(jsq(p.name))}':'ხელით მიბმა მოიხსნა')" title="${esc(m)}${e ? ' · ' + (e.manual ? 'ხელით მიბმული' : '') + (e.hist ? ' · ისტორიაში ' + e.hist + '-ჯერ' : '') : ' · დააჭირეთ მისაბმელად'}">${e ? (e.hist ? e.hist + '×' : '●') : ''}</button></td>`; }).join('')}</tr>`).join('') || emptyRow(ms.length + 1, ql ? 'ვერ მოიძებნა' : 'ამ სვეტებში კავშირი ჯერ არ არის — მოძებნეთ პროდუქტი მისაბმელად')}
  </tbody></table></div>${more}
  <div class="body legend" style="border-top:1px solid var(--line2);margin:0"><span><i style="background:var(--accent)"></i>ხელით მიბმული</span><span><i style="background:var(--ok-bg);border:1px solid #b6dec6"></i>ისტორიიდან (N× = გამოყენების რაოდენობა)</span><span><i style="background:var(--accent);box-shadow:0 0 0 2px #b6dec6"></i>ორივე</span></div></div>`;
};

/* ================= reports ================= */
let repTab = 'veh', repV = 'all', repFrom = '', repTo = '', repWh = 'all', repLow = false;
function vehReport() {
  const os = S.sos.filter(o => (repV === 'all' || o.vid === repV) && o.date >= repFrom && o.date <= repTo);
  const g = new Map(); os.forEach(o => { if (!g.has(o.vid)) g.set(o.vid, []); g.get(o.vid).push(o); });
  const byV = S.vehicles.map(v => { const vo = g.get(v.id) || []; return { v, n: vo.length, p: vo.reduce((a, o) => a + partsCost(o), 0), s: vo.reduce((a, o) => a + svcCost(o), 0) }; }).filter(r => r.n).sort((a, b) => (b.p + b.s) - (a.p + a.s));
  return { os, byV };
}
function stockReport() {
  const ws = repWh === 'all' ? whs() : [+repWh], q = p => ws.reduce((a, w) => a + p.stock[w].q, 0);
  return { ws, q, list: S.products.filter(p => !repLow || (p.min > 0 && q(p) < p.min)) };
}
VIEWS.reports = () => {
  if (!repFrom) { repFrom = TODAY.slice(0, 4) + '-01-01'; repTo = TODAY; }
  const tabs = [['veh', 'ტექნიკის დანახარჯები'], ['stock', 'საწყობის ნაშთი'], ['moves', 'მოძრაობის ჟურნალი']];
  let h = ph('რეპორტები', 'ანალიტიკა ლოკალური ბაზიდან', btn('Excel (CSV)', 'exportReport()', '', 'download')) + `<div class="tabs">${tabs.map(([k, l]) => `<button class="${repTab === k ? 'on' : ''}" onclick="repTab='${k}';render()">${l}</button>`).join('')}</div>`;
  if (repTab === 'veh') {
    const { os, byV } = vehReport(), pc = os.reduce((a, o) => a + partsCost(o), 0), sc = os.reduce((a, o) => a + svcCost(o), 0);
    const yr = repTo.slice(0, 4), lastM = yr === TODAY.slice(0, 4) ? +TODAY.slice(5, 7) : 12;
    const months = Array.from({ length: lastM }, (_, i) => { const k = yr + '-' + pad2(i + 1), mo = os.filter(o => o.date.startsWith(k)); return { l: MONTHS[i], p: mo.reduce((a, o) => a + partsCost(o), 0), s: mo.reduce((a, o) => a + svcCost(o), 0) }; });
    const max = Math.max(1, ...months.map(m => m.p + m.s));
    h += `<div class="filters"><select onchange="repV=this.value;render()"><option value="all">ყველა ტექნიკა</option>${S.vehicles.map(v => `<option value="${v.id}" ${repV === v.id ? 'selected' : ''}>${esc(v.plate)} — ${esc(modelKey(v))}</option>`).join('')}</select>
      <span class="sub">პერიოდი</span><input type="date" value="${repFrom}" onchange="repFrom=this.value;render()"><span class="sub">—</span><input type="date" value="${repTo}" onchange="repTo=this.value;render()"></div>
     <div class="kpis">${kpi('დანახარჯი სულ', money(pc + sc), os.length + ' სერვის ორდერი')}${kpi('ნაწილები', money(pc), Math.round(pc / (pc + sc || 1) * 100) + '% ჯამიდან')}${kpi('მომსახურება', money(sc), 'ფასიანი მომსახურება')}${kpi('საშუალო ორდერი', money(os.length ? (pc + sc) / os.length : 0), 'ერთ ვიზიტზე')}</div>
     <div class="card"><header><h3>დანახარჯი თვეების მიხედვით — ${yr}</h3></header><div class="body">
      <div class="chart">${months.map(m => `<div class="col" title="${m.l}: ნაწილები ${money(m.p)}, მომსახურება ${money(m.s)}"><div class="val">${m.p + m.s ? Math.round(m.p + m.s) : ''}</div><div class="seg-s" style="height:${m.s / max * 85}%"></div><div class="seg-p" style="height:${m.p / max * 85}%;${m.s ? 'border-radius:0' : ''}"></div></div>`).join('')}</div>
      <div class="chart-x">${months.map(m => `<span>${m.l}</span>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--accent)"></i>ნაწილები</span><span><i style="background:var(--accent-2);opacity:.75"></i>მომსახურება</span><span>ერთეული: ₾</span></div></div></div>
     <div class="card"><header><h3>ტექნიკის ჭრილში</h3></header><div class="tw"><table class="t"><thead><tr><th>ტექნიკა</th><th>VIN</th><th class="num">ორდერი</th><th class="num">ნაწილები</th><th class="num">მომსახურება</th><th class="num">სულ</th></tr></thead><tbody>
      ${byV.map(r => `<tr class="click" onclick="go('vehicle','${r.v.id}')"><td>${plate(r.v.plate)} ${esc(modelKey(r.v))}</td><td class="mono sub">${esc(r.v.vin)}</td><td class="num">${r.n}</td><td class="num">${money(r.p)}</td><td class="num">${money(r.s)}</td><td class="num"><b>${money(r.p + r.s)}</b></td></tr>`).join('') || emptyRow(6, 'ამ პერიოდში მონაცემი არ არის')}
     </tbody><tfoot><tr><td colspan="3">სულ</td><td class="num">${money(pc)}</td><td class="num">${money(sc)}</td><td class="num">${money(pc + sc)}</td></tr></tfoot></table></div></div>`;
  } else if (repTab === 'stock') {
    const { ws, q, list } = stockReport(), tv = list.reduce((a, p) => a + q(p) * p.cost, 0);
    h += `<div class="filters">${S.settings.wh2 ? `<select onchange="repWh=this.value;render()"><option value="all">ყველა საწყობი</option>${whs().map(w => `<option value="${w}" ${repWh == w ? 'selected' : ''}>${esc(S.wh[w])}</option>`).join('')}</select>` : `<span class="chip">${ic('grid')}${esc(S.wh[1])}</span>`}
      <label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" ${repLow ? 'checked' : ''} onchange="repLow=this.checked;render()">მხოლოდ მინიმუმზე ნაკლები</label><span class="sub">მდგომარეობა ${fmtD(TODAY)}</span></div>
     <div class="kpis">${kpi('ნაშთის ღირებულება', money(tv), list.length + ' პოზიცია')}${kpi('მცირე მარაგი', list.filter(p => p.min > 0 && q(p) < p.min).length, 'შესყიდვაა საჭირო', 'warn')}${kpi('ნულოვანი ნაშთი', list.filter(p => q(p) === 0).length, 'პოზიცია')}${kpi('ლოკაციით აღრიცხული', S.products.filter(p => p.stock[1].loc).length + '/' + S.products.length, 'პროდუქტი')}</div>
     <div class="card"><div class="tw"><table class="t"><thead><tr><th>უნიკ. №</th><th>არტიკული</th><th>დასახელება</th><th>ლოკაცია</th><th class="num">ნაშთი</th><th class="num">მინ.</th><th class="num">საშ. ღირებ.</th><th class="num">ღირებულება</th><th>სტატუსი</th></tr></thead><tbody>
      ${limited('repstock', list).rows.map(p => `<tr class="click" onclick="openProduct('${p.id}')"><td class="mono">${p.id}</td><td class="mono">${esc(p.art)}</td><td>${esc(p.name)}</td><td class="mono">${ws.map(w => esc(p.stock[w].loc || '—')).join(' / ')}</td><td class="num"><b>${qfmt(q(p))}</b> ${esc(p.uom)}</td><td class="num">${qfmt(p.min)}</td><td class="num">${money(p.cost)}</td><td class="num">${money(q(p) * p.cost)}</td><td>${p.min > 0 && q(p) < p.min ? '<span class="badge b-low">მცირე</span>' : '<span class="badge b-ok">OK</span>'}</td></tr>`).join('') || emptyRow(9, 'პროდუქტი არ არის')}
     </tbody><tfoot><tr><td colspan="7">სულ</td><td class="num">${money(tv)}</td><td></td></tr></tfoot></table></div>${limited('repstock', list).more}</div>`;
  } else {
    h += `<div class="note">${ic('info')}<div>ნაჩვენებია ბოლო ${S.moves.length} მოძრაობა. სრული ჟურნალი — „Excel (CSV)“ ღილაკით.</div></div><div class="card">${movesTable(limited('moves', S.moves).rows)}${limited('moves', S.moves).more}</div>`;
  }
  return h;
};
const csvCell = v => { v = String(v ?? ''); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const cn = n => String(Math.round((n || 0) * 100) / 100).replace('.', ',');
async function saveText(name, content) {
  const r = await window.api.invoke('file.save', { name, content });
  if (!r.ok) toast(r.error, 'err'); else if (r.result) toast('შენახულია: ' + r.result);
}
function saveCSV(name, header, rows) { return saveText(name, [header, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n')); }
function exportReport() {
  if (repTab === 'veh') {
    const { byV } = vehReport();
    return saveCSV(`AxiomaWMS_ტექნიკის_დანახარჯები_${repFrom}_${repTo}.csv`, ['სახ. ნომერი', 'VIN', 'მარკა / მოდელი', 'ორდერი', 'ნაწილები', 'მომსახურება', 'სულ'],
      byV.map(r => [r.v.plate, r.v.vin, modelKey(r.v), r.n, cn(r.p), cn(r.s), cn(r.p + r.s)]));
  }
  if (repTab === 'stock') {
    const { ws, q, list } = stockReport();
    return saveCSV(`AxiomaWMS_ნაშთი_${TODAY}.csv`, ['უნიკ. №', 'არტიკული', 'დასახელება', 'ზომის ერთეული', 'ლოკაცია', 'ნაშთი', 'მინ. ნაშთი', 'საშ. ღირებულება', 'ღირებულება'],
      list.map(p => [p.id, p.art, p.name, p.uom, ws.map(w => p.stock[w].loc).join(' / '), cn(q(p)), cn(p.min), cn(p.cost), cn(q(p) * p.cost)]));
  }
  return saveCSV(`AxiomaWMS_მოძრაობები_${TODAY}.csv`, ['თარიღი', 'ტიპი', 'დოკუმენტი', 'არტიკული', 'დასახელება', 'საწყობი', 'რაოდენობა', 'შენიშვნა'],
    S.moves.map(m => { const p = P(m.pid) || { art: '', name: m.pid }; return [fmtD(m.date), (MOVE_T[m.type] || [m.type])[0], m.ref, p.art, p.name, m.type === 'tr' ? S.wh[m.wh] + ' → ' + S.wh[m.to] : S.wh[m.wh], (m.type === 'out' ? '-' : '') + cn(m.qty), m.note || '']; }));
}

/* ================= settings ================= */
const setRow = (t, s, right) => `<div class="setrow"><div class="grow"><div class="t1">${t}</div><div class="sub">${s}</div></div>${right}</div>`;
VIEWS.settings = () => {
  const lb = lastBackup(), dir = S.settings.backupDir;
  compLogo = S.settings.company.logo || '';
  return ph('პარამეტრები', 'ლოკალური ინსტალაცია · ერთი მომხმარებელი, ავტორიზაციის გარეშე') +
    `<div class="cols eq"><div>
   <div class="card"><header><h3>კომპანია</h3><div class="acts">${btn('შენახვა', 'saveCompany()', 'sm primary', 'check')}</div></header><div class="body">${companyFields(S.settings.company)}</div></div>
   <div class="card"><header><h3>საწყობები</h3></header>
    <div class="setrow"><div class="grow"><div class="t1">მთავარი საწყობი</div><input style="margin-top:6px;width:260px" value="${esc(S.wh[1])}" onchange="call('settings.set',{key:'wh1Name',value:this.value},'შენახულია')"></div><span class="badge b-ok">აქტიური</span></div>
    <div class="setrow"><div class="grow"><div class="t1">მეორე საწყობის ჩართვა</div><div class="sub">ჩართვისას ჩნდება საწყობის არჩევა ორდერებში, ნაშთებში, რეპორტებში და გადაადგილება საწყობებს შორის.</div>
     ${S.settings.wh2 ? `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><input style="width:220px" value="${esc(S.wh[2])}" onchange="call('settings.set',{key:'wh2Name',value:this.value},'შენახულია')">${btn('გადაადგილება', 'openTransfer()', 'sm', 'swap')}</div>` : ''}</div>
     <label class="switch"><input type="checkbox" ${S.settings.wh2 ? 'checked' : ''} onchange="call('settings.set',{key:'wh2',value:this.checked},this.checked?'მეორე საწყობი ჩაირთო':'მეორე საწყობი გამოირთო').then(r=>{if(!r)render()})"><span></span></label></div>
   </div>
   <div class="card"><header><h3>აღრიცხვის წესები</h3></header>
    ${setRow('სერვის ორდერის ავტომატური დახურვა', 'ღია ორდერი იხურება <b>ბოლო ცვლილებიდან</b> N დღეში (გაცემა, დაბრუნება, მომსახურება, ველის შეცვლა, ხელახლა გახსნა)', `<input type="number" class="w80" min="1" max="365" value="${S.settings.autoClose}" onchange="call('settings.set',{key:'autoClose',value:this.value},n=>'ვადა შენახულია'+(n?' · '+n+' ორდერი დაიხურა':''))"><span class="sub">დღე</span>`)}
    ${setRow('უარყოფითი ნაშთი', 'გაცემა და გადაადგილება ნაშთზე მეტი რაოდენობით შეუძლებელია. ფიქსირებული წესია — არ იცვლება.', `<span class="badge b-low nodot" style="gap:6px">${ic('lock')}ყოველთვის აკრძალულია</span>`)}
    ${setRow('ღირებულების მეთოდი', 'საშუალო შეწონილი — ხელახლა ითვლება ყოველი შესყიდვისას. ფიქსირებული წესია.', `<span class="badge b-open nodot" style="gap:6px">${ic('lock')}საშუალო</span>`)}
    ${setRow('კატალოგის რეკომენდაცია', 'სერვის ორდერში ჩანს მოდელზე მორგებული ნაწილები და გაფრთხილება კატალოგის გარეშე პროდუქტზე. მხოლოდ რეკომენდაციაა — გაცემას არასდროს ზღუდავს.', `<label class="switch"><input type="checkbox" ${S.settings.catalogRec ? 'checked' : ''} onchange="call('settings.set',{key:'catalogRec',value:this.checked},this.checked?'რეკომენდაცია ჩაირთო':'რეკომენდაცია გამოირთო').then(r=>{if(!r)render()})"><span></span></label>`)}
   </div>
   <div class="card"><header><h3>ზომის ერთეულები</h3></header><div class="body"><div class="chips" style="margin-bottom:10px">${S.uoms.map(u => `<span class="chip">${esc(u)}</span>`).join('')}</div>
    <div style="display:flex;gap:8px"><input id="nu" placeholder="ახალი ერთეული"><button class="btn" onclick="call('uom.add',{name:$('#nu').value},'ერთეული დაემატა')">${ic('plus')}დამატება</button></div></div></div>
  </div><div>
   <div class="card"><header><h3>${ic('db')} სარეზერვო ასლი</h3></header>
    <div class="setrow"><div class="grow"><div class="t1">საქაღალდე — USB / გარე SSD</div><div class="sub mono">${dir ? esc(dir) : 'არ არის არჩეული'}</div></div>${dir ? (S.backupOk ? '<span class="badge b-ok">მიერთებულია</span>' : '<span class="badge b-low">არ არის მიერთებული</span>') : ''}${btn(dir ? 'შეცვლა' : 'არჩევა', 'chooseBackupDir()', 'sm', 'folder')}</div>
    ${setRow('განრიგი', 'ავტომატური ასლი პროგრამის დახურვისას, თუ დისკი მიერთებულია და მონაცემები შეიცვალა', `<select onchange="call('settings.set',{key:'backupSchedule',value:this.value},'შენახულია')">${[['close', 'პროგრამის დახურვისას'], ['manual', 'მხოლოდ ხელით']].map(([k, l]) => `<option value="${k}" ${S.settings.backupSchedule === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    ${setRow('ბოლო ასლი', lb ? esc(lb.at.slice(0, 16)) + ' · <span class="mono">' + esc(lb.file) + '</span>' : 'ჯერ არ შექმნილა', btn('ასლის შექმნა', 'runBackup()', 'sm primary', 'download', !dir, 'bkBtn') + btn('აღდგენა', 'openRestore()', 'sm', 'undo'))}
    <div class="tw"><table class="t"><thead><tr><th>ფაილი</th><th>თარიღი</th><th class="num">ზომა</th></tr></thead><tbody id="bklist">${emptyRow(3, dir ? 'იტვირთება…' : 'აირჩიეთ საქაღალდე')}</tbody></table></div>
   </div>
   <div class="card"><header><h3>${ic('upload')} CSV იმპორტი</h3></header>
    ${Object.entries(IMP).map(([k, x]) => setRow(x.t, x.d, btn('იმპორტი', `openImport('${k}')`, 'sm', 'upload'))).join('')}
   </div>
  </div></div>
  <div class="card"><header><h3>პროგრამის შესახებ</h3></header>
   <div class="about-head"><img src="logo.svg" alt="" class="about-logo"><div><div class="about-name">Axioma WMS <span class="sub">v${esc(S.app.version)}</span></div><div class="muted">Workshop Management System</div></div></div>
   <div class="about-grid"><span class="muted">შემქმნელი</span><b style="font-weight:600">Axioma Software LLC</b>
    <span class="muted">ვებგვერდი</span><span><a class="link" onclick="window.api.invoke('app.openSite')" title="იხსნება ბრაუზერში">axiomasoft.ge ${ic('external')}</a></span></div>
   ${setRow('მონაცემთა ბაზა', 'ლოკალური, ოფლაინ · <span class="mono">' + esc(S.app.dbPath) + '</span>', btn('საქაღალდის გახსნა', "window.api.invoke('app.showData')", 'sm', 'folder'))}
   <div class="about-foot">© 2026 Axioma Software LLC</div>
  </div>`;
};
async function saveCompany() { await call('company.save', { company: companyValues() }, 'კომპანიის მონაცემები შენახულია'); }
async function loadBackups() {
  const el = $('#bklist');
  if (!el || !S.settings.backupDir) return;
  const r = await window.api.invoke('backup.list');
  const list = r.ok ? r.result : [];
  if ($('#bklist')) $('#bklist').innerHTML = list.slice(0, 8).map(b => `<tr><td class="mono">${esc(b.name)}</td><td>${new Date(b.mtime).toLocaleString('ka-GE')}</td><td class="num">${(b.size / 1048576).toFixed(1)} MB</td></tr>`).join('') || emptyRow(3, S.backupOk ? 'ასლი ჯერ არ არის' : 'დისკი არ არის მიერთებული');
}
async function chooseBackupDir() {
  const r = await window.api.invoke('backup.chooseDir');
  if (!r.ok) return toast(r.error, 'err');
  if (r.result) { apply(r.state); render(); toast('სარეზერვო საქაღალდე: ' + r.result); }
}
async function runBackup() {
  const b = $('#bkBtn');
  if (b) { b.disabled = true; b.textContent = 'იქმნება…'; }
  const r = await window.api.invoke('backup.run');
  if (!r.ok) { toast(r.error, 'err'); render(); return; }
  apply(r.state); render(); toast('სარეზერვო ასლი შეიქმნა: ' + r.result);
}
let rsFile = null;
async function openRestore() {
  const r = await window.api.invoke('backup.list');
  const list = r.ok ? r.result : [];
  rsFile = list[0]?.file || null;
  openModal('აღდგენა სარეზერვო ასლიდან', `<div class="note warn">${ic('alert')}<div>მიმდინარე მონაცემები ჩანაცვლდება არჩეული ასლით. აღდგენამდე მიმდინარე მდგომარეობა ავტომატურად შეინახება პროგრამის საქაღალდეში (safety).</div></div>
   ${list.length ? `<div class="pick">${list.map((b, i) => `<button class="${i === 0 ? 'on' : ''}" onclick="rsFile=this.dataset.f;this.parentNode.querySelectorAll('button').forEach(x=>x.classList.remove('on'));this.classList.add('on')" data-f="${esc(b.file)}">${ic('db')}<span>${new Date(b.mtime).toLocaleString('ka-GE')}</span><span class="mono sub" style="margin-left:auto">${esc(b.name)} · ${(b.size / 1048576).toFixed(1)} MB</span></button>`).join('')}</div>` : `<div class="empty">${S.settings.backupDir ? 'ამ საქაღალდეში ასლი არ არის' : 'სარეზერვო საქაღალდე არ არის არჩეული'}</div>`}`,
  btn('სხვა ფაილის არჩევა…', 'doRestore(null)', 'ghost', 'folder') + btn('გაუქმება', 'closeModal()') + btn('აღდგენა', 'doRestore(rsFile)', 'primary', 'undo', !list.length));
}
async function doRestore(file) {
  closeModal();
  const r = await window.api.invoke('backup.restore', file);
  if (!r.ok) return toast(r.error, 'err');
  if (!r.result) return;
  apply(r.state); go('dashboard');
  toast('მონაცემები აღდგენილია. წინა მდგომარეობა შენახულია: ' + r.result);
}

/* ================= CSV import ================= */
const IMP = {
  products: { t: 'პროდუქტები და ნაშთი', d: 'ახალი პროდუქტები და არსებულის განახლება: დასახელება, ერთეული, მინ. ნაშთი, რაოდენობა, ფასი, ლოკაცია, საწყობი', cols: ['არტიკული', 'დასახელება', 'ზომის ერთეული', 'მინ. ნაშთი', 'რაოდენობა', 'ღირებულება', 'ლოკაცია', 'საწყობი'] },
  vehicles: { t: 'ტექნიკა', d: 'სახ. ნომერი, VIN, მარკა, მოდელი, წელი, გარბენი, განყოფილება', cols: ['სახ. ნომერი', 'VIN', 'მარკა', 'მოდელი', 'წელი', 'გარბენი', 'განყოფილება'] },
  fitment: { t: 'შესაბამისობა (VIN × არტიკული)', d: 'რომელი ნაწილი რომელ ტექნიკაზე ყენდება: სტრიქონი = VIN, სვეტი = არტიკული, ნიშანი 1 / x / ✓', cols: ['VIN', 'ტექნიკა', 'ნაწილი'] }
};
const blankImp = type => ({ type, rows: [], checked: [], name: '', header: false, missing: [], replace: false, unknown: [], articles: 0 });
let imp = blankImp('products');
const IMP_ST = { new: ['ახალი', 'b-ok'], upd: ['განახლდება', 'b-open'], same: ['უცვლელი', 'b-closed'], err: ['შეცდომა', 'b-low'] };
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  // The separator is chosen from the first lines, not the header alone: Excel may save a header with stray ";" and
  // data with ",". The winner splits the most lines into more than one column (ties: more columns per line).
  const sample = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 20);
  const cols = (l, c) => l.replace(/"[^"]*"/g, '').split(c).length;
  const score = c => [sample.filter(l => cols(l, c) > 1).length, sample.reduce((a, l) => a + cols(l, c), 0)];
  const d = [';', ',', '\t'].map(c => [c, score(c)]).sort((x, y) => y[1][0] - x[1][0] || y[1][1] - x[1][1])[0][0];
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== '')).map(r => r.map(x => x.trim()));
}
function openImport(type = 'products') {
  if (!IMP[type]) type = 'products';
  imp = blankImp(type);
  openModal('CSV იმპორტი', '<div id="impb"></div>', '<span class="left" id="impsum"></span>' + btn('გაუქმება', 'closeModal()') + `<button class="btn primary" id="impgo" onclick="doImport()" disabled>${ic('check')}იმპორტი</button>`, true);
  impRender();
}
function impRender() {
  const d = IMP[imp.type], ch = imp.checked;
  const cnt = k => ch.filter(r => r.st === k).length, n = cnt('new'), u = cnt('upd'), same = cnt('same'), e = cnt('err');
  $('#impb').innerHTML = `<div class="filters"><div class="seg">${Object.entries(IMP).map(([k, x]) => `<button class="${imp.type === k ? 'on' : ''}" onclick="imp=blankImp('${k}');impRender()">${x.t}</button>`).join('')}</div></div>
   <div class="drop" ondragover="event.preventDefault()" ondrop="event.preventDefault();impFile(event.dataTransfer.files[0])">${ic('upload')}
    <div><b>აირჩიეთ ან ჩააგდეთ CSV ფაილი</b><div class="sub">Excel-ში: ფაილი → შენახვა როგორც → „CSV UTF-8“. გამყოფი „;“ ან „,“ — ავტომატურად ცნობს. პირველი სტრიქონი შეიძლება იყოს სათაური.</div></div>
    <label class="btn">ფაილის არჩევა<input type="file" accept=".csv,text/csv" hidden onchange="impFile(this.files[0])"></label>
    ${btn('შაბლონი', 'impTemplate()', 'ghost', 'download')}</div>
   ${imp.type === 'fitment' ? `<div class="sub" style="margin:10px 0 6px">ფაილი: <b>პირველი სვეტი VIN</b>, დანარჩენი სვეტების სათაური — <b>არტიკული</b>; უჯრაში <b>1 / x / ✓ / +</b> ნიშნავს, რომ ნაწილი ამ ტექნიკაზე ყენდება. სვეტები „სახ. ნომერი“, „მოდელი“ დასაშვებია და იგნორირდება. „შაბლონი“ ჩამოტვირთავს მატრიცას ყველა ტექნიკით და არტიკულით, არსებული კავშირები მონიშნულია.</div>
   <label style="display:flex;gap:8px;align-items:center;cursor:pointer;margin:0 0 10px;font-size:13px"><input type="checkbox" ${imp.replace ? 'checked' : ''} onchange="imp.replace=this.checked;impRecheck()"><span><b>ჩანაცვლება</b> — ფაილში მოცემულ VIN-ებზე ძველი კავშირები წაიშლება და დარჩება მხოლოდ ფაილში მონიშნული (გამორთულია: მხოლოდ დამატება)</span></label>
   ${imp.unknown.length ? `<div class="note warn">${ic('alert')}<div>${imp.unknown.length} არტიკული სვეტი ვერ მოიძებნა პროდუქტებში და გამოტოვდება: <span class="mono">${imp.unknown.slice(0, 12).map(esc).join(', ')}${imp.unknown.length > 12 ? ' …' : ''}</span></div></div>` : ''}
   ${ch.length ? `<div class="sub" style="margin:0 0 12px">ამოცნობილი არტიკული სვეტები: <b>${imp.articles}</b></div>` : ''}` : `<div class="sub" style="margin:10px 0 4px">სვეტები: ${d.cols.map(c => `<span class="tag">${c}</span>`).join(' ')}</div>
   <div class="sub" style="margin:0 0 12px">${imp.type === 'products' ? 'არსებულ პროდუქტზე <b>ცარიელი უჯრა = არ შეიცვალოს</b>; შევსებული რაოდენობა ჩაანაცვლებს ნაშთს. საწყობი: 1 ან 2 (ცარიელი = 1). ' : ''}${ch.length ? (imp.header ? 'სვეტები ამოცნობილია სათაურით' + (imp.missing.length ? ' · ფაილში არ არის: ' + imp.missing.map(k => d.cols[IMP_KEYS[imp.type].indexOf(k)]).join(', ') : '') : 'სათაური არ არის — სვეტები თანმიმდევრობით') : 'სათაურის სტრიქონი რეკომენდებულია: სვეტებს სახელით ვცნობთ, მიმდევრობა არ არის მნიშვნელოვანი.'}</div>`}
   ${ch.length ? `<div class="tw" style="max-height:340px;border:1px solid var(--line);border-radius:8px"><table class="t"><thead><tr><th>#</th>${d.cols.map(c => `<th>${c}</th>`).join('')}<th>სტატუსი</th></tr></thead><tbody>
    ${ch.slice(0, 300).map((r, i) => `<tr class="${r.st}"><td class="sub">${i + 1}</td>${r.c.map(x => `<td>${esc(x) || '<span class="sub">—</span>'}</td>`).join('')}<td><span class="badge ${IMP_ST[r.st][1]}">${IMP_ST[r.st][0]}</span>${r.msg ? `<div class="sub" style="${r.st === 'err' ? 'color:var(--bad)' : ''}">${esc(r.msg)}</div>` : ''}</td></tr>`).join('')}
   </tbody></table></div>${ch.length > 300 ? `<div class="sub" style="margin-top:6px">ნაჩვენებია პირველი 300 სტრიქონი ${ch.length}-დან</div>` : ''}` : ''}`;
  $('#impsum').textContent = !ch.length ? '' : imp.type === 'fitment' ? `${imp.name}: ${u} ტექნიკა განახლდება · ${same} უცვლელი · ${e} შეცდომა (გამოტოვდება)` : `${imp.name}: ${n} ახალი · ${u} განახლდება · ${same} უცვლელი · ${e} შეცდომა (გამოტოვდება)`;
  $('#impgo').disabled = !(n + u);
}
async function impParse(text, name) {
  // The header row (if any) is recognised in db.js, so the raw rows are sent as they are.
  const rows = parseCSV(text);
  if (!rows.length) return toast('ფაილი ცარიელია', 'err');
  if (rows.length > 10001) return toast('მაქსიმუმ 10 000 სტრიქონი ერთ ფაილში', 'err');
  const r = await window.api.invoke('cmd', 'import.check', { type: imp.type, rows, replace: imp.replace });
  if (!r.ok) return toast(r.error, 'err');
  if (!r.result.rows.length) return toast('ფაილში მხოლოდ სათაურია', 'err');
  Object.assign(imp, { rows, checked: r.result.rows, header: r.result.header, missing: r.result.missing, unknown: r.result.unknown || [], articles: r.result.articles || 0, name });
  impRender();
}
// The replace option changes what each row would do, so the preview is checked again.
async function impRecheck() {
  if (!imp.rows.length) return impRender();
  const r = await window.api.invoke('cmd', 'import.check', { type: imp.type, rows: imp.rows, replace: imp.replace });
  if (!r.ok) return toast(r.error, 'err');
  imp.checked = r.result.rows;
  impRender();
}
function impFile(f) {
  if (!f) return;
  if (!/\.csv$/i.test(f.name)) return toast('აირჩიეთ .csv ფაილი', 'err');
  const r = new FileReader();
  r.onload = () => impParse(r.result, f.name);
  r.readAsText(f, 'UTF-8');
}
// Column keys in db.js order (IMPORT_COLS), used to name columns missing from a file's header.
const IMP_KEYS = { products: ['art', 'name', 'uom', 'min', 'qty', 'cost', 'loc', 'wh'], vehicles: ['plate', 'vin', 'make', 'model', 'year', 'km', 'dept'] };
const IMP_FILE = { products: 'პროდუქტები_და_ნაშთი', vehicles: 'ტექნიკა', fitment: 'შესაბამისობა_VIN' };
function impTemplate() {
  if (imp.type !== 'fitment') return saveText(`AxiomaWMS_${IMP_FILE[imp.type]}_შაბლონი.csv`, IMP[imp.type].cols.join(';') + '\r\n');
  // Pre-filled matrix: every vehicle × every article, current links marked with 1.
  const arts = S.products.map(p => p.art), pidOf = S.products.map(p => p.id);
  const lines = [['VIN', 'სახ. ნომერი', 'მოდელი', ...arts].map(csvCell).join(';')];
  S.vehicles.forEach(v => { const own = new Set(fitOf(v.id)); lines.push([v.vin, v.plate, modelKey(v), ...pidOf.map(pid => own.has(pid) ? '1' : '')].map(csvCell).join(';')); });
  if (!S.vehicles.length) toast('ტექნიკა ჯერ არ არის — შაბლონში მხოლოდ სათაური იქნება', 'info');
  saveText(`AxiomaWMS_${IMP_FILE.fitment}_${TODAY}.csv`, lines.join('\r\n') + '\r\n');
}
async function doImport() {
  const b = $('#impgo'); b.disabled = true;
  const res = await call('import.apply', { type: imp.type, rows: imp.rows, replace: imp.replace });
  if (!res) { b.disabled = false; return; }
  closeModal();
  if (imp.type === 'fitment') return toast(`შესაბამისობა: ${res.n} ახალი კავშირი, ${res.u} ტექნიკა განახლდა${res.skipped ? ', ' + res.skipped + ' სტრიქონი გამოტოვდა' : ''}`);
  toast(`იმპორტი დასრულდა: ${res.n} ახალი, ${res.u} განახლდა${res.same ? ', ' + res.same + ' უცვლელი' : ''}${res.skipped ? ', ' + res.skipped + ' გამოტოვდა' : ''}`);
}

/* ================= service order PDF ================= */
// Lines in picking order: by warehouse, then location (natural order), lines without a location last.
const pickOrder = parts => parts.slice().sort((a, b) => {
  const la = P(a.pid).stock[a.wh].loc, lb = P(b.pid).stock[b.wh].loc;
  return a.wh - b.wh || (!la - !lb) || natural(la || '', lb || '');
});
let pvSO = null;
function printSO(id) {
  const o = SO(id), v = V(o.vid), c = S.settings.company, st = { open: 'ღია', closed: 'დახურული', auto: 'ავტო-დახურული' }[o.status];
  pvSO = id;
  $('#pvSheet').innerHTML = `<div class="sh-head"><div>${c.logo ? `<img class="sh-logo" src="${c.logo}" alt="">` : ''}<div class="sh-org">${esc(c.name)}</div><div>${[c.tin && 'ს/კ: ' + esc(c.tin), esc(c.address), esc(c.phone)].filter(Boolean).join(' · ')}</div><div>${esc(S.wh[1])}</div></div>
   <div style="text-align:right"><h2>სერვის ორდერი</h2><div class="mono" style="font-size:13px">№ ${o.id}</div><div>თარიღი: ${fmtD(o.date)} · სტატუსი: ${st}</div></div></div>
   <table class="kv"><tr><th>სახელმწიფო ნომერი</th><td>${esc(v.plate)}</td><th>VIN კოდი</th><td class="mono">${esc(v.vin)}</td></tr>
    <tr><th>მარკა / მოდელი</th><td>${esc(modelKey(v))}${v.year ? ', ' + esc(v.year) : ''}</td><th>გარბენი (კმ / საათი)</th><td>${qfmt(o.km)}</td></tr>
    <tr><th>პასუხისმგებელი პირი</th><td colspan="3"><b>${esc(o.resp)}</b></td></tr></table>
   <h3>გაცემული ნაწილები <span style="font-weight:400;font-size:10px">· დალაგებულია ლოკაციის მიხედვით (აღებისთვის)</span></h3><table><thead><tr><th>#</th><th>ლოკაცია</th><th>არტიკული</th><th>დასახელება</th><th>გაცემ.</th><th>დაბრ.</th><th>ერთ.</th><th>ფასი</th><th>ჯამი</th></tr></thead><tbody>
   ${pickOrder(o.parts).map((l, i) => { const p = P(l.pid), loc = p.stock[l.wh].loc; return `<tr><td>${i + 1}</td><td class="mono" style="white-space:nowrap"><b>${esc(loc || '—')}</b>${S.settings.wh2 ? `<div style="font-size:10px">${esc(S.wh[l.wh])}</div>` : ''}</td><td class="mono">${esc(p.art)}</td><td>${esc(p.name)}${l.serials.length ? `<div style="font-size:10px;margin-top:2px">S/N: ${l.serials.map(s => l.retSerials.some(x => sameCode(x, s)) ? esc(s) + ' (დაბრ.)' : esc(s)).join(', ')}</div>` : ''}</td><td class="num">${qfmt(l.qty)}</td><td class="num">${l.ret ? qfmt(l.ret) : ''}</td><td>${esc(p.uom)}</td><td class="num">${money(l.price)}</td><td class="num">${money((l.qty - l.ret) * l.price)}</td></tr>`; }).join('') || '<tr><td colspan="9">—</td></tr>'}
   </tbody><tfoot><tr><td colspan="8">ნაწილები სულ</td><td class="num">${money(partsCost(o))}</td></tr></tfoot></table>
   <h3>მომსახურება</h3><table><thead><tr><th>#</th><th>დასახელება</th><th>ფასი</th></tr></thead><tbody>${o.svcs.map((s, i) => `<tr><td style="width:24px">${i + 1}</td><td>${esc(s.name)}</td><td class="num" style="width:110px">${s.price != null ? money(s.price) : '—'}</td></tr>`).join('') || '<tr><td colspan="3">—</td></tr>'}</tbody></table>
   <div class="sh-tot">სულ: ${money(soCost(o))}</div>
   <div class="sig"><div>გასცა (მესაწყობე)<br><br>სახელი, გვარი: ______________________<br><br>ხელმოწერა: ______________</div>
    <div>მიიღო (პასუხისმგებელი პირი)<br><br>სახელი, გვარი: <b>${esc(o.resp)}</b><br><br>ხელმოწერა: ______________</div></div>
   <div class="sh-foot">Axioma WMS · axiomasoft.ge</div>`;
  $('#pv').hidden = false;
}
function closePrint() { $('#pv').hidden = true; }
async function savePDF() {
  const b = $('#pdfBtn');
  b.disabled = true; b.textContent = 'იქმნება…';
  const r = await window.api.invoke('pdf.save', pvSO + '.pdf');
  b.disabled = false; b.textContent = 'PDF-ად შენახვა';
  if (!r.ok) toast(r.error, 'err'); else if (r.result) toast('PDF შენახულია: ' + r.result);
}

/* ================= start ================= */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#pv').hidden) closePrint(); else if (!$('#modal').hidden) closeModal(); }
});
(async () => {
  const r = await window.api.invoke('state');
  if (!r.ok) { $('#page').innerHTML = `<div class="empty">${esc(r.error)}</div>`; return; }
  apply(r.state);
  render();
})();
