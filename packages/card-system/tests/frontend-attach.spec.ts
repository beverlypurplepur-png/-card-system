import { expect, test, vi } from 'vitest';

vi.mock('@toeverything/infra', () => ({
  Entity: class Entity {
    disposables: (() => void)[] = [];
  },
}));
vi.mock('../../frontend/core/src/modules/cloud/services/fetch', () => ({
  FetchService: class FetchService {},
}));
vi.mock(
  '../../frontend/core/src/modules/cloud/services/workspace-server',
  () => ({ WorkspaceServerService: class WorkspaceServerService {} })
);

import { Doc } from '../../frontend/core/src/modules/doc/entities/doc';

function open(
  options: { cloud?: boolean; readonly?: boolean; enabled?: boolean } = {}
) {
  let syncReady!: () => void;
  const request = vi.fn(
    async (path: string) =>
      new Response(
        JSON.stringify(
          path.endsWith('/status')
            ? { enabled: options.enabled ?? true }
            : { card_id: 'card' }
        ),
        { status: 200 }
      )
  );
  const unsubscribe = vi.fn();
  const store = {
    id: 'document',
    workspace: { id: 'workspace' },
    readonly: options.readonly ?? false,
    spaceDoc: { on: vi.fn(), off: vi.fn() },
    slots: { blockUpdated: { subscribe: vi.fn(() => ({ unsubscribe })) } },
    getBlocksByFlavour: vi.fn(() => [{ model: { id: 'frame' } }]),
  };
  const server =
    options.cloud === false
      ? null
      : { scope: { get: () => ({ fetch: request }) } };
  const scope = {
    props: { docId: 'document', blockSuiteDoc: store, record: {} },
    get: () => ({ server }),
  };
  const doc = new Doc(
    scope as never,
    {
      waitForDocLoadReady: () =>
        new Promise<void>(resolve => {
          syncReady = resolve;
        }),
    } as never,
    {
      workspace: {
        engine: {
          doc: { addPriority: () => vi.fn() },
          indexer: { addPriority: () => vi.fn() },
        },
      },
    } as never
  );
  return { doc, request, store, unsubscribe, syncReady: () => syncReady() };
}

test('actual Doc constructor attaches, waits for sync, backfills via the server fetch service, and disposes', async () => {
  const ctx = open();
  expect(ctx.store.slots.blockUpdated.subscribe).toHaveBeenCalledOnce();
  expect(ctx.request).not.toHaveBeenCalled();
  ctx.syncReady();
  await vi.waitFor(() => expect(ctx.request).toHaveBeenCalledTimes(2));
  expect(ctx.request.mock.calls.map(call => call[0])).toEqual([
    '/api/card-system/status',
    '/api/card-system/cards/register',
  ]);
  ctx.doc.disposables.forEach(dispose => dispose());
  expect(ctx.unsubscribe).toHaveBeenCalledOnce();
});

test('local and read-only documents do not attach or issue requests', () => {
  for (const options of [{ cloud: false }, { readonly: true }]) {
    const ctx = open(options);
    expect(ctx.store.slots.blockUpdated.subscribe).not.toHaveBeenCalled();
    expect(ctx.request).not.toHaveBeenCalled();
    ctx.doc.disposables.forEach(dispose => dispose());
  }
});

test('disabled server detaches without registration', async () => {
  const ctx = open({ enabled: false });
  ctx.syncReady();
  await vi.waitFor(() => expect(ctx.unsubscribe).toHaveBeenCalledOnce());
  expect(ctx.request).toHaveBeenCalledTimes(1);
  expect(ctx.store.getBlocksByFlavour).not.toHaveBeenCalled();
  ctx.doc.disposables.forEach(dispose => dispose());
});
