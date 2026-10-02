export type CollectionRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

// The BaraBara UI still calls collections "decks". This alias keeps its
// adapter surface stable while the persisted domain uses Collection.
export type DeckRecord = CollectionRecord;

export type CardRecord = {
  id: string;
  cardType: string;
  collectionIds: string[];
  deckId: string | null;
  front: string;
  back: string;
  affineDocumentId: string | null;
  affineFrameId: string | null;
  states: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  streak: number;
  intervalDays: number;
  nextReviewAt: string;
};

export type LegacyImport = {
  decks: Array<{
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }>;
  cards: Array<{
    id: string;
    deckId: string;
    front: string;
    back: string;
    createdAt: string;
    updatedAt: string;
    streak: number;
    intervalDays: number;
    nextReviewAt: string;
  }>;
};

export type LegacyImportResult = {
  deckIds: Record<string, string>;
  cardIds: Record<string, string>;
  decks: DeckRecord[];
  cards: CardRecord[];
};
