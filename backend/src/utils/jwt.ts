import jwt from 'jsonwebtoken';

export interface JWTPayload {
  id: string;
  email: string;
  name: string;
  role: string;
  leagueId: string | null;
  scrimmageGameId?: string;
  scope?: 'SCRIMMAGE_REFEREE';
  iat?: number;
  exp?: number;
}

type TokenInput = Omit<JWTPayload, 'iat' | 'exp'>;

const secret = (): string => {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET debe definirse con al menos 16 caracteres en producción');
    }
    return 'dev-secret-no-usar-en-produccion';
  }
  return value;
};

export const generateAccessToken = (payload: TokenInput): string =>
  jwt.sign(payload, secret(), {
    expiresIn: (process.env.JWT_EXPIRATION || '8h') as any,
  });

export const generateRefreshToken = (payload: TokenInput): string =>
  jwt.sign({ ...payload, type: 'refresh' }, secret(), {
    expiresIn: (process.env.JWT_REFRESH_EXPIRATION || '7d') as any,
  });

export const verifyToken = (token: string): JWTPayload | null => {
  try {
    return jwt.verify(token, secret()) as JWTPayload;
  } catch {
    return null;
  }
};

export const generateTokens = (payload: TokenInput) => ({
  accessToken: generateAccessToken(payload),
  refreshToken: generateRefreshToken(payload),
});
