import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { Season } from '../../lib/types';
import { Alert, Button, Card, Field, Spinner } from '../../components/ui';
import { useAuth } from '../../store/auth';
import { fechaTexto } from '../../lib/format';
import { OperationsStatus } from '../../components/OperationsStatus';
import FieldTimes from './FieldTimes';
import { Link } from 'react-router-dom';

interface DocumentSettings {
  required: string[];
  allowed_mime: string[];
  max_size_mb: number;
}

const DOC_TYPES = [
  { value: 'PHOTO', label: 'Fotografía del jugador' },
  { value: 'ID_FRONT', label: 'Identificación — frente' },
  { value: 'ID_BACK', label: 'Identificación — reverso' },
];

const MIME_TYPES = [
  { value: 'image/jpeg', label: 'JPG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'application/pdf', label: 'PDF' },
];

const PALETTE = ['#2563eb', '#db2777', '#7c3aed', '#0d9488', '#ea580c', '#65a30d'];

export default function SeasonConfig() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const season = useQuery({
    queryKey: ['season-active'],
    queryFn: () => api.get<Season>('/seasons/active'),
    retry: false,
  });

  const seasonId = season.data?.id;

  const settings = useQuery({
    queryKey: ['season-settings', seasonId],
    queryFn: () => api.get<Record<string, unknown>>(`/seasons/${seasonId}/settings`),
    enabled: Boolean(seasonId),
  });

  const [dates, setDates] = useState({ startDate: '', endDate: '', registrationDeadline: '', defaultStartTime: '' });
  const [requireApproval, setRequireApproval] = useState(true);
  const [docs, setDocs] = useState<DocumentSettings | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [newField, setNewField] = useState('');
  const [plannedRounds, setPlannedRounds] = useState(10);
  const [playoffCount, setPlayoffCount] = useState(4);
  useEffect(() => {
    const competition = settings.data?.competition as { rounds_planned?: number; playoff_count?: number } | undefined;
    setPlayoffCount(competition?.playoff_count ?? 4);
    if (competition?.rounds_planned) setPlannedRounds(competition.rounds_planned);
  }, [settings.data]);
  const saveCalendar = useMutation({
    mutationFn: () => api.put(`/admin/seasons/${seasonId}/settings/competition`, {
      value: { ...(settings.data?.competition as Record<string, unknown> ?? {}), rounds_planned: plannedRounds, playoff_count: playoffCount },
    }),
    onSuccess: () => { setMessage({ tone: 'success', text: 'Calendario actualizado' }); refresh(); },
    onError: (err) => fail(err, 'No se pudo actualizar el calendario'),
  });

  // Los formularios arrancan con lo que ya está guardado.
  useEffect(() => {
    if (season.data) {
      setDates({
        startDate: season.data.start_date.slice(0, 10),
        endDate: season.data.end_date?.slice(0, 10) ?? '',
        registrationDeadline: season.data.registration_deadline?.slice(0, 10) ?? '',
        defaultStartTime: season.data.default_start_time?.slice(0, 5) ?? '19:00',
      });
      setRequireApproval(season.data.require_approval_to_play);
    }
  }, [season.data]);

  useEffect(() => {
    const stored = settings.data?.documents as DocumentSettings | undefined;
    if (stored) setDocs(stored);
  }, [settings.data]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['season-active'] });
    void queryClient.invalidateQueries({ queryKey: ['season-settings'] });
    void queryClient.invalidateQueries({ queryKey: ['validation-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['players'] });
  };

  const fail = (err: unknown, fallback: string) =>
    setMessage({ tone: 'error', text: err instanceof ApiError ? err.message : fallback });

  const saveSeason = useMutation({
    mutationFn: () =>
      api.put(`/admin/seasons/${seasonId}`, {
        endDate: dates.endDate || null,
        startDate: dates.startDate,
        registrationDeadline: dates.registrationDeadline || null,
        defaultStartTime: dates.defaultStartTime || undefined,
        requireApprovalToPlay: requireApproval,
      }),
    onSuccess: () => {
      setMessage({ tone: 'success', text: 'Temporada actualizada' });
      refresh();
    },
    onError: (err) => fail(err, 'No se pudo guardar la temporada'),
  });

  const saveDocs = useMutation({
    mutationFn: () =>
      api.put<{ recalculated?: { evaluated: number; changed: number } }>(
        `/admin/seasons/${seasonId}/settings/documents`,
        { value: docs }
      ),
    onSuccess: (data) => {
      const recalculated = (data as any)?.recalculated;
      setMessage({
        tone: 'success',
        text: recalculated
          ? `Configuración guardada. Se reevaluaron ${recalculated.evaluated} jugadores y cambió la elegibilidad de ${recalculated.changed}.`
          : 'Configuración guardada',
      });
      refresh();
    },
    onError: (err) => fail(err, 'No se pudo guardar la configuración'),
  });

  const addCategory = useMutation({
    mutationFn: () =>
      api.post(`/admin/seasons/${seasonId}/categories`, {
        name: newCategory.trim(),
        color: PALETTE[(season.data?.categories.length ?? 0) % PALETTE.length],
        sortOrder: (season.data?.categories.length ?? 0) + 1,
      }),
    onSuccess: () => {
      setNewCategory('');
      setMessage({ tone: 'success', text: 'Categoría agregada' });
      refresh();
    },
    onError: (err) => fail(err, 'No se pudo agregar la categoría'),
  });

  const addField = useMutation({
    mutationFn: () => api.post(`/admin/seasons/${seasonId}/fields`, { name: newField.trim() }),
    onSuccess: () => {
      setNewField('');
      setMessage({ tone: 'success', text: 'Campo agregado' });
      refresh();
    },
    onError: (err) => fail(err, 'No se pudo agregar el campo'),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => api.del(`/admin/categories/${id}`),
    onSuccess: () => { setMessage({ tone: 'success', text: 'Categoría eliminada' }); refresh(); },
    onError: (err) => fail(err, 'No se pudo eliminar la categoría'),
  });

  if (season.isLoading) return <Spinner />;
  if (!season.data) {
    return <Alert tone="warning">No hay una temporada activa.</Alert>;
  }

  const data = season.data;

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Temporada y categorías · {data.name}</h1>
        <p className="text-sm text-base-content/60">
          Inicia el{' '}
          {fechaTexto(data.start_date, { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        {isSuperAdmin && <Link className="link mt-2 inline-block text-sm" to="/admin/ligas">Cambiar nombre o administrar ligas →</Link>}
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {isSuperAdmin && <OperationsStatus />}

      {/* Fechas y reglas */}
      <FieldTimes season={data} disabled={!isSuperAdmin} />
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Fechas y reglas</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Inicio de temporada" hint="Actualiza la proyección; no cambia las fechas de partidos ya programados.">
            <input type="date" className="input input-bordered w-full" value={dates.startDate} onChange={e => setDates({ ...dates, startDate: e.target.value })} />
          </Field>
          <Field label="Cierre de registro (opcional)" hint="Vacío mantiene abiertas las altas de jugadores para managers, aunque la temporada haya iniciado. El cierre incluye todo ese día en Cancún; administración conserva sus permisos de alta.">
            <input
              type="date"
              className="input input-bordered w-full"
              value={dates.registrationDeadline}
              onChange={(e) => setDates({ ...dates, registrationDeadline: e.target.value })}
            />
          </Field>

          <Field label="Límite de temporada (opcional)" hint="Solo si existe una fecha máxima obligatoria; el cierre estimado se calcula abajo.">
            <input
              type="date"
              className="input input-bordered w-full"
              value={dates.endDate}
              onChange={(e) => setDates({ ...dates, endDate: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Jornadas de fase regular" hint="Una jornada semanal. No incluye playoffs; una reprogramación posterior actualiza la estimación.">
          <input type="number" min={1} max={104} className="input w-full" value={plannedRounds}
            onChange={(e) => setPlannedRounds(Number(e.target.value))} disabled={!isSuperAdmin} />
        </Field>
        <Field label="Clasificados a playoffs por categoría" hint="Con 3: el primer lugar pasa a la final; segundo y tercero juegan la semifinal. No modifica playoffs ya creados.">
          <select className="select w-full" value={playoffCount} disabled={!isSuperAdmin} onChange={e => setPlayoffCount(Number(e.target.value))}>
            {[3,4,6,8,10,12].map(n => <option key={n} value={n}>{n} equipos</option>)}
          </select>
        </Field>
        <p className="text-sm">Fin estimado de fase regular: {data.estimated_regular_end_date
          ? fechaTexto(data.estimated_regular_end_date) : 'Configura las jornadas previstas'}</p>
        <p className="text-sm">Final estimada con playoffs: {data.calendar_estimate?.final_date
          ? fechaTexto(data.calendar_estimate.final_date) : 'Disponible al definir los playoffs de las categorías'}</p>
        {data.calendar_estimate?.categories.map((c) => <p key={c.category} className="text-sm">
          {c.category}: {c.phases} fases · {c.final_date ? fechaTexto(c.final_date) : 'Sin fecha estimada'}
        </p>)}
        <p className="text-xs text-base-content/60">{data.calendar_estimate?.assumption}</p>
        <Button size="sm" onClick={() => saveCalendar.mutate()} loading={saveCalendar.isPending}
          disabled={!isSuperAdmin || !settings.data || !Number.isInteger(plannedRounds) || plannedRounds < 1 || plannedRounds > 104}>
          Guardar calendario
        </Button>

        <Field label="Horario base de jornada" hint="Los horarios pueden variar por jornada">
          <input
            type="time"
            className="input input-bordered w-full sm:w-40"
            value={dates.defaultStartTime}
            onChange={(e) => setDates({ ...dates, defaultStartTime: e.target.value })}
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-3 rounded-field bg-base-300/40 p-3">
          <input
            type="checkbox"
            className="checkbox checkbox-primary mt-0.5"
            checked={requireApproval}
            onChange={(e) => setRequireApproval(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium">Exigir aprobación para jugar</span>
            <span className="mt-0.5 block text-xs text-base-content/60">
              Solo los jugadores aprobados aparecen como elegibles en la pantalla del
              árbitro. Desactivarlo permite que juegue cualquier jugador registrado.
            </span>
          </span>
        </label>

        <Button
          tone="primary"
          size="sm"
          onClick={() => saveSeason.mutate()}
          loading={saveSeason.isPending}
          disabled={!isSuperAdmin}
          className="w-full sm:w-auto"
        >
          {saveSeason.isPending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        {!isSuperAdmin && (
          <p className="text-xs text-base-content/50">
            Solo un Super Administrador puede modificar la temporada.
          </p>
        )}
      </Card>

      {/* Categorías */}
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Categorías</h2>

        <ul className="space-y-1.5">
          {data.categories.map((category) => (
            <li key={category.id} className="flex items-center gap-2 text-sm">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">{category.name}</span>
              <Button size="xs" tone="error" outline loading={deleteCategory.isPending}
                onClick={() => { if (window.confirm(`¿Eliminar la categoría ${category.name}? Solo se puede eliminar si está vacía.`)) deleteCategory.mutate(category.id); }}>
                Eliminar
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <input
            className="input input-bordered input-sm flex-1"
            placeholder="Nombre de la categoría"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <Button
            size="sm"
            onClick={() => addCategory.mutate()}
            loading={addCategory.isPending}
            disabled={!newCategory.trim()}
          >
            Agregar
          </Button>
        </div>
      </Card>

      {/* Campos */}
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Campos</h2>

        <ul className="space-y-1.5 text-sm">
          {data.fields.map((field) => (
            <li key={field.id}>{field.name}</li>
          ))}
        </ul>

        <div className="flex gap-2">
          <input
            className="input input-bordered input-sm flex-1"
            placeholder="Campo 3"
            value={newField}
            onChange={(e) => setNewField(e.target.value)}
          />
          <Button
            size="sm"
            onClick={() => addField.mutate()}
            loading={addField.isPending}
            disabled={!newField.trim()}
          >
            Agregar
          </Button>
        </div>
      </Card>

      {/* Documentos requeridos */}
      {docs && (
        <Card className="space-y-3 p-4">
          <div>
            <h2 className="font-semibold">Documentación requerida</h2>
            <p className="text-xs text-base-content/60">
              Cambiar esto reevalúa la elegibilidad de todos los jugadores de la temporada.
            </p>
          </div>

          <Field label="Documentos obligatorios">
            <div className="space-y-1.5">
              {DOC_TYPES.map((type) => (
                <label key={type.value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={docs.required.includes(type.value)}
                    onChange={() =>
                      setDocs({ ...docs, required: toggle(docs.required, type.value) })
                    }
                  />
                  {type.label}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Formatos permitidos">
            <div className="flex flex-wrap gap-3">
              {MIME_TYPES.map((mime) => (
                <label key={mime.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={docs.allowed_mime.includes(mime.value)}
                    onChange={() =>
                      setDocs({ ...docs, allowed_mime: toggle(docs.allowed_mime, mime.value) })
                    }
                  />
                  {mime.label}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Tamaño máximo por archivo (MB)">
            <input
              type="number"
              min={1}
              max={25}
              className="input input-bordered input-sm w-24 tabular"
              value={docs.max_size_mb}
              onChange={(e) => setDocs({ ...docs, max_size_mb: Number(e.target.value) })}
            />
          </Field>

          <Button
            tone="primary"
            size="sm"
            onClick={() => saveDocs.mutate()}
            loading={saveDocs.isPending}
            disabled={
              !isSuperAdmin || docs.required.length === 0 || docs.allowed_mime.length === 0
            }
            className="w-full sm:w-auto"
          >
            {saveDocs.isPending ? 'Reevaluando…' : 'Guardar y reevaluar'}
          </Button>
        </Card>
      )}
    </div>
  );
}
