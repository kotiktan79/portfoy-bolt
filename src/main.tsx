import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Dark mode'u render'dan ÖNCE uygula — useDarkMode yalnız HomePage'de mount
// oluyor; /performance gibi bir sayfaya doğrudan girişte tema kayboluyordu.
try {
  if (JSON.parse(localStorage.getItem('darkMode') || 'false')) {
    document.documentElement.classList.add('dark');
  }
} catch { /* localStorage kapalıysa light kal */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
