const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = async ({browser,base,api,out}) => {
 const evidence=[];
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const capture=async name=>{await page.screenshot({path:path.join(out,'interaction-'+name+'.png'),fullPage:true,animations:'disabled'});};
 const noOverflow=async name=>{
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name);
  const clipped=await page.locator('button.btn:visible').evaluateAll(buttons=>buttons.filter(b=>b.scrollWidth>b.clientWidth+1).map(b=>b.textContent));
  assert.deepEqual(clipped,[],name+' sin etiquetas de botón recortadas');
 };
 const modalWorks=async name=>{
   const modal=page.getByRole('dialog');await modal.waitFor();
   assert.equal(await modal.evaluate(e=>e.matches(':modal')),true,name+' contiene el foco');
   for(let i=0;i<18;i++){await page.keyboard.press('Tab');assert.equal(await modal.evaluate(e=>e.contains(document.activeElement)),true,name+' Tab permanece dentro');}
   await capture(name);await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});
 };
 try {
  await page.goto(base+'/ingresar');
  await page.getByLabel('Correo electrónico').fill('admin@qa.example.invalid');
  const password=page.locator('input[autocomplete=current-password]');
  await password.fill('Cancun2026');
  await page.getByRole('button',{name:'Mostrar contraseña',exact:true}).click();
  assert.equal(await password.getAttribute('type'),'text');
  await page.getByRole('button',{name:'Ocultar contraseña',exact:true}).click();
  await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.waitForURL(base+'/admin');
  evidence.push('Acceso y mostrar/ocultar contraseña');
  for (const width of [320,1280]) {
   await page.setViewportSize({width,height:844});
   for (const [url,button,name] of [
    ['/admin/equipos','Nuevo equipo','alta-equipo'],
    ['/admin/usuarios','Nuevo usuario','alta-usuario'],
    ['/admin/ligas','Crear liga','alta-liga'],
    ['/admin/jornadas','Crear jornada manual','jornada-manual'],
   ]) {
    await page.goto(base+url,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:button,exact:true}).click();
    if(name==='jornada-manual') await page.getByRole('button',{name:'Agregar partido',exact:true}).click();
    await noOverflow(name+' '+width);await capture(name+'-'+width);
   }
  }
  evidence.push('Formularios desplegables: alta de equipo, usuario, liga y jornada manual en celular y escritorio');
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/admin/equipos/qa-home',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Editar',exact:true}).click();await modalWorks('editar-equipo-mobile');
  assert.equal(await page.getByRole('button',{name:'Editar',exact:true}).evaluate(e=>e===document.activeElement),true);
  evidence.push('Editar equipo: foco contenido, Escape y retorno al botón');
  await page.goto(base+'/equipo/jugadores/qa-player',{waitUntil:'networkidle'});
  await page.getByTitle('Ver Fotografía del jugador',{exact:true}).click();
  await modalWorks('visor-documento-mobile');
  evidence.push('Visor de documentos ficticios: imagen completa, teclado y cierre');
  await page.getByRole('button',{name:'Dar de baja',exact:true}).click();await modalWorks('baja-jugador-mobile');
  evidence.push('Baja del jugador: diálogo accesible sin ejecutar la baja');
  await page.goto(base+'/admin/partidos/qa-game/acta',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Generar enlace de llenado',exact:true}).click();
  const reportUrl=await page.getByLabel('Enlace para compartir',{exact:true}).inputValue();
  await page.goto(reportUrl,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Añadir jugador',exact:true}).click();
  await capture('acta-compartida-mobile');await noOverflow('acta compartida');
  evidence.push('Acta compartida válida: formulario y estadísticas por jugador');
  await page.goto(base+'/admin/finanzas',{waitUntil:'networkidle'});
  await page.getByRole('tab',{name:'Cargos',exact:true}).click();
  await page.getByRole('tab',{name:'Cargos',exact:true}).focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab',{name:'Gastos',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('button',{name:'Registrar gasto',exact:true}).click();await modalWorks('nuevo-gasto-mobile');
  await page.getByRole('button',{name:'Registrar gasto',exact:true}).click();
  await page.getByLabel('Concepto',{exact:true}).fill('Renta de prueba');
  await page.getByLabel('Monto',{exact:true}).fill('250');
  await page.route('**/finance/expenses',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{success:false,error:'No se pudo guardar el gasto de prueba'}}):route.fallback());
  await page.getByRole('dialog').getByRole('button',{name:'Registrar gasto',exact:true}).click();
  await page.getByRole('dialog').getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Concepto',{exact:true}).inputValue(),'Renta de prueba');
  assert.equal(await page.getByLabel('Monto',{exact:true}).inputValue(),'250');
  await capture('gasto-error-conserva-datos');await page.keyboard.press('Escape');
  await page.unroute('**/finance/expenses');
  evidence.push('Un fallo al guardar gastos conserva el formulario y muestra el error dentro');
  await page.getByRole('button',{name:'Editar montos',exact:true}).click();await modalWorks('editar-montos-mobile');
  const reset=page.getByRole('button',{name:'Reiniciar finanzas',exact:true});
  await reset.click();const submit=page.getByRole('button',{name:'Eliminar movimientos y reiniciar',exact:true});
  assert.equal(await submit.isDisabled(),true);
  await page.getByLabel('Escribe REINICIAR para confirmar').fill('reiniciar');assert.equal(await submit.isDisabled(),true);
  await page.getByLabel('Escribe REINICIAR para confirmar').fill('REINICIAR');assert.equal(await submit.isEnabled(),true);
  await capture('confirmacion-reinicio-mobile');await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  // Solo se inspecciona la confirmación; el reinicio se comprueba por API contra memoria al final.
  evidence.push('Finanzas: pestañas por teclado, gasto, montos y confirmación de reinicio');
  for(const width of [320,390,768,1280]) {
   await page.setViewportSize({width,height:844});
   for(const url of ['/admin/equipos/qa-home','/admin/equipos/qa-home/roster','/jornadas','/equipo/pagos','/admin/finanzas']) {
    await page.goto(base+url,{waitUntil:'networkidle'});await noOverflow(width+' '+url);
   }
  }
  await page.setViewportSize({width:1280,height:844});await page.goto(base+'/admin/equipos/qa-home',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Editar',exact:true}).click();await modalWorks('editar-equipo-desktop');
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  for(const width of [320,1280]) {
   await page.setViewportSize({width,height:844});
   for(const url of ['/','/tabla','/jugar','/registro','/admin/equipos/qa-home','/admin/finanzas','/equipo/pagos']) {
    await page.goto(base+url,{waitUntil:'networkidle'});await noOverflow('oscuro '+width+' '+url);await capture('dark-'+width+url.replaceAll('/','_'));
   }
  }
  evidence.push('320, 390, 768 y 1280 px; tema oscuro y movimiento reducido');
  await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/arbitro/partido/qa-game',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Iniciar partido',exact:true}).click();
  await page.getByRole('button',{name:/Touchdown/}).first().waitFor();
  await capture('arbitro-en-vivo');
  await page.getByRole('button',{name:/Touchdown/}).first().click();
  await modalWorks('arbitro-elegir-jugador');
  await page.getByRole('button',{name:'Estadísticas',exact:true}).click();
  await modalWorks('arbitro-estadisticas');
  evidence.push('Modo árbitro en vivo y diálogos de jugadas y estadísticas con partido ficticio');
  const mobile = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
  try {
   await mobile.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
   const login=await mobile.request.post(api+'/auth/login',{data:{email:'manager@qa.example.invalid',password:'Cancun2026'}});
   const token=(await login.json()).data.accessToken;
   await mobile.addInitScript(token=>localStorage.setItem('mfl.token',token),token);
   const touch=await mobile.newPage();
   for(const url of ['/equipo','/equipo/pagos','/jornadas','/jugar']) {
    await touch.goto(base+url,{waitUntil:'networkidle'});
    if(url==='/equipo/pagos') await touch.getByRole('region',{name:'Pagos registrados',exact:true}).getByRole('cell',{name:'Inscripción de prueba',exact:true}).waitFor();
    assert.equal(await touch.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'táctil '+url);
    await touch.screenshot({path:path.join(out,'touch'+url.replaceAll('/','_')+'.png'),fullPage:true});
   }
   await touch.getByLabel('Nombre',{exact:true}).tap();
   assert.ok(await touch.getByLabel('Nombre',{exact:true}).evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
   evidence.push('Emulación táctil: encargado, estado de cuenta, calendario y solicitud pública');
  } finally {await mobile.close();}
  // Prueba funcional contra la misma API local efímera, nunca una base real.
  const login=await context.request.post(api+'/auth/login',{data:{email:'finance@qa.example.invalid',password:'Cancun2026'}});
  const auth=await login.json();const headers={Authorization:'Bearer '+auth.data.accessToken};
  const resetResult=await context.request.post(api+'/finance/reset',{headers,data:{seasonId:'season_2026',confirmation:'REINICIAR'}});
  assert.equal(resetResult.status(),200,await resetResult.text());
  const counts=(await resetResult.json()).data;assert.deepEqual(counts,{fees:1,payments:1,expenses:1});
  const balance=await context.request.get(api+'/finance/balance?seasonId=season_2026',{headers});
  const b=(await balance.json()).data;assert.equal(b.income_cents,0);assert.equal(b.expected_cents,0);assert.equal(b.expenses_cents,0);
  evidence.push('Reinicio funcional: solo movimientos ficticios, balance en cero');
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'interactions.json'),JSON.stringify({passed:true,checks:evidence},null,2));
  console.log('INTERACCIONES_OK',evidence.join(' | '));
 } catch(e) {await capture('failure');throw e;} finally {await context.close();}
};
