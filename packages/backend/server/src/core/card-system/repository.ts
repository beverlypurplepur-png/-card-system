import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import type {
  CardRecord,
  DeckRecord,
  LegacyImport,
  LegacyImportResult,
} from './types';

type SqlClient = PrismaClient | Prisma.TransactionClient;

type DeckRow = {
  collection_id: string;
  name: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

type CardRow = {
  card_id: string;
  card_type: string;
  collection_ids: string[];
  front: string | null;
  back: string | null;
  affine_document_id: string | null;
  affine_frame_id: string | null;
  states: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  streak: number;
  interval_days: number;
  next_review_at: Date | string;
};

const iso = (value: Date | string) => new Date(value).toISOString();
const nullableIso = (value: Date | string | null) =>
  value === null ? null : iso(value);

const deckRecord = (row: DeckRow): DeckRecord => ({
  id: row.collection_id,
  name: row.name,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  deletedAt: nullableIso(row.deleted_at),
});

const cardRecord = (row: CardRow): CardRecord => ({
  id: row.card_id,
  cardType: row.card_type,
  collectionIds: row.collection_ids,
  // Compatibility field for the unmodified BaraBara UI.
  deckId: row.collection_ids[0] ?? null,
  front: row.front ?? '',
  back: row.back ?? '',
  affineDocumentId: row.affine_document_id,
  affineFrameId: row.affine_frame_id,
  states: row.states,
  metadata: row.metadata,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  deletedAt: nullableIso(row.deleted_at),
  streak: row.streak,
  intervalDays: row.interval_days,
  nextReviewAt: iso(row.next_review_at),
});

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

const requiredText = (value: unknown, label: string, max = 100_000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new BadRequestException(`Invalid ${label}`);
  }
  return value;
};

const date = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new BadRequestException(`Invalid ${label}`);
  }
  return new Date(value);
};

const nonNegativeInteger = (value: unknown, label: string) => {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new BadRequestException(`Invalid ${label}`);
  }
  return Number(value);
};

@Injectable()
export class CardSystemRepository {
  constructor(private readonly db: PrismaClient) {}

  private query<T>(db: SqlClient, sql: string, ...values: unknown[]) {
    return db.$queryRawUnsafe<T[]>(sql, ...values);
  }

  async listDecks(workspaceId: string, includeDeleted = false) {
    return this.listDecksWith(this.db, workspaceId, includeDeleted);
  }

  async createDeck(workspaceId: string, input: { id?: string; name: unknown }) {
    const id = input.id && isUuid(input.id) ? input.id : crypto.randomUUID();
    try {
      const rows = await this.query<DeckRow>(
        this.db,
        `INSERT INTO card_system.collections (collection_id, workspace_id, name)
         VALUES ($1::uuid, $2, $3)
         RETURNING collection_id, name, created_at, updated_at, deleted_at`,
        id,
        workspaceId,
        requiredText(input.name, 'collection name', 1024).trim()
      );
      return deckRecord(rows[0]);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2010'
      ) {
        throw new ConflictException('Collection id is already in use');
      }
      throw error;
    }
  }

  async updateDeck(workspaceId: string, collectionId: string, name: unknown) {
    const rows = await this.query<DeckRow>(
      this.db,
      `UPDATE card_system.collections
       SET name = $3, updated_at = CURRENT_TIMESTAMP
       WHERE workspace_id = $1 AND collection_id = $2::uuid AND deleted_at IS NULL
       RETURNING collection_id, name, created_at, updated_at, deleted_at`,
      workspaceId,
      collectionId,
      requiredText(name, 'collection name', 1024).trim()
    );
    if (!rows[0]) throw new BadRequestException('Collection not found');
    return deckRecord(rows[0]);
  }

  async deleteDeck(workspaceId: string, collectionId: string) {
    return this.setCollectionDeleted(workspaceId, collectionId, true);
  }

  async restoreDeck(workspaceId: string, collectionId: string) {
    return this.setCollectionDeleted(workspaceId, collectionId, false);
  }

  private async setCollectionDeleted(
    workspaceId: string,
    collectionId: string,
    deleted: boolean
  ) {
    const rows = await this.query<DeckRow>(
      this.db,
      `UPDATE card_system.collections
       SET deleted_at = CASE WHEN $3 THEN COALESCE(deleted_at, CURRENT_TIMESTAMP) ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE workspace_id = $1 AND collection_id = $2::uuid
       RETURNING collection_id, name, created_at, updated_at, deleted_at`,
      workspaceId,
      collectionId,
      deleted
    );
    if (!rows[0]) throw new BadRequestException('Collection not found');
    return deckRecord(rows[0]);
  }

  async listCards(
    workspaceId: string,
    collectionId?: string,
    includeDeleted = false
  ) {
    return this.listCardsWith(
      this.db,
      workspaceId,
      collectionId,
      includeDeleted
    );
  }

  private async assertActiveCollection(
    db: SqlClient,
    workspaceId: string,
    collectionId: string
  ) {
    const rows = await this.query<{ ok: boolean }>(
      db,
      `SELECT true AS ok FROM card_system.collections
       WHERE workspace_id = $1 AND collection_id = $2::uuid AND deleted_at IS NULL`,
      workspaceId,
      collectionId
    );
    if (!rows[0]) throw new BadRequestException('Collection not found');
  }

  async createManualCard(
    workspaceId: string,
    input: {
      id?: string;
      deckId?: string | null;
      front: unknown;
      back: unknown;
      streak?: unknown;
      intervalDays?: unknown;
      nextReviewAt?: unknown;
    }
  ) {
    const id = input.id && isUuid(input.id) ? input.id : crypto.randomUUID();
    return this.db.$transaction(async tx => {
      if (input.deckId) {
        await this.assertActiveCollection(tx, workspaceId, input.deckId);
      }
      await tx.$executeRawUnsafe(
        `INSERT INTO card_system.card_records
           (card_id, workspace_id, card_type, front, back,
            streak, interval_days, next_review_at)
         VALUES ($1::uuid, $2, 'basic', $3, $4, $5, $6, $7)`,
        id,
        workspaceId,
        requiredText(input.front, 'card front'),
        requiredText(input.back, 'card back'),
        nonNegativeInteger(input.streak ?? 0, 'streak'),
        nonNegativeInteger(input.intervalDays ?? 0, 'intervalDays'),
        date(input.nextReviewAt ?? new Date().toISOString(), 'nextReviewAt')
      );
      if (input.deckId) {
        await this.addMembership(tx, id, input.deckId);
      }
      return (
        await this.listCardsWith(tx, workspaceId, undefined, true, id)
      )[0];
    });
  }

  private async listCardsWith(
    db: SqlClient,
    workspaceId: string,
    collectionId?: string,
    includeDeleted = false,
    cardId?: string
  ) {
    const rows = await this.query<CardRow>(
      db,
      `SELECT card.card_id, card.card_type, card.front, card.back,
              card.affine_document_id, card.affine_frame_id,
              card.states, card.metadata,
              card.created_at, card.updated_at, card.deleted_at,
              card.streak, card.interval_days, card.next_review_at,
              COALESCE((
                SELECT array_agg(membership.collection_id::text ORDER BY membership.created_at)
                FROM card_system.card_collection_memberships membership
                JOIN card_system.collections collection
                  ON collection.collection_id = membership.collection_id
                WHERE membership.card_id = card.card_id
                  AND collection.deleted_at IS NULL
              ), ARRAY[]::text[]) AS collection_ids
       FROM card_system.card_records card
       WHERE card.workspace_id = $1
         AND ($2::uuid IS NULL OR EXISTS (
           SELECT 1 FROM card_system.card_collection_memberships membership
           JOIN card_system.collections collection
             ON collection.collection_id = membership.collection_id
           WHERE membership.card_id = card.card_id
             AND membership.collection_id = $2::uuid
             AND collection.deleted_at IS NULL
         ))
         AND ($3::boolean OR card.deleted_at IS NULL)
         AND ($4::uuid IS NULL OR card.card_id = $4::uuid)
       ORDER BY card.created_at ASC`,
      workspaceId,
      collectionId ?? null,
      includeDeleted,
      cardId ?? null
    );
    return rows.map(cardRecord);
  }

  async updateManualCard(
    workspaceId: string,
    cardId: string,
    input: {
      deckId?: string | null;
      front: unknown;
      back: unknown;
      streak: unknown;
      intervalDays: unknown;
      nextReviewAt: unknown;
    }
  ) {
    return this.db.$transaction(async tx => {
      if (input.deckId) {
        await this.assertActiveCollection(tx, workspaceId, input.deckId);
      }
      const changed = await tx.$executeRawUnsafe(
        `UPDATE card_system.card_records
         SET front = $3, back = $4, streak = $5, interval_days = $6,
             next_review_at = $7, updated_at = CURRENT_TIMESTAMP
         WHERE workspace_id = $1 AND card_id = $2::uuid AND deleted_at IS NULL`,
        workspaceId,
        cardId,
        requiredText(input.front, 'card front'),
        requiredText(input.back, 'card back'),
        nonNegativeInteger(input.streak, 'streak'),
        nonNegativeInteger(input.intervalDays, 'intervalDays'),
        date(input.nextReviewAt, 'nextReviewAt')
      );
      if (!changed) throw new BadRequestException('Card not found');
      if (input.deckId) {
        await this.addMembership(tx, cardId, input.deckId);
      }
      return (
        await this.listCardsWith(tx, workspaceId, undefined, true, cardId)
      )[0];
    });
  }

  async updateReview(
    workspaceId: string,
    cardId: string,
    input: { streak: unknown; intervalDays: unknown; nextReviewAt: unknown }
  ) {
    const changed = await this.db.$executeRawUnsafe(
      `UPDATE card_system.card_records
       SET streak = $3, interval_days = $4, next_review_at = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE workspace_id = $1 AND card_id = $2::uuid AND deleted_at IS NULL`,
      workspaceId,
      cardId,
      nonNegativeInteger(input.streak, 'streak'),
      nonNegativeInteger(input.intervalDays, 'intervalDays'),
      date(input.nextReviewAt, 'nextReviewAt')
    );
    if (!changed) throw new BadRequestException('Card not found');
    return (
      await this.listCardsWith(this.db, workspaceId, undefined, true, cardId)
    )[0];
  }

  async setCardDeleted(workspaceId: string, cardId: string, deleted: boolean) {
    const changed = await this.db.$executeRawUnsafe(
      `UPDATE card_system.card_records
       SET deleted_at = CASE WHEN $3 THEN COALESCE(deleted_at, CURRENT_TIMESTAMP) ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE workspace_id = $1 AND card_id = $2::uuid`,
      workspaceId,
      cardId,
      deleted
    );
    if (!changed) throw new BadRequestException('Card not found');
    return (
      await this.listCardsWith(this.db, workspaceId, undefined, true, cardId)
    )[0];
  }

  private async addMembership(
    db: SqlClient,
    cardId: string,
    collectionId: string
  ) {
    await db.$executeRawUnsafe(
      `INSERT INTO card_system.card_collection_memberships (card_id, collection_id)
       VALUES ($1::uuid, $2::uuid)
       ON CONFLICT (card_id, collection_id) DO NOTHING`,
      cardId,
      collectionId
    );
  }

  async addCardToCollection(
    workspaceId: string,
    cardId: string,
    collectionId: string
  ) {
    return this.db.$transaction(async tx => {
      await this.assertActiveCollection(tx, workspaceId, collectionId);
      const cards = await this.listCardsWith(
        tx,
        workspaceId,
        undefined,
        false,
        cardId
      );
      if (!cards[0]) throw new BadRequestException('Card not found');
      await this.addMembership(tx, cardId, collectionId);
      return (
        await this.listCardsWith(tx, workspaceId, undefined, true, cardId)
      )[0];
    });
  }

  async removeCardFromCollection(
    workspaceId: string,
    cardId: string,
    collectionId: string
  ) {
    const changed = await this.db.$executeRawUnsafe(
      `DELETE FROM card_system.card_collection_memberships membership
       USING card_system.card_records card, card_system.collections collection
       WHERE membership.card_id = card.card_id
         AND membership.collection_id = collection.collection_id
         AND card.workspace_id = $1 AND collection.workspace_id = $1
         AND card.card_id = $2::uuid
         AND collection.collection_id = $3::uuid`,
      workspaceId,
      cardId,
      collectionId
    );
    if (!changed)
      throw new BadRequestException('Collection membership not found');
    return (
      await this.listCardsWith(this.db, workspaceId, undefined, true, cardId)
    )[0];
  }

  async importLegacy(
    workspaceId: string,
    input: LegacyImport
  ): Promise<LegacyImportResult> {
    if (!Array.isArray(input.decks) || !Array.isArray(input.cards)) {
      throw new BadRequestException('Invalid legacy import');
    }
    if (input.decks.length > 10_000 || input.cards.length > 100_000) {
      throw new BadRequestException('Legacy import is too large');
    }
    return this.db.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        `card-system-import:${workspaceId}`
      );
      const deckIds: Record<string, string> = {};
      const cardIds: Record<string, string> = {};

      for (const legacy of input.decks) {
        requiredText(legacy.id, 'legacy collection id', 1024);
        const mapped = await this.legacyMapping(
          tx,
          workspaceId,
          'deck',
          legacy.id
        );
        const id = mapped ?? (await this.availableId(tx, legacy.id));
        await tx.$executeRawUnsafe(
          `INSERT INTO card_system.collections
             (collection_id, workspace_id, name, created_at, updated_at)
           VALUES ($1::uuid, $2, $3, $4, $5)
           ON CONFLICT (collection_id) DO NOTHING`,
          id,
          workspaceId,
          requiredText(legacy.name, 'collection name', 1024).trim(),
          date(legacy.createdAt, 'createdAt'),
          date(legacy.updatedAt, 'updatedAt')
        );
        if (!mapped) {
          await this.saveLegacyMapping(tx, workspaceId, 'deck', legacy.id, id);
        }
        deckIds[legacy.id] = id;
      }

      for (const legacy of input.cards) {
        requiredText(legacy.id, 'legacy card id', 1024);
        const mapped = await this.legacyMapping(
          tx,
          workspaceId,
          'card',
          legacy.id
        );
        const id = mapped ?? (await this.availableId(tx, legacy.id));
        const collectionId =
          deckIds[legacy.deckId] ??
          (await this.legacyMapping(tx, workspaceId, 'deck', legacy.deckId));
        if (!collectionId) {
          throw new BadRequestException('Legacy card collection not found');
        }
        await tx.$executeRawUnsafe(
          `INSERT INTO card_system.card_records
             (card_id, workspace_id, card_type, front, back,
              streak, interval_days, next_review_at, created_at, updated_at)
           VALUES ($1::uuid, $2, 'basic', $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (card_id) DO NOTHING`,
          id,
          workspaceId,
          requiredText(legacy.front, 'card front'),
          requiredText(legacy.back, 'card back'),
          nonNegativeInteger(legacy.streak, 'streak'),
          nonNegativeInteger(legacy.intervalDays, 'intervalDays'),
          date(legacy.nextReviewAt, 'nextReviewAt'),
          date(legacy.createdAt, 'createdAt'),
          date(legacy.updatedAt, 'updatedAt')
        );
        await this.addMembership(tx, id, collectionId);
        if (!mapped) {
          await this.saveLegacyMapping(tx, workspaceId, 'card', legacy.id, id);
        }
        cardIds[legacy.id] = id;
      }

      return {
        deckIds,
        cardIds,
        decks: await this.listDecksWith(tx, workspaceId),
        cards: await this.listCardsWith(tx, workspaceId),
      };
    });
  }

  private async listDecksWith(
    db: SqlClient,
    workspaceId: string,
    includeDeleted = false
  ) {
    const rows = await this.query<DeckRow>(
      db,
      `SELECT collection_id, name, created_at, updated_at, deleted_at
       FROM card_system.collections
       WHERE workspace_id = $1 AND ($2::boolean OR deleted_at IS NULL)
       ORDER BY created_at ASC`,
      workspaceId,
      includeDeleted
    );
    return rows.map(deckRecord);
  }

  private async legacyMapping(
    db: SqlClient,
    workspaceId: string,
    type: 'deck' | 'card',
    legacyId: string
  ) {
    const rows = await this.query<{ entity_id: string }>(
      db,
      `SELECT entity_id FROM card_system.legacy_id_map
       WHERE workspace_id = $1 AND entity_type = $2 AND legacy_id = $3`,
      workspaceId,
      type,
      legacyId
    );
    return rows[0]?.entity_id;
  }

  private async saveLegacyMapping(
    db: SqlClient,
    workspaceId: string,
    type: 'deck' | 'card',
    legacyId: string,
    id: string
  ) {
    await db.$executeRawUnsafe(
      `INSERT INTO card_system.legacy_id_map
         (workspace_id, entity_type, legacy_id, entity_id)
       VALUES ($1, $2, $3, $4::uuid)
       ON CONFLICT (workspace_id, entity_type, legacy_id) DO NOTHING`,
      workspaceId,
      type,
      legacyId,
      id
    );
  }

  private async availableId(db: SqlClient, preferred: string) {
    if (!isUuid(preferred)) return crypto.randomUUID();
    const rows = await this.query<{ used: boolean }>(
      db,
      `SELECT EXISTS (
         SELECT 1 FROM card_system.collections WHERE collection_id = $1::uuid
         UNION ALL
         SELECT 1 FROM card_system.card_records WHERE card_id = $1::uuid
       ) AS used`,
      preferred
    );
    return rows[0]?.used ? crypto.randomUUID() : preferred;
  }
}
