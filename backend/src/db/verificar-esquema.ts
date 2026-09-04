import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { query } from '../config/database.js';

/**
 * COMPROBACIÓN DE ESQUEMA AL ARRANQUE.
 *
 * Existe por un fallo reportado usando la aplicación: "ya no me carga los
 * equipos". La causa fue código nuevo contra una base sin migrar —la baja
 * de jugadores agregó `players.removed_at` y las consultas de equipos
 * filtran por ella—, y el síntoma fue un "Error interno del servidor" en
 * la pantalla de equipos. Ni el arranque ni el log dijeron nada útil: el
 * desfase se descubrió abriendo la aplicación.
 *
 * Las expectativas NO se escriben a mano. Se derivan del propio
 * `migrations.sql`, así que una migración nueva queda cubierta sola y esta
 * lista no puede quedarse atrás:
 *
 *   CREATE TABLE IF NOT EXISTS <tabla>             -> la tabla debe existir
 *   ALTER TABLE <tabla> ADD COLUMN IF NOT EXISTS <col> -> la columna también
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Faltante {
  tipo: 'tabla' | 'columna';
  tabla: string;
  columna?: string;
}

/** Lee el SQL de migraciones y saca qué debería existir. */
export const esperadoSegunMigraciones = async (): Promise<{
  tablas: string[];
  columnas: Array<{ tabla: string; columna: string }>;
}> => {
  const sql = await readFile(join(__dirname, 'migrations.sql'), 'utf8');

  const tablas = [
    ...sql.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z_][a-z0-9_]*)/gi),
  ].map((m) => m[1].toLowerCase());

  const columnas = [
    ...sql.matchAll(
      /ALTER\s+TABLE\s+([a-z_][a-z0-9_]*)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+([a-z_][a-z0-9_]*)/gi
    ),
  ].map((m) => ({ tabla: m[1].toLowerCase(), columna: m[2].toLowerCase() }));

  return { tablas: [...new Set(tablas)], columnas };
};

/**
 * Devuelve lo que le falta a la base. Vacío = al día.
 *
 * Dos consultas, no una por columna: esto corre en cada arranque y el
 * plan gratuito de Neon paga un arranque en frío por conexión.
 */
export const revisarEsquema = async (): Promise<Faltante[]> => {
  const esperado = await esperadoSegunMigraciones();
  const faltantes: Faltante[] = [];

  const tablasEnBase = new Set(
    (
      await query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
      )
    ).rows.map((r) => r.table_name.toLowerCase())
  );

  for (const tabla of esperado.tablas) {
    if (!tablasEnBase.has(tabla)) faltantes.push({ tipo: 'tabla', tabla });
  }

  const columnasEnBase = new Set(
    (
      await query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public'`
      )
    ).rows.map((r) => `${r.table_name.toLowerCase()}.${r.column_name.toLowerCase()}`)
  );

  for (const { tabla, columna } of esperado.columnas) {
    // Si la tabla entera falta, ya se reportó: no se repite por columna.
    if (!tablasEnBase.has(tabla)) continue;
    if (!columnasEnBase.has(`${tabla}.${columna}`)) {
      faltantes.push({ tipo: 'columna', tabla, columna });
    }
  }

  return faltantes;
};

/** El mensaje que se lee en el log del despliegue. */
export const mensajeDeDesfase = (faltantes: Faltante[]): string => {
  const lineas = faltantes.map((f) =>
    f.tipo === 'tabla' ? `  ✗ falta la tabla "${f.tabla}"` : `  ✗ falta ${f.tabla}.${f.columna}`
  );
  return (
    '\n❌ La base de datos está atrasada respecto al código\n\n' +
    lineas.join('\n') +
    '\n\nCorre las migraciones contra esta base:\n' +
    '    npm run migrate\n\n' +
    'Sin eso, las pantallas que usan esas columnas responden\n' +
    '"Error interno del servidor" sin decir por qué.\n'
  );
};
