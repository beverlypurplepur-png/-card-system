import type { Card } from "../data/model";
import { Modal } from "./Modal";
import CardForm from "./CardForm";
import { useDataStore } from "../context/DataContext";

export type CardModalMode = "create" | "edit";

export interface CardModalProps {
  mode: CardModalMode;
  initial?: Card;
  open: boolean;
  deckId: string;
  onClose: () => void;
  onCreated?: (card: Card) => void;
  onUpdated?: (card: Card) => void;
}

export function CardModal({
  mode,
  initial,
  open,
  onClose,
  deckId,
  onCreated,
  onUpdated,
}: CardModalProps) {
  const { dataStore } = useDataStore();
  const title = mode === "create" ? "Create Card" : "Edit Card";
  const submitLabel = mode === "create" ? "Create Card" : "Update Card";

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <CardForm
        initial={initial}
        submitLabel={submitLabel}
        onSubmit={async (input) => {
          if (mode === "edit" && initial) {
            const updatedCard = await dataStore.upsertCard({
              ...initial,
              ...input,
              updatedAt: new Date().toISOString(),
            });
            onUpdated?.(updatedCard);
            onClose();
          } else {
            const createdCard = await dataStore.upsertCard({
              id: crypto.randomUUID(),
              deckId,
              front: input.front,
              back: input.back,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              streak: 0,
              intervalDays: 0,
              nextReviewAt: new Date().toISOString(),
            });
            onCreated?.(createdCard);
            onClose();
          }
        }}
      />
    </Modal>
  );
}
