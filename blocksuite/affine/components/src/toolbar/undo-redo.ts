import { RedoIcon, UndoIcon } from '@blocksuite/icons/lit';
import type { BlockStdScope } from '@blocksuite/std';

export const undoRedoActions = [
  {
    name: 'Undo',
    icon: UndoIcon(),
    disableWhen: ({ std }: { std: BlockStdScope }) => !std.store.canUndo,
    action: ({ std }: { std: BlockStdScope }) => {
      std.store.undo();
    },
  },
  {
    name: 'Redo',
    icon: RedoIcon(),
    disableWhen: ({ std }: { std: BlockStdScope }) => !std.store.canRedo,
    action: ({ std }: { std: BlockStdScope }) => {
      std.store.redo();
    },
  },
];
