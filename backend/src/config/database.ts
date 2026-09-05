import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

// Neon / Supabase / Render entregan DATABASE_URL y exigen SSL.
// En local se usan las variables individuales sin SSL.
const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      // Neon apaga el cómputo por inactividad y la primera conexión
      // después paga un arranque en frío de medio segundo. Sin timeout
      // explícito, `pg` esperaría indefinidamente ante un problema de
      // red; 15 s cubre el arranque en frío con holgura y falla rápido
      // cuando de verdad no hay ruta.
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'master_flag_league',
      max: 10,
      idleTimeoutMillis: 30000,
    });

pool.on('error', (err) => {
  console.error('[db] Error inesperado en cliente idle:', err.message);
});

export const query = <T extends Record<string, any> = any>(
  text: string,
  params?: any[]
) => pool.query<T>(text, params);

export const getClient = () => pool.connect();

/** Ejecuta varias sentencias dentro de una transacción. */
export const withTransaction = async <T>(
  fn: (q: typeof query) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn((text, params) => client.query(text, params));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const healthCheck = async (): Promise<boolean> => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

export default pool;
