import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

const ROUNDS = 10;

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, ROUNDS);

export const comparePassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);

export const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!password || password.length < 8) {
    errors.push('Debe tener al menos 8 caracteres');
  }
  if (!/[A-Za-z]/.test(password)) {
    errors.push('Debe incluir al menos una letra');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Debe incluir al menos un número');
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Contraseña temporal legible para dictar por teléfono o WhatsApp:
 * sin caracteres ambiguos (0/O, 1/l/I).
 */
export const generateTempPassword = (): string => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';

  let out = '';
  for (let i = 0; i < 6; i += 1) out += letters[randomInt(letters.length)];
  for (let i = 0; i < 3; i += 1) out += digits[randomInt(digits.length)];
  return out;
};
