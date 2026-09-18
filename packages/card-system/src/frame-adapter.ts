import type { CardRegistryClient, FrameReference } from './card';

/** Structural subset of Store: no dependency on editor UI or mutation APIs. */
export interface FrameStore {
  readonly id: string;
  readonly workspace: { readonly id: string };
  readonly slots: {
    readonly blockUpdated: {
      subscribe(
        callback: (event: {
          type: 'add' | 'update' | 'delete';
          id: string;
          flavour: string;
        }) => void
      ): { unsubscribe(): void };
    };
  };
  getBlocksByFlavour(flavour: string): { model: { id: string } }[];
}

// Preserve request order even if a Store is detached and immediately reattached.
const tails = new WeakMap<FrameStore, Promise<void>>();

export function attachFrameAdapter(
  store: FrameStore,
  registry: CardRegistryClient,
  options: { ready: Promise<boolean>; onError: (error: unknown) => void }
) {
  let disposed = false;
  let started = false;
  const buffered: { type: 'add' | 'delete'; id: string }[] = [];
  const errors: unknown[] = [];
  let tail = tails.get(store) ?? Promise.resolve();

  const reference = (id: string): FrameReference => ({
    workspace_id: store.workspace.id,
    document_id: store.id,
    frame_id: id,
  });

  const report = (error: unknown) => {
    errors.push(error);
    options.onError(error);
  };

  const enqueue = (type: 'add' | 'delete', id: string) => {
    tail = tail
      .then(async () => {
        if (type === 'add') await registry.registerFrame(reference(id));
        else await registry.deleteFrame(reference(id));
      })
      .catch(report);
    tails.set(store, tail);
  };

  const subscription = store.slots.blockUpdated.subscribe(event => {
    if (disposed || event.flavour !== 'affine:frame' || event.type === 'update')
      return;
    if (!started) buffered.push({ type: event.type, id: event.id });
    else enqueue(event.type, event.id);
  });

  const backfill = () => {
    if (disposed || !started) return;
    for (const { model } of store.getBlocksByFlavour('affine:frame'))
      enqueue('add', model.id);
  };

  const dispose = () => {
    disposed = true;
    subscription.unsubscribe();
    buffered.length = 0;
    // Already accepted operations drain; closing a document is not a deletion.
  };

  const ready = options.ready
    .then(enabled => {
      if (disposed) return;
      if (!enabled) {
        dispose();
        return;
      }
      started = true;
      for (const event of buffered) enqueue(event.type, event.id);
      buffered.length = 0;
      backfill();
    })
    .catch(error => {
      dispose();
      report(error);
    });

  return {
    dispose,
    backfill,
    async flush() {
      await ready;
      await tail;
      if (errors.length)
        throw new AggregateError(
          errors.splice(0),
          'Card System operations failed'
        );
    },
  };
}
