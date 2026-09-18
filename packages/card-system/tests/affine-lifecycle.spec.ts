// @vitest-environment happy-dom
import {
  type FrameBlockModel,
  FrameBlockSchemaExtension,
  RootBlockSchemaExtension,
} from '@blocksuite/affine-model';
import {
  BlockSchemaExtension,
  defineBlockSchema,
  type Store,
  Text,
} from '@blocksuite/store';
import { TestWorkspace } from '@blocksuite/store/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';

import { EdgelessClipboardFrameConfig } from '../../../blocksuite/affine/blocks/frame/src/edgeless-clipboard-config';
import { attachFrameAdapter } from '../src/frame-adapter';
import { database } from './database';

let local: Awaited<ReturnType<typeof database>>;
const workspace = new TestWorkspace({ id: 'affine-workspace' });
workspace.meta.initialize();
beforeAll(async () => {
  local = await database();
});
afterAll(async () => {
  await local?.db.close();
  workspace.dispose();
});

function document(id: string) {
  const doc = workspace.createDoc(id);
  const store = doc.getStore({
    extensions: [
      RootBlockSchemaExtension,
      FrameBlockSchemaExtension,
      BlockSchemaExtension(
        defineBlockSchema({
          flavour: 'affine:surface',
          props: () => ({}),
          metadata: {
            version: 1,
            role: 'hub',
            parent: ['affine:page'],
            children: ['affine:frame'],
          },
        })
      ),
    ],
  });
  store.load();
  const root = store.addBlock('affine:page');
  const surface = store.addBlock('affine:surface', {}, root);
  store.resetHistory();
  const adapter = attachFrameAdapter(store, local.registry, {
    ready: Promise.resolve(true),
    onError: error => {
      console.error(error);
    },
  });
  return { store, surface, adapter };
}

test('real AFFiNE Frame/Store/Yjs: create, edits, delete, undo, redo preserve the expected Card identity', async () => {
  const { store, surface, adapter } = document('lifecycle');
  const id = store.addBlock(
    'affine:frame',
    { title: new Text('Frame 1') },
    surface
  );
  await adapter.flush();
  const ref = {
    workspace_id: workspace.id,
    document_id: store.id,
    frame_id: id,
  };
  const original = await local.registry.registerFrame(ref);
  const frame = store.getModelById<FrameBlockModel>(id)!;
  store.updateBlock(frame, {
    xywh: '[10,20,300,400]',
    background: 'red',
    presentationIndex: 'new-order',
  });
  frame.props.title.replace(0, frame.props.title.length, 'Renamed');
  await adapter.flush();
  expect(frame.id).toBe(id);
  expect(await local.registry.registerFrame(ref)).toEqual(original);

  store.captureSync();
  store.deleteBlock(frame);
  store.captureSync();
  await adapter.flush();
  const deleted = await local.db.query<{ deleted_at: Date | null }>(
    'SELECT deleted_at FROM card_system.cards WHERE card_id = $1',
    [original.card_id]
  );
  expect(deleted.rows[0].deleted_at).not.toBeNull();
  expect(store.getModelById(id)).toBeNull();
  store.undo();
  await adapter.flush();
  expect(store.getModelById(id)?.id).toBe(id);
  expect(store.getModelById(id)).not.toBe(frame);
  const restored = await local.registry.registerFrame(ref);
  expect(restored.card_id).toBe(original.card_id);
  expect(restored.created_at).toBe(original.created_at);
  expect(restored.deleted_at).toBeNull();
  store.redo();
  await adapter.flush();
  expect(store.getModelById(id)).toBeNull();
  expect(
    (
      await local.db.query<{ deleted_at: Date | null }>(
        'SELECT deleted_at FROM card_system.cards WHERE card_id = $1',
        [original.card_id]
      )
    ).rows[0].deleted_at
  ).not.toBeNull();
  adapter.dispose();
});

test('actual Frame clipboard creation used by Duplicate/Paste assigns new IDs in same and other documents', async () => {
  const source = document('source');
  const target = document('target');
  const id = source.store.addBlock(
    'affine:frame',
    { title: new Text('Frame 1') },
    source.surface
  );
  const snapshot = source.store
    .getTransformer()
    .blockToSnapshot(source.store.getModelById(id)!)!;
  const paste = (store: Store, surface: string) => {
    // Use the real production Frame clipboard method; only the editor scope is replaced.
    const config = Object.create(
      EdgelessClipboardFrameConfig.prototype
    ) as EdgelessClipboardFrameConfig;
    Object.defineProperties(config, {
      surface: { value: { model: { id: surface } } },
      crud: { value: { addBlock: store.addBlock.bind(store) } },
    });
    return config.createBlock(snapshot, {
      oldToNewIdMap: new Map(),
      originalIndexes: new Map(),
      newPresentationIndexes: new Map([[id, 'copied-order']]),
    })!;
  };
  const duplicate = paste(source.store, source.surface);
  const crossDocument = paste(target.store, target.surface);
  await source.adapter.flush();
  await target.adapter.flush();
  expect(new Set([id, duplicate, crossDocument]).size).toBe(3);
  expect(
    source.store
      .getModelById<FrameBlockModel>(duplicate)
      ?.props.title.toString()
  ).toBe('Frame 1');
  const { rows } = await local.db.query<{ card_id: string }>(
    'SELECT card_id FROM card_system.cards WHERE document_id IN ($1, $2)',
    ['source', 'target']
  );
  expect(rows).toHaveLength(3);
  expect(new Set(rows.map(row => row.card_id)).size).toBe(3);
  source.adapter.dispose();
  target.adapter.dispose();
});

test('adapter performs no Yjs writes during backfill', async () => {
  const { store, surface, adapter } = document('no-writes');
  store.addBlock('affine:frame', {}, surface);
  await adapter.flush();
  const updated = vi.fn();
  store.doc.spaceDoc.on('update', updated);
  adapter.backfill();
  await adapter.flush();
  expect(updated).not.toHaveBeenCalled();
  store.doc.spaceDoc.off('update', updated);
  adapter.dispose();
});
