export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface Team {
  id: string;
  name: string;
  logo_url?: string;
  color_primary: string;
  status: string;
}

export interface Player {
  id: string;
  first_name: string;
  last_name_paternal: string;
  jersey_number: number;
  position: string;
  status: string;
  elegibility_status: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
