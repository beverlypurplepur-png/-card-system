export type CardKind = "manual" | "affine_ref";

export type DeckRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ManualCardRecord = {
  id: string;
  deckId: string | null;
  kind: "manual";
  front: string;
  back: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  streak: number;
  intervalDays: number;
  nextReviewAt: string;
};

export type AffineReferenceRecord = {
  id: string;
  deckId: string | null;
  kind: "affine_ref";
  sourceType: "page" | "frame";
  documentId: string;
  blockId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CardRecord = ManualCardRecord | AffineReferenceRecord;

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
  cards: ManualCardRecord[];
};
