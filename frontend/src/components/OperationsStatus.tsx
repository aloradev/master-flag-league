import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Alert, Button, Card } from './ui';

interface Operations {
  database: string; workerEnabled: boolean; emailApiConfigured: boolean; emailProvider: string; webhookConfigured: boolean;
  counts: Record<string, number>; stalled: number;
  recentFailures: { id: string; attempts: number; last_error: string; updated_at: string }[];
}
export function OperationsStatus() {
  const status = useQuery({ queryKey: ['operations'], queryFn: () => api.get<Operations>('/admin/operations'), refetchInterval: 60_000 });
  const process = useMutation({ mutationFn: () => api.post('/admin/operations/process-emails', {}), onSuccess: () => { void status.refetch(); } });
  const birthdays = useMutation({ mutationFn: () => api.post<{ queued: number }>('/admin/operations/process-birthdays', {}), onSuccess: () => { void status.refetch(); } });
  const data = status.data;
  return <Card className="space-y-3 p-4">
    <h2 className="font-semibold">Estado operativo y correos</h2>
    <p className="text-sm">Solo Super Administración. Se actualiza cada minuto mientras esta pantalla está abierta.</p>
    {status.isLoading && <p>Cargando estado…</p>}
    {status.error && <Alert tone="error">{status.error.message}</Alert>}
    {data && <>
      <p className="text-sm">Base conectada · Procesador {data.workerEnabled ? 'activo' : 'pausado'} · {data.emailProvider} {data.emailApiConfigured ? 'configurado' : 'sin configurar'}</p>
      {!data.workerEnabled && <Alert tone="warning">El procesador está pausado. Configura EMAIL_WORKER_ENABLED=true en el servidor y reinicia el backend para habilitarlo.</Alert>}
      {!data.emailApiConfigured && <Alert tone="warning">Falta configurar EMAIL_API_KEY en el servidor.</Alert>}
      {!data.webhookConfigured && <Alert tone="warning">Sin canal externo de alertas: los avisos solo aparecen en los logs del backend.</Alert>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[['PENDING', 'Pendientes'], ['PROCESSING', 'Procesando'], ['SENT', 'Aceptados por el proveedor'], ['FAILED', 'Fallidos']].map(([key, label]) => <div className="rounded-lg bg-base-200 p-3" key={key}><strong className="text-xl">{data.counts[key] || 0}</strong><p className="text-xs">{label}</p></div>)}</div>
      <p className="text-xs">Aceptado por el proveedor no confirma entrega en la bandeja del destinatario. Los conteos son acumulados.</p>
      {data.stalled > 0 && <Alert tone="warning">{data.stalled} correos llevan más de 15 minutos pendientes.</Alert>}
      {data.recentFailures.map((failure) => <p key={failure.id} className="text-xs">{failure.last_error} · {failure.attempts} intentos · {new Date(failure.updated_at).toLocaleString('es-MX')}</p>)}
      <Button loading={process.isPending} disabled={birthdays.isPending || status.isError || !data.workerEnabled || !data.emailApiConfigured} onClick={() => {
        if (window.confirm('¿Procesar todos los correos pendientes? Puede enviar correos reales de todas las ligas, no solo felicitaciones de cumpleaños.')) process.mutate();
      }}>Procesar correos pendientes</Button>
      <Button loading={birthdays.isPending} disabled={process.isPending || status.isError || !data.workerEnabled || !data.emailApiConfigured} onClick={() => {
        if (window.confirm('¿Preparar las felicitaciones de cumpleaños de hoy (fecha UTC)? Incluye jugadores con correo y sin baja de todas las ligas, aprobados o no. Los no aprobados recibirán un recordatorio sobre su registro. El worker usa una cola compartida y también puede enviar otros correos pendientes.')) birthdays.mutate();
      }}>Preparar correos de cumpleaños</Button>
      <Button tone="ghost" loading={status.isFetching} onClick={() => void status.refetch()}>Actualizar estado</Button>
      {process.isSuccess && <p className="text-sm">Procesamiento solicitado. El estado se actualizará automáticamente.</p>}
      {process.error && <Alert tone="error">{process.error.message}</Alert>}
      {birthdays.isSuccess && <p role="status" className="text-sm">Solicitud completada. Felicitaciones aceptadas para encolar: {birthdays.data.queued}. No confirma entrega ni destinatarios únicos.</p>}
      {birthdays.error && <Alert tone="error">{birthdays.error.message}</Alert>}
    </>}
  </Card>;
}
