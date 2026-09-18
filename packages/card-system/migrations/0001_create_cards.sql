BEGIN;

CREATE SCHEMA IF NOT EXISTS card_system;

CREATE TABLE IF NOT EXISTS card_system.cards (
  card_id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  frame_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT cards_frame_reference_unique
    UNIQUE (workspace_id, document_id, frame_id)
);

COMMIT;
