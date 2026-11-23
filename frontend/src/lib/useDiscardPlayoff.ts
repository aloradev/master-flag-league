import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';

export function useDiscardPlayoff() {
  const qc = useQueryClient();
  const superAdmin = useAuth(state => state.user?.role === 'SUPER_ADMIN');
  const mutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; gameId?: string; reason: string; confirmHistory: boolean }) =>
      api.post('/admin/playoffs/' + id + '/discard', body),
    onSuccess: () => Promise.all(
      ['playoffs', 'rounds', 'round', 'games', 'publico-jornada', 'publico-calendario'].map(key =>
        qc.invalidateQueries({ queryKey: [key] })
      )
    ),
  });

  function confirmDiscard(id: string, category: string, gameId?: string) {
    const target = gameId ? 'el partido de ' + category : 'la llave completa de ' + category + ' en esta temporada';
    const reason = window.prompt('Motivo para descartar ' + target)?.trim();
    if (!reason || !window.confirm('¿Confirmas que deseas descartar ' + target + '?')) return;
    const confirmHistory = superAdmin && window.confirm('Si hay resultados o estadísticas, ¿autorizas anular su efecto deportivo y conservar el historial?');
    mutation.mutate({ id, gameId, reason, confirmHistory });
  }
  return { mutation, confirmDiscard };
}
