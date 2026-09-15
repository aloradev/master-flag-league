import fs from 'node:fs/promises';
import {Workbook,FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const out='C:/Projects/Personal/master-flag-league/outputs/01a0a206-caja';
const w=await SpreadsheetFile.importXlsx(await FileBlob.load(`${out}/base.xlsx`));
const s=w.worksheets.getItemAt(0);
console.log((await w.inspect({kind:'sheet',include:'id,name',maxChars:1000})).ndjson);
s.getUsedRange().unmerge();
for(const t of [...s.tables.items])t.delete();
s.deleteAllDrawings();
s.getUsedRange().clear({applyTo:'all'});
s.getRange('A1:T400').conditionalFormats.clear();
s.showGridLines=false;
const r=a=>s.getRange(a), val=(a,v)=>r(a).values=[[v]], f=(a,v)=>r(a).formulas=[[v]];
r('A1:N315').format.font={name:'Arial',size:10,color:'#183D32'};
r('A1:N315').format.rowHeight=22;
for(const [c,width]of Object.entries({A:13,B:13,C:21,D:25,E:29,F:15,G:15,H:15,I:18,J:19,K:25,L:3,M:31,N:19}))r(`${c}:${c}`).format.columnWidth=width;
function band(a,text){r(a).format.fill='#0C3C30';r(a).format.font={name:'Arial',bold:true,color:'#FFFFFF'};val(a.split(':')[0],text);}
band('A1:K1','Control de efectivo del torneo de flag');r('A1:K1').format.rowHeight=30;
val('A2','PROTOTIPO · Importes de ejemplo en MXN. Borra A15:G19 e I15:K19 antes de usar.');
val('A3','Registra solo efectivo recibido o entregado; las transferencias no entran en esta caja.');
const metrics=[['A5','A6','FONDO INICIAL',"=$N$3"],['D5','D6','ENTRADAS', '=SUM(F15:F314)'],['G5','G6','SALIDAS','=SUM(G15:G314)'],['J5','J6','SALDO ESPERADO','=A6+D6-G6']];
for(const [label,cell,title,formula]of metrics){val(label,title);r(label).format.font={bold:true,size:10,color:'#517269'};f(cell,formula);r(cell).setNumberFormat('"$"#,##0.00');r(cell).format.font={bold:true,size:16,color:'#0C3C30'};}
val('A8','CIERRE DE CAJA');val('D8','EFECTIVO CONTADO');val('G8','DIFERENCIA');val('J8','RESULTADO');
f('D9','=IF(N4="","",N4)');f('G9','=IF(N4="","",D9-J6)');f('J9','=IF(N4="","Sin contar",IF(G9=0,"Cuadra",IF(G9<0,"Faltante","Sobrante")))');
r('D9:I9').setNumberFormat('"$"#,##0.00');r('A8:K9').format.fill='#EEF6F1';
band('A11:K11','Movimientos de caja');
val('A12','Amarillo: captura manual. Verde claro: saldo automático. Usa una sola columna de importe por movimiento.');
val('A13','Capacidad: 300 movimientos (filas 15–314). Saldo por orden de captura; el resumen incluye todas las filas, aun con filtros.');
r('A14:K14').values=[['Fecha','Jornada','Categoría','Equipo / proveedor','Concepto','Entrada','Salida','Saldo','Responsable','Folio / recibo','Observaciones']];
const rows=[
 [new Date('2026-09-14T12:00:00Z'),'Jornada 1','Inscripción','Halcones','Pago de inscripción',2500,null,null,'Ana','E-001','EJEMPLO'],
 [new Date('2026-09-14T12:00:00Z'),'Jornada 1','Inscripción','Lobos','Anticipo de inscripción',1500,null,null,'Ana','E-002','EJEMPLO'],
 [new Date('2026-09-14T12:00:00Z'),'Jornada 1','Arbitraje','Árbitros','Pago de jornada',null,800,null,'Ana','S-001','EJEMPLO'],
 [new Date('2026-09-14T12:00:00Z'),'Jornada 1','Cancha','Unidad deportiva','Renta de cancha',null,1200,null,'Ana','S-002','EJEMPLO'],
 [new Date('2026-09-14T12:00:00Z'),'Jornada 1','Venta','Público','Venta de bebidas',450,null,null,'Ana','E-003','EJEMPLO']];
r('A15:K19').values=rows;
const t=s.tables.add('A14:K314',true,'MovimientosCaja');t.showFilterButton=true;
r('A14:K14').format={fill:'#0C3C30',font:{bold:true,color:'#FFFFFF',name:'Arial'},rowHeight:32,wrapText:true};
r('A15:K314').format.fill='#FFF8DF';r('H15:H314').format.fill='#EAF4EE';
r('A15:A314').setNumberFormat('dd/mm/yyyy');r('F15:H314').setNumberFormat('"$"#,##0.00;[Red]("$"#,##0.00);"–"');
r('H15:H314').formulas=Array.from({length:300},(_,i)=>[`=IF(COUNTA(A${i+15}:G${i+15})=0,"",$N$3+SUM($F$15:F${i+15})-SUM($G$15:G${i+15}))`]);
r('C15:C314').dataValidation={rule:{type:'list',values:['Inscripción','Arbitraje','Cancha','Premiación','Venta','Patrocinio','Material','Reembolso','Aporte a caja','Depósito a banco','Otros']}};
for(const col of ['F','G'])s.dataValidations.add({range:`${col}15:${col}314`,rule:{type:'decimal',operator:'greaterThanOrEqual',formula1:0}});
r('F15:G314').conditionalFormats.addCustom('AND($F15>0,$G15>0)',{fill:'#FADBD8',font:{color:'#A12622'}});
r('G9').conditionalFormats.add('cellIs',{operator:'notEqual',formula:0,format:{font:{color:'#B42318',bold:true}}});
band('M1:N1','Configuración y cierre');
val('M2','Moneda');val('N2','MXN');val('M3','Fondo inicial');val('N3',500);val('M4','Efectivo contado');val('M5','Responsable del cierre');val('M6','Fecha del cierre');
r('N2:N6').format.fill='#FFF1B8';r('N3:N4').setNumberFormat('"$"#,##0.00');r('N6').setNumberFormat('dd/mm/yyyy');
band('M8:N8','Cómo usar');
const notes=['1. Cambia el fondo inicial por tu efectivo de apertura. No lo registres otra vez como entrada.','2. Borra los datos de ejemplo. Conserva las fórmulas de la columna H.','3. Captura una fila por cobro o pago, con importe positivo y recibo.','4. Usa Entrada O Salida. Rojo indica que llenaste ambas.','5. Al cerrar, cuenta billetes y monedas y captura el total en N4.','6. Diferencia = contado menos esperado. Negativo: faltante; positivo: sobrante.','7. Los depósitos a banco son salidas de efectivo; no son gastos del torneo.','8. El saldo de caja no representa utilidad. Esta hoja controla efectivo físico.'];
for(let i=0;i<notes.length;i++){val(`M${9+i*2}`,notes[i]);r(`M${9+i*2}:N${10+i*2}`).merge();r(`M${9+i*2}:N${10+i*2}`).format.wrapText=true;}
s.freezePanes.unfreeze();s.freezePanes.freezeRows(14);
console.log((await w.inspect({kind:'table',range:"'Sales Pipeline'!A5:K9",include:'values,formulas',tableMaxRows:5,tableMaxCols:11,maxChars:4500})).ndjson);
if(r('J6').values[0][0]!==2950)throw Error('Saldo de ejemplo incorrecto');
val('N4',2900);if(r('G9').values[0][0]!==-50)throw Error('Arqueo incorrecto');r('N4').clear({applyTo:'contents'});
console.log((await w.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!',options:{useRegex:true,maxResults:20},maxChars:2000})).ndjson);
const preview=await w.render({sheetName:s.name,range:'A1:N24',scale:1,format:'png'});await fs.writeFile(`${out}/preview.png`,new Uint8Array(await preview.arrayBuffer()));
await(await SpreadsheetFile.exportXlsx(w)).save(`${out}/Control_efectivo_flag.xlsx`);
