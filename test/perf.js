'use strict';
// Screen-speed test on a large database: times page renders, searches and command round trips in the real window.
// Run: BELO_PERF=1 BELO_DATA=<folder with belo-wms.db> BELO_OUT=<out> npx electron .
const fs = require('node:fs');
const path = require('node:path');

module.exports = function perf(win, { app }) {
  const out = process.env.BELO_OUT || path.join(app.getPath('temp'), 'belo-perf');
  fs.mkdirSync(out, { recursive: true });
  // Each step gets a time limit so one frozen screen does not hide the rest; results are saved as they come.
  let res = {};
  const save = () => fs.writeFileSync(path.join(out, 'perf.json'), JSON.stringify(res, null, 2));
  const js = code => Promise.race([win.webContents.executeJavaScript(`(async()=>{${code}})()`), new Promise(r => setTimeout(() => r('TIMEOUT >20s'), 20000))]);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errors = [];
  win.webContents.on('console-message', e => { if (e.level >= 2) errors.push(e.message); });
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900);
      await wait(1500);
      // Time from a cold state request to a painted dashboard.
      res.coldStart = await js(`const t=performance.now();const r=await window.api.invoke('state');const t1=performance.now();apply(r.state);render();await new Promise(r=>requestAnimationFrame(()=>setTimeout(r)));return {ipcMs:+(t1-t).toFixed(1),renderMs:+(performance.now()-t1).toFixed(1)}`);
      const page = async (label, code) => {
        res[label] = await js(`const t=performance.now();${code};await new Promise(r=>requestAnimationFrame(()=>setTimeout(r)));return +(performance.now()-t).toFixed(1)`);
        save();
        if (res[label] === 'TIMEOUT >20s') { await wait(60000); return; }
        fs.writeFileSync(path.join(out, label.replace(/[^\w-]/g, '_') + '.png'), (await win.webContents.capturePage()).toPNG());
      };
      await page('dashboard', `go('dashboard')`);
      await page('sos', `soFilter='all';go('sos')`);
      await page('so-detail', `go('so',S.sos[10].id)`);
      await page('purchases', `go('purchases')`);
      await page('products', `go('products')`);
      await page('products-search-keystroke', `prQ='ფილტ';render()`);
      await js(`prQ='';`);
      await page('stock', `go('stock')`);
      await page('vehicles', `go('vehicles')`);
      await page('vehicle-detail', `go('vehicle',S.vehicles[0].id)`);
      await page('catalog-all', `catModel='all';go('catalog')`);
      await page('catalog-one-model', `catModel=models()[0];render()`);
      await page('suppliers', `go('suppliers')`);
      await page('reports-vehicles', `repTab='veh';go('reports')`);
      await page('reports-stock', `repTab='stock';render()`);
      await page('reports-moves', `repTab='moves';render()`);
      await page('settings', `go('settings')`);
      await page('settings-rules', `[...document.querySelectorAll('h3')].find(h=>h.textContent.includes('აღრიცხვის წესები')).scrollIntoView()`);
      res['catalogRec switch'] = await js(`await call('settings.set',{key:'catalogRec',value:false});go('so',S.sos.find(o=>o.status==='open').id);const hidden=!document.body.innerText.includes('რეკომენდაცია კატალოგიდან');await call('settings.set',{key:'catalogRec',value:true});render();return {hiddenWhenOff:hidden,shownWhenOn:document.body.innerText.includes('რეკომენდაცია კატალოგიდან')}`);
      res['global-search-keystroke'] = await js(`$('#gs').value='SN000';const t=performance.now();gSearch();return +(performance.now()-t).toFixed(1)`);
      await js(`$('#gsr').hidden=true;$('#gs').value=''`);
      // A full command round trip: IPC, database, new state, re-render.
      res['click: add service'] = await js(`const o=S.sos.find(x=>x.status==='open');go('so',o.id);const t=performance.now();await call('so.addService',{id:o.id,name:'perf',price:''});return +(performance.now()-t).toFixed(1)`);
      res['click: issue part'] = await js(`const o=S.sos.find(x=>x.status==='open');const p=S.products.find(x=>x.stock[1].q>5);const t=performance.now();await call('so.issue',{id:o.id,pid:p.id,wh:1,qty:1});return +(performance.now()-t).toFixed(1)`);
      res['click: new purchase order'] = await js(`const p=S.products[0];const t=performance.now();await call('po.create',{sup:S.suppliers[0].id,wh:1,lines:[{pid:p.id,qty:5,price:10}]});return +(performance.now()-t).toFixed(1)`);
      res['open: product modal'] = await js(`const t=performance.now();openProduct(S.products[100].id);await new Promise(r=>requestAnimationFrame(()=>setTimeout(r)));closeModal();return +(performance.now()-t).toFixed(1)`);
      res['open: purchase order form'] = await js(`const t=performance.now();openPO();await new Promise(r=>requestAnimationFrame(()=>setTimeout(r)));closeModal();return +(performance.now()-t).toFixed(1)`);
      res['export: moves CSV build'] = await js(`const orig=saveText;let len=0;saveText=(n,c)=>{len=c.length};const t=performance.now();repTab='moves';exportReport();const d=performance.now()-t;saveText=orig;return {ms:+d.toFixed(1),chars:len}`);
      const t = Date.now();
      await js(`printSO(S.sos[5].id)`);
      await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } });
      res['pdf: service order'] = Date.now() - t;
      await js(`closePrint()`);
      res.heapMB = await js(`return performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null`);
      res.consoleErrors = errors;
    } catch (e) { res.FAILED = e.stack || e.message; }
    fs.writeFileSync(path.join(out, 'perf.json'), JSON.stringify(res, null, 2));
    app.quit();
  });
};
