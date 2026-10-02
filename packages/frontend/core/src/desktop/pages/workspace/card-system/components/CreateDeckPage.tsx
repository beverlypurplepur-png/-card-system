import Layout from "./Layout";
import { useNavigate } from "../router";
import { useDataStore } from "../context/DataContext";
import CreateDeckForm from "./CreateDeckForm";
import type { CreateDeckInput } from "./CreateDeckForm";

export function CreateDeckPage() {
  const navigate = useNavigate();
  const { dataStore } = useDataStore();

  const createDeck = async (input: CreateDeckInput) => {
    const createdDeck = await dataStore.upsertDeck({
      id: crypto.randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    navigate(`/decks/${createdDeck.id}`);
  };

  return (
    <Layout active="create" onNavigate={(href) => navigate(href)}>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-black mb-2">
          Create New Deck
        </h1>
        <p className="text-[15px] text-black/50">
          Add a new deck to your collection
        </p>
      </div>
      <CreateDeckForm onSubmit={createDeck} submitLabel="Create Deck" />
    </Layout>
  );
}
