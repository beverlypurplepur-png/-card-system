import { DataProvider } from './context/DataContext';
import type { AffineCardDataStore } from './data/affineCardDataStore';
import { CreateDeckPage } from './components/CreateDeckPage';
import { DashboardPage } from './components/DashboardPage';
import { ReviewPage } from './components/ReviewPage';
import { ViewDeckPage } from './components/ViewDeckPage';
import { BaraBaraRouter, useBaraBaraPath } from './router';

const BaraBaraRoutes = () => {
  const path = useBaraBaraPath();

  if (path === '/' || path === '/home') return <DashboardPage />;
  if (path === '/dashboard') return <DashboardPage />;
  if (path === '/create-deck') return <CreateDeckPage />;
  if (/^\/decks\/[^/]+\/study$/.test(path)) {
    return <ReviewPage studyMode />;
  }
  if (/^\/decks\/[^/]+\/review$/.test(path)) {
    return <ReviewPage studyMode={false} />;
  }
  if (/^\/decks\/[^/]+$/.test(path)) return <ViewDeckPage />;
  return <DashboardPage />;
};

export const BaraBaraApp = ({
  dataStore,
}: {
  dataStore: AffineCardDataStore;
}) => (
  <DataProvider dataStore={dataStore}>
    <BaraBaraRouter>
      <BaraBaraRoutes />
    </BaraBaraRouter>
  </DataProvider>
);
