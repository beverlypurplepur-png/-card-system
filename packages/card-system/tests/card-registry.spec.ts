import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

import { database } from './database';

let local: Awaited<ReturnType<typeof database>>;
const ref = {
  workspace_id: 'workspace',
  document_id: 'document',
  frame_id: 'frame',
};
beforeAll(async () => {
  local = await database();
});
afterAll(async () => {
  await local.db.close();
});
beforeEach(async () => {
  await local.db.exec('TRUNCATE card_system.cards');
});

test('atomic registration and repeated backfill keep one UUID and unchanged timestamps', async () => {
  const cards = await Promise.all(
    Array.from({ length: 20 }, () => local.registry.registerFrame(ref))
  );
  expect(new Set(cards.map(card => card.card_id)).size).toBe(1);
  expect(cards[0].card_id).toMatch(
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/
  );
  expect(await local.registry.registerFrame(ref)).toEqual(cards[0]);
  expect(
    (await local.db.query('SELECT * FROM card_system.cards')).rows
  ).toHaveLength(1);
});

test('delete only soft deletes; repeated delete is idempotent; restore preserves identity', async () => {
  const original = await local.registry.registerFrame(ref);
  const deleted = await local.registry.deleteFrame(ref);
  expect(deleted?.deleted_at).not.toBeNull();
  expect(deleted?.card_id).toBe(original.card_id);
  expect(await local.registry.deleteFrame(ref)).toEqual(deleted);
  const restored = await local.registry.registerFrame(ref);
  expect(restored.card_id).toBe(original.card_id);
  expect(restored.created_at).toBe(original.created_at);
  expect(restored.deleted_at).toBeNull();
  expect(
    (await local.db.query('SELECT * FROM card_system.cards')).rows
  ).toHaveLength(1);
});

test('all three reference components participate in identity', async () => {
  const refs = [
    ref,
    { ...ref, frame_id: 'duplicate' },
    { ...ref, document_id: 'other' },
    { ...ref, workspace_id: 'other' },
  ];
  const cards = await Promise.all(
    refs.map(reference => local.registry.registerFrame(reference))
  );
  expect(new Set(cards.map(card => card.card_id)).size).toBe(4);
  expect(
    await local.registry.deleteFrame({ ...ref, frame_id: 'unknown' })
  ).toBeNull();
});

test('schema has only the seven agreed columns; migration can be applied again', async () => {
  await local.db.exec(local.migration);
  const { rows } = await local.db.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'card_system' AND table_name = 'cards' ORDER BY ordinal_position"
  );
  expect(rows.map(row => row.column_name)).toEqual([
    'card_id',
    'workspace_id',
    'document_id',
    'frame_id',
    'created_at',
    'updated_at',
    'deleted_at',
  ]);
});

test('unique constraint includes deleted records', async () => {
  await local.registry.registerFrame(ref);
  await local.registry.deleteFrame(ref);
  await expect(
    local.db.query(
      `INSERT INTO card_system.cards VALUES ($1::uuid, $2, $3, $4, now(), now(), NULL)`,
      [crypto.randomUUID(), ref.workspace_id, ref.document_id, ref.frame_id]
    )
  ).rejects.toThrow();
});

test('references are bound parameters, not SQL; payloads cannot contain content', async () => {
  const hostile = {
    ...ref,
    frame_id: "'); DROP SCHEMA card_system CASCADE; --",
  };
  expect((await local.registry.registerFrame(hostile)).frame_id).toBe(
    hostile.frame_id
  );
  await expect(
    local.registry.registerFrame({
      ...ref,
      title: 'must not store',
    } as typeof ref)
  ).rejects.toThrow('Invalid Frame reference');
});
