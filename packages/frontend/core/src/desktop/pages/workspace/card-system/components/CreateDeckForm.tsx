import { useState } from "react";

export interface CreateDeckInput {
  name: string;
}

export interface CreateDeckFormProps {
  onSubmit: (input: CreateDeckInput) => Promise<void>;
  submitLabel?: string;
}

export default function CreateDeckForm({
  onSubmit,
  submitLabel = "Create Collection",
}: CreateDeckFormProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className="max-w-2xl"
      onSubmit={async (event) => {
        event.preventDefault();
        const nextName = name.trim();
        if (!nextName) return;
        setIsSubmitting(true);
        try {
          await onSubmit({ name: nextName });
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <div className="rounded-2xl border backdrop-blur-xl p-10 transition-all duration-700 bg-zinc-50 border-zinc-900/5">
        <div className="space-y-8">
          <div>
            <label
              htmlFor="name"
              className="block text-sm tracking-wide mb-4 font-medium text-zinc-600"
            >
              Collection Name
            </label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full px-6 py-4 rounded-xl border text-base tracking-wide focus:outline-none focus:ring-2 transition-all bg-white border-zinc-900/10 text-zinc-900 placeholder:text-zinc-400 focus:ring-zinc-900/10 focus:border-zinc-900/20"
              placeholder="e.g., Spanish Vocabulary, Computer Science, Medical Terms"
            />
            <p className="mt-3 text-sm text-zinc-400">
              Choose a descriptive name for your flashcard collection
            </p>
          </div>
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full px-8 py-4 rounded-xl text-sm tracking-wide font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed bg-zinc-900 text-white hover:bg-zinc-800"
            >
              {isSubmitting ? "Creating..." : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
