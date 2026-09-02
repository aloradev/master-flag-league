/**
 * Copia al build los archivos que `tsc` no toca.
 *
 * tsc solo emite TypeScript: los .sql del esquema se quedarían en src/ y el
 * migrate compilado, que los busca junto a sí mismo, no los encontraría.
 *
 * Se hace en Node y no con `cp` porque el desarrollo ocurre en Windows.
 */
import { mkdir, readdir, copyFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const copyByExtension = async (from, to, extension) => {
  await mkdir(to, { recursive: true });
  const entries = await readdir(from, { withFileTypes: true });

  let copied = 0;
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(extension)) {
      await copyFile(join(from, entry.name), join(to, entry.name));
      copied += 1;
    }
  }
  return copied;
};

const total = await copyByExtension(join(root, 'src', 'db'), join(root, 'dist', 'db'), '.sql');
console.log(`  ✓ ${total} archivo(s) .sql copiados a dist/db`);
