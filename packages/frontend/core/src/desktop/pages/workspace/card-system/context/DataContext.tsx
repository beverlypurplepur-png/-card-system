import React, { createContext, useContext, useEffect, useState } from "react";
import type { AffineCardDataStore } from "../data/affineCardDataStore";
import type { Deck } from "../data/model";

interface DataContextType {
  decks: Deck[];
  setDecks: (decks: Deck[]) => void;
  dataStore: AffineCardDataStore;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

interface DataProviderProps {
  children: React.ReactNode;
  dataStore: AffineCardDataStore;
}

export const DataProvider = ({ children, dataStore }: DataProviderProps) => {
  const [decks, setDecks] = useState<Deck[]>([]);

  useEffect(() => {
    let active = true;
    void dataStore
      .migrateLocalStorage()
      .then(() => dataStore.getDecks())
      .then((nextDecks) => {
        if (active) setDecks(nextDecks);
      });
    return () => {
      active = false;
    };
  }, [dataStore]);

  const contextValue: DataContextType = {
    decks,
    setDecks,
    dataStore,
  };

  return (
    <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useDataStore = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useDataStore must be used within a DataProvider");
  }
  return context;
};
