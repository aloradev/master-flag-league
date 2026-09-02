/**
 * Base de datos local para desarrollo — no requiere instalar PostgreSQL.
 *
 * PGlite es PostgreSQL compilado a WebAssembly; el servidor de socket expone
 * el protocolo real de Postgres, así que el driver `pg` de la API conecta sin
 * ningún cambio. En producción (Render) se usa PostgreSQL nativo con el mismo
 * código.
 *
 *   npm run db:dev        → escucha en 127.0.0.1:5432
 *
 * Los datos persisten en backend/.pglite (ignorado por git).
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DATA_DIR = process.env.PGLITE_DIR || './.pglite';

const main = async () => {
  console.log('\n🐘 PGlite — PostgreSQL local para desarrollo');
  console.log(`   Datos en: ${DATA_DIR}`);

  const db = await PGlite.create({ dataDir: DATA_DIR });
  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });

  await server.start();
  console.log(`   Escuchando en 127.0.0.1:${PORT}`);
  console.log('   Ctrl+C para detener\n');

  const shutdown = async () => {
    console.log('\nCerrando base de datos...');
    await server.stop();
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

main().catch((err) => {
  console.error('No se pudo iniciar PGlite:', err);
  process.exit(1);
});
