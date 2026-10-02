import { FetchService } from '@affine/core/modules/cloud';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useService } from '@toeverything/infra';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { BaraBaraApp } from './app';
import { AffineCardDataStore } from './data/affineCardDataStore';
import { baraBaraStyles } from './styles';

const CardSystemPage = () => {
  const workspace = useService(WorkspaceService).workspace;
  const workspaceId = workspace.id;
  const request = useService(FetchService).fetch;
  const hostRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const dataStore = useMemo(
    () => new AffineCardDataStore(request, workspaceId),
    [request, workspaceId]
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = baraBaraStyles;
    shadow.append(style);
    setRoot(shadow);
    return () => {
      setRoot(null);
      style.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      style={{ display: 'block', height: '100%', overflow: 'auto' }}
    >
      {root ? createPortal(<BaraBaraApp dataStore={dataStore} />, root) : null}
    </div>
  );
};

export const Component = CardSystemPage;
