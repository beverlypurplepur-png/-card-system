import { useState } from "react";

import { SubmitButton } from "./SubmitButton";

export interface CardInput {
  front: string;
  back: string;
}

export interface CardFormProps {
  initial?: Partial<CardInput>;
  onSubmit: (input: CardInput) => Promise<void>;
  submittingText?: string;
  submitLabel?: string;
}

export default function CardForm({
  initial,
  onSubmit,
  submittingText = "Creating...",
  submitLabel = "Create Card",
}: CardFormProps) {
  const [front, setFront] = useState(initial?.front ?? "");
  const [back, setBack] = useState(initial?.back ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className="space-y-4 pt-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!front.trim() || !back.trim()) return;
        setIsSubmitting(true);
        try {
          await onSubmit({ front, back });
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <div>
        <label htmlFor="front" className="block text-sm font-medium pb-4">
          Front of Card
        </label>
        <textarea
          id="front"
          value={front}
          onChange={(event) => setFront(event.target.value)}
          className="w-full min-h-32 rounded-xl border border-slate-300 p-4 text-sm"
        />
      </div>
      <div>
        <label htmlFor="back" className="block text-sm font-medium pb-4">
          Back of Card
        </label>
        <textarea
          id="back"
          value={back}
          onChange={(event) => setBack(event.target.value)}
          className="w-full min-h-32 rounded-xl border border-slate-300 p-4 text-sm"
        />
      </div>
      <div className="pt-4">
        <SubmitButton
          isSubmitting={isSubmitting}
          text={submitLabel}
          submittingText={submittingText}
        />
      </div>
    </form>
  );
}
