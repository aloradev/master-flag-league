import { useState } from 'react';
import { downloadFile } from '../lib/calendarExport';

/** Tarjeta construida con datos públicos, sin capturar pantallas ni datos de sesión. */
export function ShareCard({ title, subtitle, lines, filename, url }: { title: string; subtitle: string; lines: string[]; filename: string; url: string }) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const pages = Array.from({length:Math.max(1,Math.ceil(lines.length/7))},(_,i)=>lines.slice(i*7,(i+1)*7));
  const generate = async (page: number) => {
    setBusy(true); setError('');
    try {
      const canvas=document.createElement('canvas'); canvas.width=1080; canvas.height=1350;
      const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('Tu navegador no permite generar la imagen.');
      ctx.fillStyle='#081320'; ctx.fillRect(0,0,1080,1350);
      ctx.fillStyle='#16dae1'; ctx.fillRect(0,0,1080,18);
      ctx.fillStyle='#ecff49'; ctx.fillRect(62,237,95,7);
      const write=(text:string,x:number,y:number,size:number,color:string,maxWidth=950)=>{
        ctx.fillStyle=color; ctx.font=`800 ${size}px Arial`;
        while(ctx.measureText(text).width>maxWidth && size>16){size--;ctx.font=`800 ${size}px Arial`;}
        ctx.fillText(text,x,y,maxWidth);
      };
      const logo=new Image(); logo.src='/logo-256.webp';
      await logo.decode(); ctx.drawImage(logo,60,50,110,110);
      write('MASTER FLAG LEAGUE',190,98,32,'#ffffff'); write('CANCÚN · FLAG FOOTBALL',190,140,20,'#16dae1');
      write(title.toUpperCase(),60,225,52,'#ffffff'); write(subtitle,60,292,28,'#b6c7dc');
      pages[page].forEach((line,i)=>{
        const top=340+i*115;
        ctx.fillStyle=i%2?'#101f32':'#16283d';ctx.fillRect(60,top,960,98);
        write(line,85,top+62,34,'#ffffff',910);
      });
      write('LA CANCHA ES TUYA.',60,1210,45,'#ecff49');
      write(url,60,1263,20,'#b6c7dc');
      write(`Datos al ${new Date().toLocaleString('es-MX',{timeZone:'America/Cancun'})} · ${page+1}/${pages.length}`,60,1310,17,'#8ea4bf');
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('No se pudo crear la imagen.')),'image/png'));
      downloadFile(blob,`${filename}-${page+1}.png`);
    } catch(e){setError(e instanceof Error?e.message:'No se pudo descargar');} finally{setBusy(false);}
  };
  return <div className="space-y-2"><div className="flex flex-wrap gap-2">{pages.map((_,i)=><button key={i} disabled={busy} onClick={()=>void generate(i)} className="btn btn-sm btn-outline">{busy?'Generando…':`Descargar tarjeta${pages.length>1?` ${i+1}/${pages.length}`:''}`}</button>)}</div><p className="text-xs text-base-content/55">Imagen PNG para compartir en redes. Refleja los datos al descargarla.</p>{error && <p role="alert" className="text-sm text-error">{error}</p>}</div>;
}
