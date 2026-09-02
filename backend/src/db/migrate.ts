/**
 * Runner de migraciones.
 *   npm run migrate          -> crea tablas + datos base
 *   npm run migrate -- --admin=correo@dominio.com --password=Secreto123
 *                            -> además crea/actualiza el Super Administrador
 */
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pool, { query } from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import { newPrefixedId } from '../utils/id.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const arg = (name: string): string | undefined => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : undefined;
};

const runSqlFile = async (file: string) => {
  const sql = await readFile(join(__dirname, file), 'utf8');
  await query(sql);
  console.log(`  ✓ ${file}`);
};

const createSuperAdmin = async (email: string, password: string, name: string) => {
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  const passwordHash = await hashPassword(password);

  if (existing.rows.length > 0) {
    await query(
      `UPDATE users SET password_hash = $1, role_id = 'role_super_admin',
       active = TRUE, updated_at = NOW() WHERE email = $2`,
      [passwordHash, email]
    );
    console.log(`  ✓ Super Admin actualizado: ${email}`);
    return;
  }

  await query(
    `INSERT INTO users (id, league_id, email, password_hash, name, role_id, active)
     VALUES ($1, 'league_cancun', $2, $3, $4, 'role_super_admin', TRUE)`,
    [newPrefixedId('usr'), email, passwordHash, name]
  );
  console.log(`  ✓ Super Admin creado: ${email}`);
};

const main = async () => {
  console.log('\n🏆 Master Flag League — Migraciones\n');

  try {
    console.log('Esquema:');
    await runSqlFile('migrations.sql');

    console.log('Datos base:');
    await runSqlFile('seed.sql');

    const adminEmail = arg('admin');
    const adminPassword = arg('password');
    if (adminEmail && adminPassword) {
      console.log('Usuario administrador:');
      await createSuperAdmin(adminEmail, adminPassword, arg('name') || 'Super Administrador');
    }

    const counts = await query<{ tabla: string; total: string }>(`
      SELECT 'roles' AS tabla, COUNT(*)::text AS total FROM roles
      UNION ALL SELECT 'leagues',    COUNT(*)::text FROM leagues
      UNION ALL SELECT 'seasons',    COUNT(*)::text FROM seasons
      UNION ALL SELECT 'categories', COUNT(*)::text FROM categories
      UNION ALL SELECT 'fields',     COUNT(*)::text FROM fields
      UNION ALL SELECT 'users',      COUNT(*)::text FROM users
      UNION ALL SELECT 'teams',      COUNT(*)::text FROM teams
      UNION ALL SELECT 'players',    COUNT(*)::text FROM players
    `);

    console.log('\nEstado de la base de datos:');
    for (const row of counts.rows) {
      console.log(`  ${row.tabla.padEnd(12)} ${row.total}`);
    }
    console.log('\n✅ Migraciones completadas\n');
  } catch (err) {
    console.error('\n❌ Error en migraciones:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

main();
