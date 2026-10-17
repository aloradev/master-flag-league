import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const originalFetch = globalThis.fetch;
try {
 const React = await import('react');
 const { renderToString } = await import('react-dom/server');
 const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
 const { api } = await server.ssrLoadModule('/src/lib/api.ts');
 const { ReportAccess } = await server.ssrLoadModule('/src/pages/admin/SharedGameReport.tsx');
 for (const data of [null, { data: {}, revision: 0 }, { data: { author: 'Árbitro', homeScore: 24, awayScore: 18, notes: '', players: [] }, revision: 1 }]) {
  globalThis.fetch = async () => new Response(JSON.stringify({success:true,data}), {status:200,headers:{'Content-Type':'application/json'}});
  const qc = new QueryClient({defaultOptions:{queries:{retry:false}}});
  const result = await qc.fetchQuery({queryKey:['report','test'],queryFn:()=>api.get('/admin/games/test/report')});
  assert.deepEqual(result,data,'API must preserve an explicit null payload');
  const html = renderToString(React.createElement(QueryClientProvider,{client:qc},React.createElement(ReportAccess,{gameId:'test'})));
  assert.ok(html.includes('Compartir llenado del acta'));
  assert.ok(html.includes(data?.data.author ? 'Árbitro' : 'Todavía no se ha recibido una captura.'));
  qc.clear();
 }
 console.log('OK: empty, new and completed reports render without crashing; API preserves null.');
} finally {globalThis.fetch=originalFetch;await server.close();}

