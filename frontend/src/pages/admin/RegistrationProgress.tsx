import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Season, ValidationStats } from '../../lib/types';
import { Alert, Card, Field, Stat } from '../../components/ui';
import { fechaTexto } from '../../lib/format';

const reasons: Record<string,string> = {
  PENDING: 'Pendiente de revisión administrativa', CORRECTIONS_REQUIRED: 'Requiere correcciones',
  REJECTED: 'Registro rechazado', BLOCKED: 'Jugador bloqueado',
  APPROVED: 'Revisa los documentos requeridos en su ficha',
};

export default function RegistrationProgress({ season, stats, canConfigure }: {
  season: Season; stats: ValidationStats; canConfigure: boolean;
}) {
  const [filter,setFilter] = useState('pending');
  const teams = stats.by_team;
  const active = teams.filter(t => t.status === 'ACTIVE');
  const attention = (t: typeof teams[number]) => t.total === 0 || t.managers_count === 0 || t.not_eligible > 0 || t.status !== 'ACTIVE';
  const visible = teams.filter(t => filter === 'all' || (filter === 'pending' && attention(t))
    || (filter === 'empty' && t.total === 0) || (filter === 'manager' && t.managers_count === 0)
    || (filter === 'players' && t.not_eligible > 0));
  return <section className="space-y-3">
    <h2 className="font-semibold">Inscripciones y pendientes por equipo</h2>
    <Alert tone={season.registration_open ? 'info' : 'warning'}>
      <p className="font-semibold">Altas de jugadores para managers: {season.registration_open ? 'abiertas' : 'cerradas'}</p>
      <p>{season.registration_deadline ? `Fecha de cierre: ${fechaTexto(season.registration_deadline)} (incluye ese día en Cancún).` : 'Sin fecha de cierre configurada.'}</p>
      <p>El inicio de la temporada no cierra las inscripciones. Administración puede seguir dando de alta equipos y jugadores.</p>
      {canConfigure ? <Link className="link" to="/admin/temporada">Cambiar fecha o dejar el registro abierto</Link> : <p>El Super Administrador puede modificar la fecha de cierre.</p>}
    </Alert>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat value={teams.length} label="Equipos registrados" />
      <Stat value={teams.filter(t => t.total === 0).length} label="Sin jugadores" tone="warning" />
      <Stat value={teams.filter(t => t.managers_count === 0).length} label="Sin encargado activo" tone="warning" />
      <Stat value={active.filter(t => t.total > 0 && t.not_eligible === 0).length} label="Plantillas elegibles" tone="success" />
    </div>
    <p className="text-xs text-base-content/60">El resumen considera los equipos ya dados de alta. Una plantilla elegible tiene jugadores registrados y todos son elegibles; no certifica un mínimo de jugadores ni otros requisitos de competencia.</p>
    <div className="flex flex-wrap items-end justify-between gap-2">
      <Field label="Mostrar equipos"><select className="select select-bordered" value={filter} onChange={e=>setFilter(e.target.value)}>
        <option value="pending">Con pendientes</option><option value="all">Todos</option>
        <option value="empty">Sin jugadores</option><option value="manager">Sin encargado activo</option>
        <option value="players">Con jugadores no elegibles</option>
      </select></Field>
      <Link className="btn btn-sm" to="/admin/equipos">Dar de alta o administrar equipos</Link>
    </div>
    {!visible.length && <p className="text-sm">{teams.length ? 'No hay equipos que coincidan con este filtro.' : 'Todavía no hay equipos registrados en esta temporada.'}</p>}
    {visible.map(t => <Card key={t.id} className="space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link className="font-semibold link" to={`/admin/equipos/${t.id}`}>{t.name}</Link>
        <span className="text-xs">{t.category_name} · {t.eligible}/{t.total} jugadores elegibles</span>
      </div>
      {t.status !== 'ACTIVE' && <p className="text-sm text-warning">Equipo no activo. Revisa su estado en la ficha.</p>}
      {t.total === 0 && <p className="text-sm text-warning">Falta registrar la plantilla.</p>}
      {t.managers_count === 0 && <p className="text-sm text-warning">Falta asignar un encargado con cuenta activa.</p>}
      {t.pending_players.length > 0 && <details>
        <summary className="cursor-pointer text-sm">Ver {t.not_eligible} jugador(es) pendientes de elegibilidad</summary>
        <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm">
          {t.pending_players.map(p => <li key={p.id}><span className="font-medium">{p.name}</span><p className="text-xs text-base-content/70">{p.reason || reasons[p.status] || 'Revisa el registro del jugador'}</p></li>)}
        </ul>
      </details>}
      <div className="flex flex-wrap gap-3 text-xs">
        <Link className="link" to={`/admin/equipos/${t.id}`}>Abrir registro y encargados</Link>
        <Link className="link" to={`/admin/equipos/${t.id}/roster`}>Ver plantilla</Link>
        {t.pending > 0 && <Link className="link" to="/admin/validacion">Abrir validación</Link>}
      </div>
    </Card>)}
  </section>;
}
