// Revisión visual reproducible: servidores e información de prueba aislados.
const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, '.qa-artifacts/visual-review');
const base = 'http://127.0.0.1:5189';
const api = 'http://127.0.0.1:5109/api/v1';
const routes = {
 public: ['/', '/jornada', '/jornada/qa-round', '/tabla', '/estadisticas', '/equipos/qa-home', '/jugar', '/favoritos', '/jugador/qa-player', '/partido/qa-game', '/partido/qa-finished', '/registro', '/ingresar', '/recuperar', '/restablecer', '/scrimmage/incomplete', '/llenar-acta/incomplete', '/enlace-inexistente'],
 admin: ['/admin', '/admin/interesados', '/admin/equipos', '/admin/equipos/qa-home', '/admin/equipos/qa-home/roster', '/admin/validacion', '/admin/jornadas', '/admin/partidos/qa-game/acta', '/admin/usuarios', '/admin/arbitros', '/admin/scrimmages', '/admin/temporada', '/admin/auditoria', '/admin/ligas', '/admin/finanzas', '/posiciones', '/rankings', '/power-ranking', '/historial', '/playoffs', '/cambiar-contrasena'],
 sports: ['/admin', '/admin/temporada', '/admin/finanzas'],
 finance: ['/admin/finanzas'],
 manager: ['/equipo', '/equipo/nuevo', '/equipo/jugadores/nuevo', '/equipo/jugadores/qa-player', '/equipo/jugadores/qa-player/editar', '/equipo/roster', '/equipo/pagos', '/jornadas'],
 referee: ['/arbitro', '/arbitro/partido/qa-game'],
};
const children=[];
let browser;
const start=(script,args,opts={})=>{
 const child=spawn(process.execPath,[script,...args],{windowsHide:true,cwd:root,...opts,stdio:['ignore','pipe','pipe']});
 children.push(child);
 child.stdout.on('data',d=>{const t=String(d); if(t.includes('QA_READY')||t.includes('Local:')) console.log(t.trim());});
 child.stderr.on('data',d=>console.log(String(d).slice(0,1800)));
 return child;
};
const ready=async(url)=>{for(let n=0;n<60;n++){try{const r=await fetch(url);if(r.status<500)return;}catch{} await new Promise(r=>setTimeout(r,500));}throw new Error('No responde '+url);};
(async()=>{
 await fs.mkdir(out,{recursive:true});
 start(path.join(root,'backend/tests/qa-server.mjs'),[],{env:{...process.env,QA_API_PORT:'5109',QA_FRONTEND_URL:base,QA_VISUAL_FIXTURES:'1'}});
 start(path.join(root,'frontend/node_modules/vite/bin/vite.js'),['--host','127.0.0.1','--port','5189','--strictPort'],{cwd:path.join(root,'frontend'),env:{...process.env,VITE_API_URL:'http://127.0.0.1:5109',API_PROXY_TARGET:'http://127.0.0.1:5109'}});
 await Promise.all([ready(base),ready(api+'/public/standings')]);
 console.log('SERVIDORES_LISTOS');
 browser=await chromium.launch({headless:true,channel:'msedge'});
 const results=[];
 for(const [role,urls] of Object.entries(routes)) {
  if(process.env.QA_INTERACTIONS_ONLY === '1') continue;
  if(process.env.QA_ROLES && !process.env.QA_ROLES.split(',').includes(role)) continue;
  if(process.env.QA_PATHS && !urls.some(url=>process.env.QA_PATHS.split(',').includes(url))) continue;
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light'});
  // Ninguna pantalla puede conectarse a servicios externos durante esta revisión.
  await context.route('**/*', route=>{const u=new URL(route.request().url()); return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
  const page=await context.newPage();
  page.setDefaultTimeout(12000);
  const errors=[]; const failedRequests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().includes('/api/v1/')&&r.status()>=400)failedRequests.push({url:r.url(),status:r.status()});});
  if(role!=='public') {
   await page.goto(base+'/ingresar');
   await page.getByLabel('Correo electrónico').fill(role+'@qa.example.invalid');
   await page.locator('input[autocomplete=current-password]').fill('Cancun2026');
   await page.getByRole('button',{name:'Ingresar',exact:true}).click();
   await page.waitForURL(url=>!url.pathname.includes('ingresar'));
  }
  for(const width of (process.env.QA_WIDTHS || '390,1280').split(',').map(Number)) {
   await page.setViewportSize({width,height:844});
   for(const url of urls) {
    if(process.env.QA_PATHS && !process.env.QA_PATHS.split(',').includes(url)) continue;
    errors.length=0;failedRequests.length=0;
    await page.goto(base+url,{waitUntil:'networkidle'});
    const state=await page.evaluate(()=>({
     title:document.querySelector('h1')?.textContent,
     overflow:document.documentElement.scrollWidth>innerWidth+1,
     overflowElements:[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+2||r.left< -2)&&getComputedStyle(e).position!=='fixed';}).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,80)})),
     unnamed:[...document.querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!(e.tagName==='BUTTON'&&e.textContent.trim())&&!e.getAttribute('aria-label')&&!e.labels?.length&&!e.getAttribute('aria-labelledby')&&!e.getAttribute('title');}).map(e=>({tag:e.tagName,type:e.type,placeholder:e.getAttribute('placeholder'),cls:e.className})),
     text:document.body.innerText.slice(-350),
    }));
    const file=role+'-'+width+'-'+url.replaceAll('/','_')+'.png';
    await page.screenshot({path:path.join(out,file),fullPage:true,animations:'disabled'});
    await page.screenshot({path:path.join(out,'viewport-'+file),animations:'disabled'});
    results.push({role,width,url,actual:new URL(page.url()).pathname,...state,errors:[...errors],failedRequests:[...failedRequests],screenshot:file});
    const roleFile=path.join(out,'results-'+role+'.json');
    const previous=process.env.QA_PATHS ? JSON.parse(await fs.readFile(roleFile,'utf8').catch(()=>'[]')) : [];
    const current=results.filter(r=>r.role===role);
    await fs.writeFile(roleFile,JSON.stringify([...previous.filter(r=>!current.some(c=>c.width===r.width&&c.url===r.url)),...current],null,2));
    console.log('REVISADA',role,width,url,state.overflow?'DESBORDE':'',state.unnamed.length?'SIN_ETIQUETA '+state.unnamed.length:'',errors.length?'ERROR':'');
   }
  }
  await context.close();
 }
 if(process.env.QA_INTERACTIONS === '1') await require('./visual-interactions.cjs')({ browser, base, api, out });
 if(results.length) {
  const aggregate=(await Promise.all(Object.keys(routes).map(role=>fs.readFile(path.join(out,'results-'+role+'.json'),'utf8').then(JSON.parse).catch(()=>[])))).flat();
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(aggregate,null,2));
 }
 console.log(JSON.stringify({screens:results.length,overflows:results.filter(r=>r.overflow).map(r=>({url:r.url,width:r.width})),errors:results.filter(r=>r.errors.length),unnamed:results.filter(r=>r.unnamed.length).map(r=>({url:r.url,width:r.width,controls:r.unnamed}))},null,2));
 assert.deepEqual(results.filter(r=>r.overflow || r.errors.length || r.unnamed.length).map(r=>({role:r.role,width:r.width,url:r.url})), [], 'Las pantallas deben cargar sin desbordes, errores ni controles sin etiqueta');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();for(const c of children)c.kill();});
