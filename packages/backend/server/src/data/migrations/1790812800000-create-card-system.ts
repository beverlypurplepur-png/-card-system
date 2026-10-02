import { PrismaClient } from "@prisma/client";

export class CreateCardSystem1790812800000 {
  static async up(db: PrismaClient) {
    const statements = [
      `CREATE SCHEMA IF NOT EXISTS card_system`,
      `CREATE TABLE IF NOT EXISTS card_system.decks (
        deck_id UUID PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 1024),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ NULL
      )`,
      `CREATE INDEX IF NOT EXISTS decks_workspace_active_idx
        ON card_system.decks (workspace_id, updated_at DESC)
        WHERE deleted_at IS NULL`,
      `CREATE TABLE IF NOT EXISTS card_system.cards (
        card_id UUID PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        deck_id UUID NULL,
        card_kind TEXT NOT NULL CHECK (card_kind IN ('manual', 'affine_ref')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ NULL,
        CONSTRAINT cards_deck_fk FOREIGN KEY (deck_id)
          REFERENCES card_system.decks (deck_id) ON DELETE NO ACTION
      )`,
      `CREATE INDEX IF NOT EXISTS cards_workspace_deck_active_idx
        ON card_system.cards (workspace_id, deck_id, updated_at DESC)
        WHERE deleted_at IS NULL`,
      `CREATE TABLE IF NOT EXISTS card_system.manual_card_content (
        card_id UUID PRIMARY KEY,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        CONSTRAINT manual_card_content_card_fk FOREIGN KEY (card_id)
          REFERENCES card_system.cards (card_id) ON DELETE NO ACTION
      )`,
      `CREATE TABLE IF NOT EXISTS card_system.affine_card_reference (
        card_id UUID PRIMARY KEY,
        source_type TEXT NOT NULL CHECK (source_type IN ('page', 'frame')),
        document_id TEXT NOT NULL,
        block_id TEXT NULL,
        CONSTRAINT affine_card_reference_shape CHECK (
          (source_type = 'page' AND block_id IS NULL) OR
          (source_type = 'frame' AND block_id IS NOT NULL)
        ),
        CONSTRAINT affine_card_reference_card_fk FOREIGN KEY (card_id)
          REFERENCES card_system.cards (card_id) ON DELETE NO ACTION
      )`,
      `CREATE INDEX IF NOT EXISTS affine_card_reference_lookup_idx
        ON card_system.affine_card_reference
          (source_type, document_id, COALESCE(block_id, ''))`,
      `CREATE TABLE IF NOT EXISTS card_system.review_state (
        card_id UUID PRIMARY KEY,
        streak INTEGER NOT NULL DEFAULT 0 CHECK (streak >= 0),
        interval_days INTEGER NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
        next_review_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT review_state_card_fk FOREIGN KEY (card_id)
          REFERENCES card_system.cards (card_id) ON DELETE NO ACTION
      )`,
      `CREATE INDEX IF NOT EXISTS review_state_due_idx
        ON card_system.review_state (next_review_at)`,
      // Append-only review_events can be introduced in a later additive migration.
      `CREATE TABLE IF NOT EXISTS card_system.legacy_id_map (
        workspace_id TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('deck', 'card')),
        legacy_id TEXT NOT NULL,
        entity_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (workspace_id, entity_type, legacy_id),
        UNIQUE (workspace_id, entity_type, entity_id)
      )`,
    ];
    for (const statement of statements) {
      await db.$executeRawUnsafe(statement);
    }
  }

  static async down(_db: PrismaClient) {}
}
