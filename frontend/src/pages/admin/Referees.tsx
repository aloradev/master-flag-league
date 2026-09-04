import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { competition } from '../../lib/competition';
import type { Season } from '../../lib/types';
import { Alert, Button, Card, Field, Spinner } from '../../components/ui';

export default function AdminReferees() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [certified, setCertified] = useState(false);
  const season = useQuery({ queryKey: ['season-active'], queryFn: () => api.get<Season>('/seasons/active') });
  const refs = useQuery({ queryKey: ['referees', season.data?.id], queryFn: () => competition.referees(season.data!.id), enabled: Boolean(season.data) });
  const users = useQuery({ queryKey: ['users', 'referee-active'], queryFn: () => api.get<{ id: string; name: string; phone: string | null }[]>('/admin/users?role=REFEREE&active=true') });
  const create = useMutation({
    mutationFn: () => {
      const user = users.data?.find((u) => u.id === userId);
      if (!user || !season.data) throw new Error('Selecciona un usuario árbitro.');
      return competition.createReferee({ seasonId: season.data.id, userId, name: user.name, phone: user.phone, badgeNumber: badgeNumber.trim() || undefined, certified });
    },
    onSuccess: () => {
      setUserId(''); setBadgeNumber(''); setCertified(false);
      void qc.invalidateQueries({ queryKey: ['referees'] });
    },
  });
  if (season.isLoading || refs.isLoading || users.isLoading) return <Spinner />;
  const error = season.error || refs.error || users.error;
  if (error) return <Alert tone="error">{error.message}</Alert>;
  const available = (users.data ?? []).filter((u) => !refs.data?.some((r) => r.user_id === u.id));
  return <div className="mx-auto max-w-2xl space-y-4">
    <header><h1 className="text-xl font-bold">Árbitros</h1><p>{season.data?.name}</p></header>
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">Vincular árbitro a esta temporada</h2>
      <p className="text-sm">Primero crea su cuenta con rol Árbitro en <Link className="link" to="/admin/usuarios">Usuarios</Link>. Después vincúlala aquí para asignarle partidos.</p>
      <Field label="Usuario árbitro"><select className="select select-bordered w-full" value={userId} onChange={(e) => { setUserId(e.target.value); create.reset(); }}>
        <option value="">Selecciona un usuario</option>{available.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select></Field>
      {!available.length && <p className="text-sm">No hay cuentas activas pendientes de vincular.</p>}
      <Field label="Número de acreditación (opcional)"><input className="input input-bordered w-full" value={badgeNumber} onChange={(e) => setBadgeNumber(e.target.value)} /></Field>
      <label className="flex items-center gap-2"><input type="checkbox" className="checkbox checkbox-sm" checked={certified} onChange={(e) => setCertified(e.target.checked)} />Certificado</label>
      {create.error && <Alert tone="error">{create.error.message}</Alert>}
      {create.isSuccess && <Alert tone="success">Árbitro vinculado a la temporada.</Alert>}
      <Button tone="primary" disabled={!userId} loading={create.isPending} onClick={() => create.mutate()}>Vincular árbitro</Button>
    </Card>
    <h2 className="font-semibold">Árbitros registrados ({refs.data?.length ?? 0})</h2>
    {refs.data?.map((r) => <Card key={r.id} className="p-3"><p className="font-semibold">{r.name}</p><p className="text-sm">{r.games_assigned} partidos asignados · {r.status === 'ACTIVE' ? 'Activo' : r.status}{r.certified ? ' · Certificado' : ''}</p>{!r.user_id && <p className="text-sm text-warning">Sin cuenta vinculada: no puede acceder al modo árbitro.</p>}</Card>)}
    <Link className="btn btn-outline" to="/admin/jornadas">Asignar partidos en Jornadas</Link>
  </div>;
}
