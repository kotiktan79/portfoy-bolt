import { lazy, Suspense, ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PortfolioProvider } from './contexts/PortfolioContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import Layout from './components/Layout';

// Lazy load all pages for optimal bundle splitting
const HomePage = lazy(() => import('./pages/HomePage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const RebalancingPage = lazy(() => import('./pages/RebalancingPage'));
const ScenarioPage = lazy(() => import('./pages/ScenarioPage'));
const AIAdvisorPage = lazy(() => import('./pages/AIAdvisorPage'));
const AllocationPage = lazy(() => import('./pages/AllocationPage'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const MarketPage = lazy(() => import('./pages/MarketPage'));
const PerformancePage = lazy(() => import('./pages/PerformancePage'));
const BinancePage = lazy(() => import('./pages/BinancePage'));
const DailyReportPage = lazy(() => import('./pages/DailyReportPage'));

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

function SafePage({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
      <PortfolioProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<SafePage><HomePage /></SafePage>} />
            <Route path="/analytics" element={<SafePage><AnalyticsPage /></SafePage>} />
            <Route path="/rebalancing" element={<SafePage><RebalancingPage /></SafePage>} />
            <Route path="/scenario" element={<SafePage><ScenarioPage /></SafePage>} />
            <Route path="/ai-advisor" element={<SafePage><AIAdvisorPage /></SafePage>} />
            <Route path="/allocation" element={<SafePage><AllocationPage /></SafePage>} />
            <Route path="/watchlist" element={<SafePage><WatchlistPage /></SafePage>} />
            <Route path="/market" element={<SafePage><MarketPage /></SafePage>} />
            <Route path="/performance" element={<SafePage><PerformancePage /></SafePage>} />
            <Route path="/binance" element={<SafePage><BinancePage /></SafePage>} />
            <Route path="/daily-report" element={<SafePage><DailyReportPage /></SafePage>} />
          </Route>
        </Routes>
      </PortfolioProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
