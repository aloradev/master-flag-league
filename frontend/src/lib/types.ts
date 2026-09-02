export type Role =
  | 'SUPER_ADMIN'
  | 'SPORTS_ADMIN'
  | 'FINANCE_ADMIN'
  | 'TEAM_MANAGER'
  | 'REFEREE'
  | 'PUBLIC_USER';

export type PlayerStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CORRECTIONS_REQUIRED'
  | 'BLOCKED';

export type DocumentType = 'PHOTO' | 'ID_FRONT' | 'ID_BACK';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  leagueId: string | null;
  mustChangePassword: boolean;
  permissions?: Record<string, string[]>;
}

export interface TeamSummary {
  id: string;
  name: string;
  short_name?: string;
  logo_url?: string | null;
  color_primary: string;
  category_name: string;
  season_name: string;
  players_total: string | number;
  players_eligible: string | number;
  players_pending: string | number;
  managers: { id: string; name: string; email: string }[];
  status: string;
}

export interface RegistrationSummary {
  total: number;
  eligible: number;
  pending: number;
  corrections: number;
  rejected: number;
}

export interface RosterPlayer {
  id: string;
  first_name: string;
  last_name_paternal: string;
  last_name_maternal?: string | null;
  jersey_number: number | null;
  position: string | null;
  /** Endpoint autenticado del original privado. */
  photo_url: string | null;
  /** Derivado público de 512 px, cacheable. Es el que se muestra. */
  avatar_url: string | null;
  status: PlayerStatus;
  is_eligible: boolean;
  eligibility_reason: string | null;
}

export interface TeamDetail extends TeamSummary {
  registration_deadline: string | null;
  require_approval_to_play: boolean;
  roster: RosterPlayer[];
  registration_summary: RegistrationSummary;
}

export interface PlayerDocument {
  id: string;
  document_type: DocumentType;
  file_url: string;
  mime_type: string;
  file_size: number;
  version: number;
  status: string;
  review_notes: string | null;
  uploaded_at: string;
}

export interface DocumentChecklistItem {
  type: DocumentType;
  label: string;
  uploaded: boolean;
  document: PlayerDocument | null;
}

export interface Eligibility {
  isEligible: boolean;
  reason: string | null;
  status: string;
  missingDocuments: DocumentType[];
  presentDocuments: DocumentType[];
}

export interface ApprovalEntry {
  action: string;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  created_at: string;
  reviewed_by: string | null;
}

export interface PlayerDetail extends RosterPlayer {
  full_name: string;
  date_of_birth: string;
  phone: string | null;
  email: string | null;
  team_id: string;
  team_name: string;
  category_name: string;
  documents: PlayerDocument[];
  documents_checklist: DocumentChecklistItem[];
  eligibility: Eligibility;
  approval_history: ApprovalEntry[];
  can_edit: boolean;
}

export interface Season {
  id: string;
  name: string;
  year: number;
  start_date: string;
  end_date: string | null;
  registration_deadline: string | null;
  registration_open: boolean;
  require_approval_to_play: boolean;
  default_start_time: string;
  categories: { id: string; name: string; slug: string; color: string }[];
  fields: { id: string; name: string }[];
}

export interface QueuePlayer {
  id: string;
  full_name: string;
  first_name: string;
  last_name_paternal: string;
  jersey_number: number | null;
  position: string | null;
  /** Endpoint autenticado del original privado. */
  photo_url: string | null;
  /** Derivado público de 512 px, cacheable. Es el que se muestra. */
  avatar_url: string | null;
  status: PlayerStatus;
  team_id: string;
  team_name: string;
  team_color: string;
  category_name: string;
  created_at: string;
  last_reason: string | null;
  documents: { id: string; type: DocumentType; version: number; url: string; mime_type: string }[];
  missing_documents: { type: DocumentType; label: string }[];
  ready_to_review: boolean;
}

export interface ValidationQueue {
  total: number;
  ready_to_review: number;
  awaiting_documents: number;
  players: QueuePlayer[];
}

export interface ValidationStats {
  total: number;
  pending: number;
  approved: number;
  corrections: number;
  rejected: number;
  blocked: number;
  eligible: number;
  by_team: { id: string; name: string; color_primary: string; total: number; eligible: number; pending: number }[];
}
