export interface FrameReference {
  workspace_id: string;
  document_id: string;
  frame_id: string;
}

/** Dates are ISO strings at both the registry and HTTP boundaries. */
export interface CardRecord extends FrameReference {
  card_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CardRegistryClient {
  registerFrame(reference: FrameReference): Promise<CardRecord>;
  deleteFrame(reference: FrameReference): Promise<CardRecord | null>;
}

export function isFrameReference(value: unknown): value is FrameReference {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const keys = ['workspace_id', 'document_id', 'frame_id'];
  return (
    Object.keys(record).length === keys.length &&
    keys.every(key => {
      const id = record[key];
      return (
        typeof id === 'string' &&
        id.length > 0 &&
        id.length <= 1024 &&
        !id.includes('\0')
      );
    })
  );
}
