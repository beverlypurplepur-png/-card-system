import { PrismaClient } from '@prisma/client';

/**
 * Additive Card System v2 storage.
 *
 * The first Card System migration is deliberately left intact. Existing rows
 * are copied with the same UUIDs, and the application switches to these tables
 * only after this migration completes.
 */
export class SimplifyCardSystemDomain1790899200000 {
  static async up(db: PrismaClient) {
    const statements = [
      `CREATE TABLE IF NOT EXISTS card_system.collections (
        collection_id UUID PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ NULL
      )`,
      `CREATE INDEX IF NOT EXISTS collections_workspace_active_idx
        ON card_system.collections (workspace_id, created_at)
        WHERE deleted_at IS NULL`,
      `CREATE TABLE IF NOT EXISTS card_system.card_records (
        card_id UUID PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        card_type TEXT NOT NULL DEFAULT 'basic',
        front TEXT NULL,
        back TEXT NULL,
        affine_document_id TEXT NULL,
        affine_frame_id TEXT NULL,
        streak INTEGER NOT NULL DEFAULT 0 CHECK (streak >= 0),
        interval_days INTEGER NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
        next_review_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        states JSONB NOT NULL DEFAULT '{}'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ NULL,
        CONSTRAINT card_records_affine_frame_shape CHECK (
          affine_frame_id IS NULL OR affine_document_id IS NOT NULL
        )
      )`,
      `CREATE INDEX IF NOT EXISTS card_records_workspace_active_idx
        ON card_system.card_records (workspace_id, created_at)
        WHERE deleted_at IS NULL`,
      `CREATE INDEX IF NOT EXISTS card_records_due_idx
        ON card_system.card_records (workspace_id, next_review_at)
        WHERE deleted_at IS NULL`,
      `CREATE INDEX IF NOT EXISTS card_records_affine_reference_idx
        ON card_system.card_records
          (workspace_id, affine_document_id, COALESCE(affine_frame_id, ''))
        WHERE affine_document_id IS NOT NULL`,
      `CREATE TABLE IF NOT EXISTS card_system.card_collection_memberships (
        card_id UUID NOT NULL REFERENCES card_system.card_records(card_id) ON DELETE NO ACTION,
        collection_id UUID NOT NULL REFERENCES card_system.collections(collection_id) ON DELETE NO ACTION,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (card_id, collection_id)
      )`,
      `CREATE INDEX IF NOT EXISTS card_collection_memberships_collection_idx
        ON card_system.card_collection_memberships (collection_id, created_at)`,
      `INSERT INTO card_system.collections
         (collection_id, workspace_id, name, created_at, updated_at, deleted_at)
       SELECT deck_id, workspace_id, name, created_at, updated_at, deleted_at
       FROM card_system.decks
       ON CONFLICT (collection_id) DO NOTHING`,
      `INSERT INTO card_system.card_records
         (card_id, workspace_id, card_type, front, back,
          affine_document_id, affine_frame_id,
          streak, interval_days, next_review_at,
          created_at, updated_at, deleted_at)
       SELECT card.card_id, card.workspace_id, 'basic', content.front, content.back,
              reference.document_id,
              CASE WHEN reference.source_type = 'frame' THEN reference.block_id ELSE NULL END,
              COALESCE(review.streak, 0), COALESCE(review.interval_days, 0),
              COALESCE(review.next_review_at, card.created_at),
              card.created_at, card.updated_at, card.deleted_at
       FROM card_system.cards card
       LEFT JOIN card_system.manual_card_content content ON content.card_id = card.card_id
       LEFT JOIN card_system.affine_card_reference reference ON reference.card_id = card.card_id
       LEFT JOIN card_system.review_state review ON review.card_id = card.card_id
       ON CONFLICT (card_id) DO NOTHING`,
      `INSERT INTO card_system.card_collection_memberships (card_id, collection_id)
       SELECT card_id, deck_id FROM card_system.cards
       WHERE deck_id IS NOT NULL
       ON CONFLICT (card_id, collection_id) DO NOTHING`,
    ];

    for (const statement of statements) {
      await db.$executeRawUnsafe(statement);
    }
  }

  static async down(_db: PrismaClient) {
    // Additive production migration: old and new data are retained.
  }
}
