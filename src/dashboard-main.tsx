import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import DashboardApp from './DashboardApp.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <DashboardApp />
    </ErrorBoundary>
  </StrictMode>
);
