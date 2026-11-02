'use strict';
// End-to-end smoke test: drives the real window through the main flows and saves screenshots.
// Run: BELO_SMOKE=1 BELO_DATA=/tmp/x BELO_OUT=/tmp/shots npx electron .
const fs = require('node:fs');
const path = require('node:path');

module.exports = function smoke(win, { app }) {
  const out = process.env.BELO_OUT || path.join(app.getPath('temp'), 'belo-smoke');
  fs.mkdirSync(out, { recursive: true });
  const log = [];
  const note = m => { log.push(m); fs.writeFileSync(path.join(out, 'smoke.log'), log.join('\n')); };
  win.webContents.on('console-message', e => note(`console[${e.level}] ${e.message}`));
  win.webContents.on('render-process-gone', (e, d) => note('RENDERER GONE ' + d.reason));
  const js = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const shot = async name => { await wait(250); fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const check = async (label, code) => { const v = await js(code); note(`${label}: ${JSON.stringify(v)}`); return v; };

  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900);
      await wait(400);
      await shot('01-setup');
      await js(`$('#cn').value='შპს „ბელო“';$('#ct').value='405000000';$('#ca').value='თბილისი';await finishSetup();`);
      const csvP = ['არტიკული;დასახელება;ზომის ერთეული;მინ. ნაშთი;ღირებულება;რაოდენობა;ლოკაცია',
        '04152-YZZA1;ზეთის ფილტრი (Toyota);ცალი;5;28;14;A-01-01', 'OIL-5W30;ძრავის ზეთი 5W-30;ლიტრი;40;22;86;B-01-01',
        '04465-0K240;სამუხრუჭე ხუნდები, წინა;კომპლექტი;2;160;1;A-02-01', 'BAD;;ცალი;x;;;'].join('\n');
      const csvV = ['სახ. ნომერი;VIN;მარკა;მოდელი;წელი;გარბენი;განყოფილება', 'TB-482-AK;MR0HA3CD1M0512345;Toyota;Hilux;2021;86400;ლოგისტიკა',
        'AB-777-CD;WF0XXXTTGXLA12345;Ford;Transit;2020;98700;მიწოდება'].join('\n');
      await js(`openImport('products');await impParse(${JSON.stringify(csvP)},'products.csv');`);
      await shot('02-import-preview');
      await js(`await doImport();openImport('vehicles');await impParse(${JSON.stringify(csvV)},'vehicles.csv');await doImport();`);
      await check('after import', `return {products:S.products.length,vehicles:S.vehicles.length,oilStock:S.products.find(p=>p.art==='OIL-5W30').stock[1].q}`);
      await js(`go('dashboard')`); await shot('03-dashboard');
      await js(`await call('supplier.save',{name:'შპს „ოილ მარკეტი“'});openPO();po.sup=S.suppliers[0].id;po.lines=[{pid:S.products[0].id,qty:10,price:30}];await savePO();`);
      await check('after PO', `return {stock:S.products[0].stock[1].q,cost:S.products[0].cost}`);
      await js(`newSO(S.vehicles[0].id);$('#nsr').value='ნ. ბერიძე';await createSO();`);
      await js(`const o=S.sos[0];$('#sop').value=S.products[1].id;$('#soqty').value=6;await addPart(o.id);await addPart(o.id,S.products[0].id);$('#svn').value='ზეთის შეცვლა';await addSvc(o.id);`);
      await js(`const o=S.sos[0];$('#sop').value=S.products[2].id;$('#soqty').value=5;soWarn(o.id);await addPart(o.id);`);
      await check('after issue', `return {parts:S.sos[0].parts.length,svcs:S.sos[0].svcs.length,oil:S.products[1].stock[1].q,toasts:[...document.querySelectorAll('.toast')].map(t=>t.textContent)}`);
      await shot('04-service-order');
      await js(`retPart(S.sos[0].id,S.sos[0].parts[0].lid);$('#rq').value=1;await doRet(S.sos[0].id,S.sos[0].parts[0].lid);`);
      await check('after return', `return {ret:S.sos[0].parts[0].ret,oil:S.products[1].stock[1].q}`);
      await js(`printSO(S.sos[0].id)`); await wait(300);
      fs.writeFileSync(path.join(out, 'service-order.pdf'), await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } }));
      await shot('05-pdf-preview');
      await js(`closePrint();go('stock');stQ='A-01';render();`); await shot('06-stock');
      await js(`go('catalog')`); await shot('07-catalog');
      await js(`go('reports')`); await shot('08-reports');
      await js(`go('vehicle',S.vehicles[0].id)`); await shot('09-vehicle');
      const bdir = path.join(out, 'usb-backup');
      fs.mkdirSync(bdir, { recursive: true });
      require('../src/main/db').setSetting('backupDir', bdir);
      await js(`const r=await window.api.invoke('state');apply(r.state);go('settings');await runBackup();`);
      await check('backups', `const r=await window.api.invoke('backup.list');return r.result.map(b=>b.name)`);
      await shot('10-settings');
      await js(`await call('settings.set',{key:'wh2',value:true});openTransfer(S.products[1].id);$('#trq').value=10;await doTransfer();`);
      await check('after transfer', `return S.products[1].stock`);
      const file = (await js(`const r=await window.api.invoke('backup.list');return r.result[0].file`));
      await js(`await call('so.addService',{id:S.sos[0].id,name:'დროებითი'});`);
      await check('before restore svcs', `return S.sos[0].svcs.length`);
      await check('restore', `const r=await window.api.invoke('backup.restore',${JSON.stringify(file)});apply(r.state);render();return {ok:r.ok,svcs:S.sos[0].svcs.length,wh2:S.settings.wh2}`);
      note('DONE');
    } catch (e) {
      note('SMOKE FAILED ' + (e.stack || e.message));
    }
    app.quit();
  });
};
