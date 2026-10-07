import type { PartidoPublico } from '../pages/publico/Jornada';
import type { StandingRow } from './competition';

export interface MatchPlayer {
  player_id: string;
  player_name: string;
  team_id: string;
  jersey_number: number | null;
  touchdowns: number;
  receptions: number;
  interceptions: number;
  flag_pulls: number;
  passes_defended: number;
  offensive_mvp: boolean;
  defensive_mvp: boolean;
}

export interface PublicGame extends PartidoPublico {
  scheduled_date: string;
  field_location?: string | null;
  round_id?: string;
  round_number?: number;
  players?: MatchPlayer[];
}

export interface PublicTeam {
  team: {
    id: string; season_id: string; category_id: string; name: string;
    short_name: string | null; logo_url: string | null; color_primary: string | null;
    category_name: string; season_name: string;
  };
  standing: StandingRow | null;
  roster: { id: string; full_name: string; jersey_number: number | null; position: string | null; avatar_url: string | null }[];
  games: PublicGame[];
}
