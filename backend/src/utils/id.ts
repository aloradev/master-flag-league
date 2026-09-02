import { randomUUID } from 'crypto';

/** Genera un identificador único para una entidad. */
export const newId = (): string => randomUUID();

/** Prefija el id para facilitar lectura en logs y depuración. */
export const newPrefixedId = (prefix: string): string =>
  `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
