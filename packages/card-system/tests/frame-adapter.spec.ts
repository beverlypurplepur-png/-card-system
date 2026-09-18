import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { attachFrameAdapter, type FrameStore } from '../src/frame-adapter';
import { database } from './database';

let local: Awaited<ReturnType<typeof database>>;
beforeAll(async () => {
  local = await database();
});
afterAll(async () => {
  await local.db.close();
});
beforeEach(async () => {
  await local.db.exec('TRUNCATE card_system.cards');
});

function source() {
  type Event = {
    type: 'add' | 'delete' | 'update';
    id: string;
    flavour: string;
  };
  const listeners = new Set<(event: Event) => void>();
  const frames = new Set(['existing']);
  const store: FrameStore = {
    id: 'document',
    workspace: { id: 'workspace' },
    slots: {
      blockUpdated: {
        subscribe(callback) {
          listeners.add(callback);
          return { unsubscribe: () => listeners.delete(callback) };
        },
      },
    },
    getBlocksByFlavour: () => [...frames].map(id => ({ model: { id } })),
  };
  return {
    store,
    frames,
    emit(type: Event['type'], id: string, flavour = 'affine:frame') {
      if (flavour === 'affine:frame') {
        if (type === 'add') frames.add(id);
        if (type === 'delete') frames.delete(id);
      }
      listeners.forEach(listener => listener({ type, id, flavour }));
    },
  };
}

test('backfill, updates, delete and immediate undo are ordered and retain identity', async () => {
  const src = source();
  const adapter = attachFrameAdapter(src.store, local.registry, {
    ready: Promise.resolve(true),
    onError: vi.fn(),
  });
  await adapter.flush();
  const original = (await local.db.query('SELECT * FROM card_system.cards'))
    .rows[0];
  adapter.backfill();
  src.emit('update', 'existing');
  src.emit('add', 'note', 'affine:note');
  await adapter.flush();
  expect(
    (await local.db.query('SELECT * FROM card_system.cards')).rows
  ).toEqual([original]);
  src.emit('delete', 'existing');
  src.emit('add', 'existing');
  await adapter.flush();
  const restored = (
    await local.db.query<{ card_id: string; deleted_at: Date | null }>(
      'SELECT * FROM card_system.cards'
    )
  ).rows[0];
  expect(restored.card_id).toBe((original as { card_id: string }).card_id);
  expect(restored.deleted_at).toBeNull();
  adapter.dispose();
});

test('events during initial load are buffered; the final snapshot cannot resurrect deleted frames', async () => {
  const src = source();
  let ready!: (enabled: boolean) => void;
  const adapter = attachFrameAdapter(src.store, local.registry, {
    ready: new Promise(resolve => {
      ready = resolve;
    }),
    onError: vi.fn(),
  });
  src.emit('add', 'transient');
  src.emit('delete', 'transient');
  src.emit('add', 'survivor');
  ready(true);
  await adapter.flush();
  const { rows } = await local.db.query<{
    frame_id: string;
    deleted_at: Date | null;
  }>('SELECT * FROM card_system.cards ORDER BY frame_id');
  expect(rows.map(row => row.frame_id)).toEqual([
    'existing',
    'survivor',
    'transient',
  ]);
  expect(rows[2].deleted_at).not.toBeNull();
  adapter.dispose();
});

test('dispose does not soft delete; accepted requests drain; reattach backfill is idempotent', async () => {
  const src = source();
  const options = { ready: Promise.resolve(true), onError: vi.fn() };
  const first = attachFrameAdapter(src.store, local.registry, options);
  await first.flush();
  src.emit('delete', 'existing');
  first.dispose();
  src.emit('add', 'existing');
  const second = attachFrameAdapter(src.store, local.registry, options);
  await second.flush();
  second.dispose();
  expect(
    (
      await local.db.query(
        'SELECT * FROM card_system.cards WHERE deleted_at IS NULL'
      )
    ).rows
  ).toHaveLength(1);
});

test('disabled or disposed-before-ready adapter never writes', async () => {
  const src = source();
  const registry = { registerFrame: vi.fn(), deleteFrame: vi.fn() };
  const disabled = attachFrameAdapter(src.store, registry, {
    ready: Promise.resolve(false),
    onError: vi.fn(),
  });
  await disabled.flush();
  const disposed = attachFrameAdapter(src.store, registry, {
    ready: Promise.resolve(true),
    onError: vi.fn(),
  });
  disposed.dispose();
  await disposed.flush();
  src.emit('add', 'new');
  expect(registry.registerFrame).not.toHaveBeenCalled();
  expect(registry.deleteFrame).not.toHaveBeenCalled();
});

test('failed requests are reported, do not become unhandled rejections, and later backfill can retry', async () => {
  const src = source();
  const onError = vi.fn();
  const registerFrame = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementation(ref => local.registry.registerFrame(ref));
  const adapter = attachFrameAdapter(
    src.store,
    { registerFrame, deleteFrame: ref => local.registry.deleteFrame(ref) },
    { ready: Promise.resolve(true), onError }
  );
  await expect(adapter.flush()).rejects.toThrow(
    'Card System operations failed'
  );
  expect(onError).toHaveBeenCalledOnce();
  adapter.backfill();
  await adapter.flush();
  expect(
    (await local.db.query('SELECT * FROM card_system.cards')).rows
  ).toHaveLength(1);
  adapter.dispose();
});
