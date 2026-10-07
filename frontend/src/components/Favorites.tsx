import { useEffect, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { api } from '../lib/api';
import { observeGames, toggleFavorite, useFavorites, type Favorite, type GameSnapshot } from '../lib/favorites';
import { IconCheckCircle, IconPlus } from './icons';

export function FavoriteButton({ favorite }: { favorite: Favorite }) {
  const { favorites } = useFavorites();
  const [error, setError] = useState('');
  const selected = favorites.some(item => item.kind === favorite.kind && item.id === favorite.id);
  const label = `${selected ? 'Quitar de' : 'Guardar en'} favoritos: ${favorite.name}`;
  return <div><button type="button" className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-outline'}`} aria-label={label} title={label} aria-pressed={selected} onClick={() => setError(toggleFavorite(favorite))}>{selected ? <IconCheckCircle /> : <IconPlus />}<span>{selected ? 'Guardado' : 'Favorito'}</span></button>{error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}</div>;
}

export function FavoriteObserver() {
  const { favorites, enabled } = useFavorites();
  const favoriteKey = JSON.stringify(favorites.map(item => [item.kind, item.id]));
  const followed = enabled ? favorites.filter(item => item.kind !== 'player') : [];
  const queries = useQueries({ queries: followed.map(item => ({
    queryKey: ['favorite-watch', item.kind, item.id],
    queryFn: ({ signal }: { signal: AbortSignal }) => api.get<GameSnapshot | { games: GameSnapshot[] }>(`/public/${item.kind === 'team' ? 'teams' : 'games'}/${encodeURIComponent(item.id)}`, signal),
    retry: false, refetchInterval: 60000, staleTime: 30000,
  })) });
  const games = [...queries].sort((a, b) => a.dataUpdatedAt - b.dataUpdatedAt).flatMap(query => query.data ? 'games' in query.data ? query.data.games : [query.data] : []);
  // Normalize fields so unrelated API changes never generate an alert.
  const snapshot = JSON.stringify(Array.from(new Map(games.map(game => [game.id, {
    id: game.id, home_team_name: game.home_team_name, away_team_name: game.away_team_name, status: game.status,
    scheduled_date: game.scheduled_date, scheduled_time: game.scheduled_time, field_name: game.field_name,
    home_score: game.home_score, away_score: game.away_score,
  }])).values()));
  useEffect(() => { observeGames(JSON.parse(snapshot)); }, [snapshot, enabled, favoriteKey]);
  return null;
}
