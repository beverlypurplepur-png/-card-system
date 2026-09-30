import { createBlockStdScope } from '@affine/core/blocksuite/manager/view';
import type { FrameReference } from '@affine/core/modules/collection';
import { WorkspaceService } from '@affine/core/modules/workspace';
import type { FrameBlockModel } from '@blocksuite/affine/model';
import { useService } from '@toeverything/infra';
import { useEffect, useMemo, useRef } from 'react';

const FrameCollectionCard = ({ reference }: { reference: FrameReference }) => {
  const workspace = useService(WorkspaceService).workspace;
  const elementRef = useRef<HTMLElement>(null);
  const frame = useMemo(() => {
    const store = workspace.docCollection
      .getDoc(reference.documentId)
      ?.getStore({ readonly: true });
    return store?.getBlock(reference.frameId)?.model as FrameBlockModel | undefined;
  }, [reference.documentId, reference.frameId, workspace]);
  const std = useMemo(() => {
    const store = frame?.store;
    return store ? createBlockStdScope(store) : null;
  }, [frame]);

  useEffect(() => {
    if (!elementRef.current || !frame || !std) return;
    Object.assign(elementRef.current, {
      frame,
      std,
      cardIndex: 0,
      frameIndex: frame.props.presentationIndex ?? frame.props.index,
      status: 'none',
    });
  }, [frame, std]);

  if (!frame || !std) return null;
  return <affine-frame-card ref={elementRef} />;
};

export const CollectionFrameCards = ({ frames }: { frames: FrameReference[] }) => {
  if (!frames.length) return null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(284px, 1fr))',
        gap: 24,
        padding: '24px',
      }}
    >
      {frames.map(frame => (
        <FrameCollectionCard
          key={`${frame.documentId}:${frame.frameId}`}
          reference={frame}
        />
      ))}
    </div>
  );
};
