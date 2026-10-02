import { beforeEach, describe, expect, test, vi } from "vitest";

import { AffineCardDataStore } from "./affineCardDataStore";
import type { Card, Deck } from "./model";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}

const now = () => new Date().toISOString();

class FakeCardApi {
  readonly decks = new Map<string, Deck & { deletedAt: string | null }>();
  readonly cards = new Map<
    string,
    Card & { kind: "manual"; deletedAt: string | null }
  >();
  readonly mappings = new Map<string, string>();

  request = async (path: string, init?: RequestInit) => {
    const url = new URL(path, "https://affine.test");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const parts = url.pathname.split("/");
    const resource = parts[5];
    const id = parts[6];
    const action = parts[7];

    if (resource === "decks" && method === "GET") {
      return this.ok(
        [...this.decks.values()].filter((deck) => !deck.deletedAt),
      );
    }
    if (resource === "decks" && method === "POST" && !id) {
      const deck = {
        ...body,
        id: body.id ?? crypto.randomUUID(),
        deletedAt: null,
      };
      this.decks.set(deck.id, deck);
      return this.ok(deck);
    }
    if (resource === "decks" && method === "PATCH") {
      const deck = this.decks.get(id)!;
      Object.assign(deck, { name: body.name, updatedAt: now() });
      return this.ok(deck);
    }
    if (resource === "decks" && method === "DELETE") {
      const deck = this.decks.get(id)!;
      deck.deletedAt = now();
      return this.ok(deck);
    }
    if (resource === "decks" && action === "restore") {
      const deck = this.decks.get(id)!;
      deck.deletedAt = null;
      return this.ok(deck);
    }
    if (resource === "cards" && method === "GET") {
      const deckId = url.searchParams.get("deckId");
      return this.ok(
        [...this.cards.values()].filter(
          (card) =>
            !card.deletedAt &&
            !this.decks.get(card.deckId)?.deletedAt &&
            (!deckId || card.deckId === deckId),
        ),
      );
    }
    if (resource === "cards" && method === "POST" && !id) {
      const card = {
        ...body,
        id: body.id ?? crypto.randomUUID(),
        kind: "manual" as const,
        deletedAt: null,
      };
      this.cards.set(card.id, card);
      return this.ok(card);
    }
    if (resource === "cards" && method === "PATCH") {
      const card = this.cards.get(id)!;
      Object.assign(card, body, { updatedAt: now() });
      return this.ok(card);
    }
    if (resource === "cards" && method === "DELETE") {
      const card = this.cards.get(id)!;
      card.deletedAt = now();
      return this.ok(card);
    }
    if (resource === "cards" && action === "restore") {
      const card = this.cards.get(id)!;
      card.deletedAt = null;
      return this.ok(card);
    }
    if (resource === "cards" && action === "review") {
      const card = this.cards.get(id)!;
      Object.assign(card, body, { updatedAt: now() });
      return this.ok(card);
    }
    if (resource === "import" && id === "local-storage") {
      const deckIds: Record<string, string> = {};
      const cardIds: Record<string, string> = {};
      for (const legacy of body.decks as Deck[]) {
        const key = `deck:${legacy.id}`;
        const mapped = this.mappings.get(key) ?? legacy.id;
        this.mappings.set(key, mapped);
        deckIds[legacy.id] = mapped;
        if (!this.decks.has(mapped))
          this.decks.set(mapped, { ...legacy, id: mapped, deletedAt: null });
      }
      for (const legacy of body.cards as Card[]) {
        const key = `card:${legacy.id}`;
        const mapped = this.mappings.get(key) ?? legacy.id;
        this.mappings.set(key, mapped);
        cardIds[legacy.id] = mapped;
        if (!this.cards.has(mapped)) {
          this.cards.set(mapped, {
            ...legacy,
            id: mapped,
            deckId: deckIds[legacy.deckId],
            kind: "manual",
            deletedAt: null,
          });
        }
      }
      return this.ok({
        deckIds,
        cardIds,
        decks: [...this.decks.values()],
        cards: [...this.cards.values()],
      });
    }
    return new Response("", { status: 404 });
  };

  private ok(value: unknown) {
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

describe("AffineCardDataStore", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  test("persists identity, moves, review, soft delete and restore across clients", async () => {
    const api = new FakeCardApi();
    const first = new AffineCardDataStore(api.request, "workspace");
    const deckA = await first.upsertDeck({
      id: crypto.randomUUID(),
      name: "A",
      createdAt: now(),
      updatedAt: now(),
    });
    const deckB = await first.upsertDeck({
      id: crypto.randomUUID(),
      name: "B",
      createdAt: now(),
      updatedAt: now(),
    });
    const card = await first.upsertCard({
      id: crypto.randomUUID(),
      deckId: deckA.id,
      front: "front",
      back: "back",
      createdAt: now(),
      updatedAt: now(),
      streak: 0,
      intervalDays: 0,
      nextReviewAt: now(),
    });
    const moved = await first.upsertCard({
      ...card,
      deckId: deckB.id,
      front: "edited",
      streak: 2,
      intervalDays: 3,
      nextReviewAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(moved.id).toBe(card.id);
    expect(moved.deckId).toBe(deckB.id);
    expect(moved.streak).toBe(2);

    await first.deleteCard(card.id);
    expect(await first.getCards(deckB.id)).toEqual([]);
    expect((await first.restoreCard(card.id)).id).toBe(card.id);
    await first.deleteCard(card.id);
    await first.deleteDeck(deckB.id);
    expect(await first.getDecks()).toEqual([deckA]);
    expect((await first.restoreDeck(deckB.id)).id).toBe(deckB.id);
    expect(await first.getCards(deckB.id)).toEqual([]);
    expect((await first.restoreCard(card.id)).id).toBe(card.id);

    const second = new AffineCardDataStore(api.request, "workspace");
    expect((await second.getCards(deckB.id))[0]).toMatchObject({
      id: card.id,
      front: "edited",
      streak: 2,
      intervalDays: 3,
    });
  });

  test("imports localStorage once, verifies it and never duplicates on retry", async () => {
    const api = new FakeCardApi();
    const deckId = crypto.randomUUID();
    const cardId = crypto.randomUUID();
    localStorage.setItem(
      "flashcards",
      JSON.stringify({
        decks: [
          { id: deckId, name: "Legacy", createdAt: now(), updatedAt: now() },
        ],
        cards: [
          {
            id: cardId,
            deckId,
            front: "old front",
            back: "old back",
            createdAt: now(),
            updatedAt: now(),
            streak: 4,
            intervalDays: 8,
            nextReviewAt: now(),
          },
        ],
      }),
    );
    const first = new AffineCardDataStore(api.request, "workspace");
    await first.migrateLocalStorage();
    const backup = localStorage.getItem("flashcards");
    expect(
      localStorage.getItem("card-system:local-storage-migrated:workspace"),
    ).toBe("true");
    expect(api.decks.size).toBe(1);
    expect(api.cards.size).toBe(1);
    expect((await first.getCards(deckId))[0].streak).toBe(4);

    localStorage.removeItem("card-system:local-storage-migrated:workspace");
    const retry = new AffineCardDataStore(api.request, "workspace");
    await retry.migrateLocalStorage();
    expect(api.decks.size).toBe(1);
    expect(api.cards.size).toBe(1);

    const second = new AffineCardDataStore(api.request, "workspace");
    expect(await second.migrateLocalStorage()).toBeNull();
    expect(localStorage.getItem("flashcards")).toBe(backup);
  });
});
