const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const BASE = 'http://127.0.0.1:5176';
const API = 'http://127.0.0.1:5099/api/v1';
const OUT = path.resolve(__dirname, '../../.qa-artifacts');
const routes = {
 admin:['/admin','/admin/equipos','/admin/validacion','/admin/jornadas','/admin/usuarios','/admin/arbitros','/admin/scrimmages','/admin/temporada','/admin/auditoria','/posiciones','/rankings','/power-ranking','/historial','/playoffs'],
 sports:['/admin','/admin/equipos','/admin/temporada'],
 finance:['/admin/finanzas'],
 manager:['/equipo','/equipo/jugadores/nuevo','/equipo/roster','/equipo/pagos','/jornadas'],
 referee:['/arbitro'],
 public:['/jornada','/tabla','/ingresar','/recuperar','/scrimmage/incomplete'],
};
(async()=>{
 await fs.mkdir(OUT,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const results=[];
 for(const [role, urls] of Object.entries(routes)) {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(role!=='public') {
   await page.goto(`${BASE}/ingresar`);
   await page.getByLabel('Correo electrónico').fill(`${role}@qa.example.invalid`);
   await page.getByLabel('Contraseña').fill('Cancun2026');
   await page.getByRole('button',{name:'Ingresar',exact:true}).click();
   await page.waitForURL(url=>!url.pathname.includes('ingresar'));
  }
  for(const width of [390,1280]) {
   await page.setViewportSize({width,height:900});
   for(const url of urls) {
    await page.goto(`${BASE}${url}`,{waitUntil:'networkidle'});
    const state=await page.evaluate(()=>({title:document.querySelector('h1')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth+1, text:document.body.innerText.slice(-250)}));
    const file=`${role}-${width}-${url.replaceAll('/','_')}.png`;
    await page.screenshot({path:path.join(OUT,file),fullPage:true});
    results.push({role,width,url,actual:new URL(page.url()).pathname,...state,errors:[...errors],screenshot:file});
    errors.length=0;
   }
  }
  await context.close();
  console.log(`CHECKED ${role}`);
 }
 // Flujo de prueba sin cuenta: crear, abrir, anotar, deshacer, cerrar y consultar públicamente.
 const login=await fetch(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@qa.example.invalid',password:'Cancun2026'})}).then(r=>r.json());
 const creation=await fetch(`${API}/admin/scrimmages`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${login.data.accessToken}`},body:JSON.stringify({seasonId:'season_2026',categoryId:'cat_mixto_2026',homeTeamName:'Prueba Halcones',awayTeamName:'Prueba Jaguares',date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Cancun'}).format(new Date()),time:'19:00'})}).then(r=>r.json());
 assert.equal(creation.success,true,JSON.stringify(creation));
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 await page.goto(creation.data.accessUrl,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Iniciar partido',exact:true}).click();
 await page.getByRole('button',{name:/Touchdown/}).first().click();
 await page.getByText('Última jugada: Touchdown',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Estadísticas',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('dialog').count(),0);
 await page.screenshot({path:path.join(OUT,'referee-live-mobile.png'),fullPage:true});
 await page.getByRole('button',{name:'Finalizar partido',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar y cerrar',exact:true}).click();
 await page.getByText('Partido cerrado',{exact:true}).waitFor();
 assert.ok(!page.url().includes('/ingresar'));
 assert.equal(await page.evaluate(()=>localStorage.getItem('mfl.token')),null);
 await page.goto(`${BASE}/partido/${creation.data.gameId}`,{waitUntil:'networkidle'});
 await page.getByText('6 - 0',{exact:true}).waitFor();
 await page.screenshot({path:path.join(OUT,'public-game-mobile.png'),fullPage:true});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto(`${BASE}/jornada`,{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Scrimmages · Hoy y en vivo'}).waitFor();
 await page.screenshot({path:path.join(OUT,'public-round-mobile.png'),fullPage:true});
 await fs.writeFile(path.join(OUT,'browser-results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({screens:results.length,errors:results.filter(r=>r.errors.length),overflows:results.filter(r=>r.overflow),scrimmageFlow:'passed'},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
