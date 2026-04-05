import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PortfolioProvider } from './contexts/PortfolioContext';
import { LanguageProvider } from './contexts/LanguageContext';
import Layout from './components/Layout';

// Lazy load pages - only HomePage loads eagerly
import HomePage from './pages/HomePage';
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const RebalancingPage = lazy(() => import('./pages/RebalancingPage'));
const ScenarioPage = lazy(() => import('./pages/ScenarioPage'));
const AIAdvisorPage = lazy(() => import('./pages/AIAdvisorPage'));
const AllocationPage = lazy(() => import('./pages/AllocationPage'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const MarketPage = lazy(() => import('./pages/MarketPage'));
const PerformancePage = lazy(() => import('./pages/PerformancePage'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Yükleniyor...</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
      <PortfolioProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/analytics" element={<Suspense fallback={<PageLoader />}><AnalyticsPage /></Suspense>} />
            <Route path="/rebalancing" element={<Suspense fallback={<PageLoader />}><RebalancingPage /></Suspense>} />
            <Route path="/scenario" element={<Suspense fallback={<PageLoader />}><ScenarioPage /></Suspense>} />
            <Route path="/ai-advisor" element={<Suspense fallback={<PageLoader />}><AIAdvisorPage /></Suspense>} />
            <Route path="/allocation" element={<Suspense fallback={<PageLoader />}><AllocationPage /></Suspense>} />
            <Route path="/watchlist" element={<Suspense fallback={<PageLoader />}><WatchlistPage /></Suspense>} />
            <Route path="/market" element={<Suspense fallback={<PageLoader />}><MarketPage /></Suspense>} />
            <Route path="/performance" element={<Suspense fallback={<PageLoader />}><PerformancePage /></Suspense>} />
          </Route>
        </Routes>
      </PortfolioProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
