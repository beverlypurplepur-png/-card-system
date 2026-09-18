import {
  type CardRecord,
  type CardRegistryClient,
  type FrameReference,
  isFrameReference,
} from './card';

export interface CardSql {
  query<T>(sql: string, parameters: unknown[]): Promise<T[]>;
}

type Row = Omit<CardRecord, 'created_at' | 'updated_at' | 'deleted_at'> & {
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

const normalize = (row: Row): CardRecord => ({
  ...row,
  created_at: new Date(row.created_at).toISOString(),
  updated_at: new Date(row.updated_at).toISOString(),
  deleted_at:
    row.deleted_at === null ? null : new Date(row.deleted_at).toISOString(),
});

/** Server only. No AFFiNE models or Yjs data enter this registry. */
export class CardRegistry implements CardRegistryClient {
  constructor(private readonly sql: CardSql) {}

  async registerFrame(reference: FrameReference): Promise<CardRecord> {
    if (!isFrameReference(reference))
      throw new TypeError('Invalid Frame reference');
    const rows = await this.sql.query<Row>(
      `INSERT INTO card_system.cards AS cards
        (card_id, workspace_id, document_id, frame_id, created_at, updated_at, deleted_at)
       VALUES ($1::uuid, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
       ON CONFLICT (workspace_id, document_id, frame_id) DO UPDATE SET
         updated_at = CASE WHEN cards.deleted_at IS NULL THEN cards.updated_at ELSE CURRENT_TIMESTAMP END,
         deleted_at = NULL
       RETURNING *`,
      [
        crypto.randomUUID(),
        reference.workspace_id,
        reference.document_id,
        reference.frame_id,
      ]
    );
    if (!rows[0]) throw new Error('Card registration returned no record');
    return normalize(rows[0]);
  }

  async deleteFrame(reference: FrameReference): Promise<CardRecord | null> {
    if (!isFrameReference(reference))
      throw new TypeError('Invalid Frame reference');
    const rows = await this.sql.query<Row>(
      `UPDATE card_system.cards SET
         updated_at = CASE WHEN deleted_at IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END,
         deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP)
       WHERE workspace_id = $1 AND document_id = $2 AND frame_id = $3
       RETURNING *`,
      [reference.workspace_id, reference.document_id, reference.frame_id]
    );
    return rows[0] ? normalize(rows[0]) : null;
  }
}
