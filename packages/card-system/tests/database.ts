import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PGlite } from '@electric-sql/pglite';

import { CardRegistry } from '../src/card-registry';

/** Embedded PostgreSQL; no socket, connection string, or production credentials. */
export async function database() {
  const db = new PGlite();
  const migration = await readFile(
    resolve(process.cwd(), 'migrations/0001_create_cards.sql'),
    'utf8'
  );
  await db.exec(migration);
  const registry = new CardRegistry({
    query: async <T>(sql: string, parameters: unknown[]) =>
      (await db.query<T>(sql, parameters)).rows,
  });
  return { db, registry, migration };
}
