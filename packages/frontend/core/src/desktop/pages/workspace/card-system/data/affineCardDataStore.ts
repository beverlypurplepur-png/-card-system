import type { DataStore } from './dataStore';
import type { Card, Deck } from './model';

type Request = (path: string, init?: RequestInit) => Promise<Response>;

type ServerDeck = Deck & { deletedAt: string | null };
type ServerCard = Card & { deletedAt: string | null };

type LegacyStore = {
  decks: Deck[];
  cards: Card[];
};

type ImportResult = {
  deckIds: Record<string, string>;
  cardIds: Record<string, string>;
  decks: ServerDeck[];
  cards: ServerCard[];
};

const json = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`Card System request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
};

const isLegacyStore = (value: unknown): value is LegacyStore => {
  if (!value || typeof value !== 'object') return false;
  const store = value as Partial<LegacyStore>;
  return Array.isArray(store.decks) && Array.isArray(store.cards);
};

export class AffineCardDataStore implements DataStore {
  private readonly base: string;
  private readonly knownDecks = new Set<string>();
  private readonly knownCards = new Set<string>();

  constructor(
    private readonly request: Request,
    readonly workspaceId: string
  ) {
    this.base = `/api/card-system/workspaces/${encodeURIComponent(workspaceId)}`;
  }

  private call<T>(path: string, init?: RequestInit) {
    return this.request(this.base + path, {
      credentials: 'include',
      ...init,
      headers: init?.body
        ? { 'Content-Type': 'application/json', ...init.headers }
        : init?.headers,
    }).then(json<T>);
  }

  async getDecks(): Promise<Deck[]> {
    const decks = await this.call<ServerDeck[]>('/decks');
    decks.forEach(deck => this.knownDecks.add(deck.id));
    return decks;
  }

  async getDeck(id: string): Promise<Deck | undefined> {
    return (await this.getDecks()).find(deck => deck.id === id);
  }

  async upsertDeck(deck: Deck): Promise<Deck> {
    const exists = this.knownDecks.has(deck.id);
    const saved = await this.call<ServerDeck>(
      exists ? `/decks/${encodeURIComponent(deck.id)}` : '/decks',
      {
        method: exists ? 'PATCH' : 'POST',
        body: JSON.stringify(exists ? { name: deck.name } : deck),
      }
    );
    this.knownDecks.add(saved.id);
    return saved;
  }

  async deleteDeck(id: string): Promise<void> {
    await this.call<ServerDeck>(`/decks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    this.knownDecks.delete(id);
  }

  async restoreDeck(id: string): Promise<Deck> {
    const deck = await this.call<ServerDeck>(
      `/decks/${encodeURIComponent(id)}/restore`,
      { method: 'POST' }
    );
    this.knownDecks.add(deck.id);
    return deck;
  }

  async getCards(deckId: string): Promise<Card[]> {
    const cards = await this.call<ServerCard[]>(
      `/cards?deckId=${encodeURIComponent(deckId)}`
    );
    cards.forEach(card => this.knownCards.add(card.id));
    return cards;
  }

  private async getAllCards(): Promise<ServerCard[]> {
    const cards = await this.call<ServerCard[]>('/cards');
    cards.forEach(card => this.knownCards.add(card.id));
    return cards;
  }

  async getCard(id: string): Promise<Card | undefined> {
    return (await this.getAllCards()).find(card => card.id === id);
  }

  async upsertCard(card: Card): Promise<Card> {
    const exists = this.knownCards.has(card.id);
    if (!exists) {
      const saved = await this.call<ServerCard>('/cards', {
        method: 'POST',
        body: JSON.stringify(card),
      });
      this.knownCards.add(saved.id);
      return saved;
    }

    return this.call<ServerCard>(`/cards/${encodeURIComponent(card.id)}`, {
      method: 'PATCH',
      body: JSON.stringify(card),
    });
  }

  async deleteCard(id: string): Promise<void> {
    await this.call<ServerCard>(`/cards/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    this.knownCards.delete(id);
  }

  async restoreCard(id: string): Promise<Card> {
    const card = await this.call<ServerCard>(
      `/cards/${encodeURIComponent(id)}/restore`,
      { method: 'POST' }
    );
    this.knownCards.add(card.id);
    return card;
  }

  async migrateLocalStorage(): Promise<ImportResult | null> {
    const marker = `card-system:local-storage-migrated:${this.workspaceId}`;
    if (localStorage.getItem(marker) === 'true') return null;

    const raw = localStorage.getItem('flashcards');
    if (!raw) return null;
    let legacy: unknown;
    try {
      legacy = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!isLegacyStore(legacy)) return null;

    const imported = await this.call<ImportResult>('/import/local-storage', {
      method: 'POST',
      body: JSON.stringify(legacy),
    });
    const [decks, cards] = await Promise.all([
      this.getDecks(),
      this.getAllCards(),
    ]);
    const deckIds = new Set(decks.map(deck => deck.id));
    const cardIds = new Set(cards.map(card => card.id));
    const complete =
      Object.values(imported.deckIds).every(id => deckIds.has(id)) &&
      Object.values(imported.cardIds).every(id => cardIds.has(id));
    if (!complete)
      throw new Error('Card System localStorage migration verification failed');

    localStorage.setItem(marker, 'true');
    return imported;
  }
}
