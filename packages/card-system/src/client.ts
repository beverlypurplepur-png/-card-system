import type { CardRecord, CardRegistryClient, FrameReference } from './card';

export type CardFetch = (path: string, init?: RequestInit) => Promise<Response>;

/** Uses AFFiNE's server-scoped FetchService, including its version headers. */
export function createCardClient(
  request: CardFetch
): CardRegistryClient & { isEnabled(): Promise<boolean> } {
  const call = async (
    operation: 'register' | 'delete',
    reference: FrameReference
  ) => {
    const response = await request(`/api/card-system/cards/${operation}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: reference.workspace_id,
        document_id: reference.document_id,
        frame_id: reference.frame_id,
      }),
    });
    if (!response.ok)
      throw new Error(`Card System ${operation} failed (${response.status})`);
    return response.json() as Promise<CardRecord | null>;
  };
  return {
    async isEnabled() {
      const response = await request('/api/card-system/status', {
        credentials: 'include',
      });
      if (response.status === 404) return false;
      if (!response.ok)
        throw new Error(`Card System status failed (${response.status})`);
      const status: unknown = await response.json();
      return (
        !!status &&
        typeof status === 'object' &&
        'enabled' in status &&
        status.enabled === true
      );
    },
    async registerFrame(reference) {
      const card = await call('register', reference);
      if (!card) throw new Error('Card registration returned no record');
      return card;
    },
    deleteFrame: reference => call('delete', reference),
  };
}
