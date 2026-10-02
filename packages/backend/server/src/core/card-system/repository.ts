import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

import type {
  DeckRecord,
  LegacyImport,
  LegacyImportResult,
  ManualCardRecord,
} from "./types";

type SqlClient = PrismaClient | Prisma.TransactionClient;

type DeckRow = {
  deck_id: string;
  name: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

type CardRow = {
  card_id: string;
  deck_id: string | null;
  front: string;
  back: string;
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
  id: row.deck_id,
  name: row.name,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  deletedAt: nullableIso(row.deleted_at),
});

const cardRecord = (row: CardRow): ManualCardRecord => ({
  id: row.card_id,
  deckId: row.deck_id,
  kind: "manual",
  front: row.front,
  back: row.back,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  deletedAt: nullableIso(row.deleted_at),
  streak: row.streak,
  intervalDays: row.interval_days,
  nextReviewAt: iso(row.next_review_at),
});

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const requiredText = (value: unknown, label: string, max = 100_000) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new BadRequestException(`Invalid ${label}`);
  }
  return value;
};

const date = (value: unknown, label: string) => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
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
    const rows = await this.query<DeckRow>(
      this.db,
      `SELECT deck_id, name, created_at, updated_at, deleted_at
       FROM card_system.decks
       WHERE workspace_id = $1 AND ($2::boolean OR deleted_at IS NULL)
       ORDER BY created_at ASC`,
      workspaceId,
      includeDeleted,
    );
    return rows.map(deckRecord);
  }

  async createDeck(workspaceId: string, input: { id?: string; name: unknown }) {
    const id = input.id && isUuid(input.id) ? input.id : crypto.randomUUID();
    const name = requiredText(input.name, "deck name", 1024).trim();
    try {
      const rows = await this.query<DeckRow>(
        this.db,
        `INSERT INTO card_system.decks (deck_id, workspace_id, name)
         VALUES ($1::uuid, $2, $3)
         RETURNING deck_id, name, created_at, updated_at, deleted_at`,
        id,
        workspaceId,
        name,
      );
      return deckRecord(rows[0]);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2010"
      ) {
        throw new ConflictException("Deck id is already in use");
      }
      throw error;
    }
  }

  async updateDeck(workspaceId: string, deckId: string, name: unknown) {
    const rows = await this.query<DeckRow>(
      this.db,
      `UPDATE card_system.decks
       SET name = $3, updated_at = CURRENT_TIMESTAMP
       WHERE workspace_id = $1 AND deck_id = $2::uuid AND deleted_at IS NULL
       RETURNING deck_id, name, created_at, updated_at, deleted_at`,
      workspaceId,
      deckId,
      requiredText(name, "deck name", 1024).trim(),
    );
    if (!rows[0]) throw new BadRequestException("Deck not found");
    return deckRecord(rows[0]);
  }

  async deleteDeck(workspaceId: string, deckId: string) {
    const rows = await this.query<DeckRow>(
      this.db,
      `UPDATE card_system.decks
         SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP),
             updated_at = CASE WHEN deleted_at IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END
         WHERE workspace_id = $1 AND deck_id = $2::uuid
         RETURNING deck_id, name, created_at, updated_at, deleted_at`,
      workspaceId,
      deckId,
    );
    if (!rows[0]) throw new BadRequestException("Deck not found");
    return deckRecord(rows[0]);
  }

  async restoreDeck(workspaceId: string, deckId: string) {
    const rows = await this.query<DeckRow>(
      this.db,
      `UPDATE card_system.decks
         SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE workspace_id = $1 AND deck_id = $2::uuid
         RETURNING deck_id, name, created_at, updated_at, deleted_at`,
      workspaceId,
      deckId,
    );
    if (!rows[0]) throw new BadRequestException("Deck not found");
    return deckRecord(rows[0]);
  }

  async listCards(
    workspaceId: string,
    deckId?: string,
    includeDeleted = false,
  ) {
    const rows = await this.query<CardRow>(
      this.db,
      `SELECT c.card_id, c.deck_id, content.front, content.back,
              c.created_at, c.updated_at, c.deleted_at,
              review.streak, review.interval_days, review.next_review_at
       FROM card_system.cards c
       JOIN card_system.decks deck ON deck.deck_id = c.deck_id
       JOIN card_system.manual_card_content content ON content.card_id = c.card_id
       JOIN card_system.review_state review ON review.card_id = c.card_id
       WHERE c.workspace_id = $1
         AND ($2::uuid IS NULL OR c.deck_id = $2::uuid)
         AND ($3::boolean OR c.deleted_at IS NULL)
         AND ($3::boolean OR deck.deleted_at IS NULL)
       ORDER BY c.created_at ASC`,
      workspaceId,
      deckId ?? null,
      includeDeleted,
    );
    return rows.map(cardRecord);
  }

  private async assertActiveDeck(
    db: SqlClient,
    workspaceId: string,
    deckId: string,
  ) {
    const rows = await this.query<{ ok: boolean }>(
      db,
      `SELECT true AS ok FROM card_system.decks
       WHERE workspace_id = $1 AND deck_id = $2::uuid AND deleted_at IS NULL`,
      workspaceId,
      deckId,
    );
    if (!rows[0]) throw new BadRequestException("Deck not found");
  }

  async createManualCard(
    workspaceId: string,
    input: {
      id?: string;
      deckId: string;
      front: unknown;
      back: unknown;
      streak?: unknown;
      intervalDays?: unknown;
      nextReviewAt?: unknown;
    },
  ) {
    const id = input.id && isUuid(input.id) ? input.id : crypto.randomUUID();
    const front = requiredText(input.front, "card front");
    const back = requiredText(input.back, "card back");
    const streak = nonNegativeInteger(input.streak ?? 0, "streak");
    const intervalDays = nonNegativeInteger(
      input.intervalDays ?? 0,
      "intervalDays",
    );
    const nextReviewAt = date(
      input.nextReviewAt ?? new Date().toISOString(),
      "nextReviewAt",
    );
    return this.db.$transaction(async (tx) => {
      await this.assertActiveDeck(tx, workspaceId, input.deckId);
      await tx.$executeRawUnsafe(
        `INSERT INTO card_system.cards
           (card_id, workspace_id, deck_id, card_kind)
         VALUES ($1::uuid, $2, $3::uuid, 'manual')`,
        id,
        workspaceId,
        input.deckId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO card_system.manual_card_content (card_id, front, back)
         VALUES ($1::uuid, $2, $3)`,
        id,
        front,
        back,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO card_system.review_state
           (card_id, streak, interval_days, next_review_at)
         VALUES ($1::uuid, $2, $3, $4)`,
        id,
        streak,
        intervalDays,
        nextReviewAt,
      );
      return (
        await this.listCardsWith(tx, workspaceId, undefined, true, id)
      )[0];
    });
  }

  private async listCardsWith(
    db: SqlClient,
    workspaceId: string,
    deckId?: string,
    includeDeleted = false,
    cardId?: string,
  ) {
    const rows = await this.query<CardRow>(
      db,
      `SELECT c.card_id, c.deck_id, content.front, content.back,
              c.created_at, c.updated_at, c.deleted_at,
              review.streak, review.interval_days, review.next_review_at
       FROM card_system.cards c
       JOIN card_system.decks deck ON deck.deck_id = c.deck_id
       JOIN card_system.manual_card_content content ON content.card_id = c.card_id
       JOIN card_system.review_state review ON review.card_id = c.card_id
       WHERE c.workspace_id = $1
         AND ($2::uuid IS NULL OR c.deck_id = $2::uuid)
         AND ($3::boolean OR c.deleted_at IS NULL)
         AND ($3::boolean OR deck.deleted_at IS NULL)
         AND ($4::uuid IS NULL OR c.card_id = $4::uuid)
       ORDER BY c.created_at ASC`,
      workspaceId,
      deckId ?? null,
      includeDeleted,
      cardId ?? null,
    );
    return rows.map(cardRecord);
  }

  async updateManualCard(
    workspaceId: string,
    cardId: string,
    input: {
      deckId: string;
      front: unknown;
      back: unknown;
      streak: unknown;
      intervalDays: unknown;
      nextReviewAt: unknown;
    },
  ) {
    return this.db.$transaction(async (tx) => {
      await this.assertActiveDeck(tx, workspaceId, input.deckId);
      const changed = await tx.$executeRawUnsafe(
        `UPDATE card_system.cards
         SET deck_id = $3::uuid, updated_at = CURRENT_TIMESTAMP
         WHERE workspace_id = $1 AND card_id = $2::uuid
           AND card_kind = 'manual' AND deleted_at IS NULL`,
        workspaceId,
        cardId,
        input.deckId,
      );
      if (!changed) throw new BadRequestException("Card not found");
      await tx.$executeRawUnsafe(
        `UPDATE card_system.manual_card_content SET front = $2, back = $3
         WHERE card_id = $1::uuid`,
        cardId,
        requiredText(input.front, "card front"),
        requiredText(input.back, "card back"),
      );
      await tx.$executeRawUnsafe(
        `UPDATE card_system.review_state
         SET streak = $2, interval_days = $3, next_review_at = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE card_id = $1::uuid`,
        cardId,
        nonNegativeInteger(input.streak, "streak"),
        nonNegativeInteger(input.intervalDays, "intervalDays"),
        date(input.nextReviewAt, "nextReviewAt"),
      );
      return (
        await this.listCardsWith(tx, workspaceId, undefined, true, cardId)
      )[0];
    });
  }

  async updateReview(
    workspaceId: string,
    cardId: string,
    input: { streak: unknown; intervalDays: unknown; nextReviewAt: unknown },
  ) {
    return this.db.$transaction(async (tx) => {
      const changed = await tx.$executeRawUnsafe(
        `UPDATE card_system.review_state review
         SET streak = $3, interval_days = $4, next_review_at = $5,
             updated_at = CURRENT_TIMESTAMP
         FROM card_system.cards card
         WHERE review.card_id = card.card_id
           AND card.workspace_id = $1 AND card.card_id = $2::uuid
           AND card.deleted_at IS NULL`,
        workspaceId,
        cardId,
        nonNegativeInteger(input.streak, "streak"),
        nonNegativeInteger(input.intervalDays, "intervalDays"),
        date(input.nextReviewAt, "nextReviewAt"),
      );
      if (!changed) throw new BadRequestException("Card not found");
      await tx.$executeRawUnsafe(
        `UPDATE card_system.cards SET updated_at = CURRENT_TIMESTAMP
         WHERE workspace_id = $1 AND card_id = $2::uuid`,
        workspaceId,
        cardId,
      );
      return (
        await this.listCardsWith(tx, workspaceId, undefined, true, cardId)
      )[0];
    });
  }

  async setCardDeleted(workspaceId: string, cardId: string, deleted: boolean) {
    const rows = await this.query<{ card_id: string }>(
      this.db,
      `UPDATE card_system.cards
       SET deleted_at = CASE WHEN $3 THEN COALESCE(deleted_at, CURRENT_TIMESTAMP) ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE workspace_id = $1 AND card_id = $2::uuid
       RETURNING card_id`,
      workspaceId,
      cardId,
      deleted,
    );
    if (!rows[0]) throw new BadRequestException("Card not found");
    return (
      await this.listCardsWith(this.db, workspaceId, undefined, true, cardId)
    )[0];
  }

  async importLegacy(
    workspaceId: string,
    input: LegacyImport,
  ): Promise<LegacyImportResult> {
    if (!Array.isArray(input.decks) || !Array.isArray(input.cards)) {
      throw new BadRequestException("Invalid legacy import");
    }
    if (input.decks.length > 10_000 || input.cards.length > 100_000) {
      throw new BadRequestException("Legacy import is too large");
    }
    return this.db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        `card-system-import:${workspaceId}`,
      );
      const deckIds: Record<string, string> = {};
      const cardIds: Record<string, string> = {};

      for (const legacy of input.decks) {
        requiredText(legacy.id, "legacy deck id", 1024);
        const existing = await this.legacyMapping(
          tx,
          workspaceId,
          "deck",
          legacy.id,
        );
        if (existing) {
          deckIds[legacy.id] = existing;
          continue;
        }
        const id = await this.availableId(tx, legacy.id);
        await tx.$executeRawUnsafe(
          `INSERT INTO card_system.decks
             (deck_id, workspace_id, name, created_at, updated_at)
           VALUES ($1::uuid, $2, $3, $4, $5)`,
          id,
          workspaceId,
          requiredText(legacy.name, "deck name", 1024).trim(),
          date(legacy.createdAt, "createdAt"),
          date(legacy.updatedAt, "updatedAt"),
        );
        await this.saveLegacyMapping(tx, workspaceId, "deck", legacy.id, id);
        deckIds[legacy.id] = id;
      }

      for (const legacy of input.cards) {
        requiredText(legacy.id, "legacy card id", 1024);
        const existing = await this.legacyMapping(
          tx,
          workspaceId,
          "card",
          legacy.id,
        );
        if (existing) {
          cardIds[legacy.id] = existing;
          continue;
        }
        const deckId =
          deckIds[legacy.deckId] ??
          (await this.legacyMapping(tx, workspaceId, "deck", legacy.deckId));
        if (!deckId)
          throw new BadRequestException("Legacy card deck not found");
        const id = await this.availableId(tx, legacy.id);
        await tx.$executeRawUnsafe(
          `INSERT INTO card_system.cards
             (card_id, workspace_id, deck_id, card_kind, created_at, updated_at)
           VALUES ($1::uuid, $2, $3::uuid, 'manual', $4, $5)`,
          id,
          workspaceId,
          deckId,
          date(legacy.createdAt, "createdAt"),
          date(legacy.updatedAt, "updatedAt"),
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO card_system.manual_card_content (card_id, front, back)
           VALUES ($1::uuid, $2, $3)`,
          id,
          requiredText(legacy.front, "card front"),
          requiredText(legacy.back, "card back"),
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO card_system.review_state
             (card_id, streak, interval_days, next_review_at, updated_at)
           VALUES ($1::uuid, $2, $3, $4, $5)`,
          id,
          nonNegativeInteger(legacy.streak, "streak"),
          nonNegativeInteger(legacy.intervalDays, "intervalDays"),
          date(legacy.nextReviewAt, "nextReviewAt"),
          date(legacy.updatedAt, "updatedAt"),
        );
        await this.saveLegacyMapping(tx, workspaceId, "card", legacy.id, id);
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

  private async listDecksWith(db: SqlClient, workspaceId: string) {
    const rows = await this.query<DeckRow>(
      db,
      `SELECT deck_id, name, created_at, updated_at, deleted_at
       FROM card_system.decks
       WHERE workspace_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`,
      workspaceId,
    );
    return rows.map(deckRecord);
  }

  private async legacyMapping(
    db: SqlClient,
    workspaceId: string,
    type: "deck" | "card",
    legacyId: string,
  ) {
    const rows = await this.query<{ entity_id: string }>(
      db,
      `SELECT entity_id FROM card_system.legacy_id_map
       WHERE workspace_id = $1 AND entity_type = $2 AND legacy_id = $3`,
      workspaceId,
      type,
      legacyId,
    );
    return rows[0]?.entity_id;
  }

  private async saveLegacyMapping(
    db: SqlClient,
    workspaceId: string,
    type: "deck" | "card",
    legacyId: string,
    id: string,
  ) {
    await db.$executeRawUnsafe(
      `INSERT INTO card_system.legacy_id_map
         (workspace_id, entity_type, legacy_id, entity_id)
       VALUES ($1, $2, $3, $4::uuid)`,
      workspaceId,
      type,
      legacyId,
      id,
    );
  }

  private async availableId(db: SqlClient, preferred: string) {
    if (!isUuid(preferred)) return crypto.randomUUID();
    const rows = await this.query<{ used: boolean }>(
      db,
      `SELECT EXISTS (
         SELECT 1 FROM card_system.decks WHERE deck_id = $1::uuid
         UNION ALL
         SELECT 1 FROM card_system.cards WHERE card_id = $1::uuid
       ) AS used`,
      preferred,
    );
    return rows[0]?.used ? crypto.randomUUID() : preferred;
  }
}
