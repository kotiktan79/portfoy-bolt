import { lazy, Suspense, ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PortfolioProvider } from './contexts/PortfolioContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import Layout from './components/Layout';
import AuthGate from './components/AuthGate';

// Lazy load all pages for optimal bundle splitting
const HomePage = lazy(() => import('./pages/HomePage'));
const AIAdvisorPage = lazy(() => import('./pages/AIAdvisorPage'));
const AllocationPage = lazy(() => import('./pages/AllocationPage'));
const PerformancePage = lazy(() => import('./pages/PerformancePage'));
const DailyReportPage = lazy(() => import('./pages/DailyReportPage'));
const LivePage = lazy(() => import('./pages/LivePage'));
const ResearchPage = lazy(() => import('./pages/ResearchPage'));

function PageLoader() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="h-10 w-64 rounded-xl bg-slate-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-32 rounded-2xl bg-gradient-to-b from-slate-200 to-slate-100 dark:from-gray-800 dark:to-gray-900 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-72 rounded-2xl bg-gradient-to-b from-slate-200 to-slate-100 dark:from-gray-800 dark:to-gray-900 animate-pulse" />
          <div className="space-y-4">
            <div className="h-32 rounded-2xl bg-slate-200 dark:bg-gray-800 animate-pulse" />
            <div className="h-32 rounded-2xl bg-slate-200 dark:bg-gray-800 animate-pulse" />
          </div>
        </div>
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
      <AuthGate>
      <LanguageProvider>
      <PortfolioProvider>
        <Routes>
          {/* Layout-free route: tam ekran kiosk için */}
          <Route path="/live" element={<SafePage><LivePage /></SafePage>} />
          <Route element={<Layout />}>
            <Route path="/" element={<SafePage><HomePage /></SafePage>} />
            <Route path="/ai-advisor" element={<SafePage><AIAdvisorPage /></SafePage>} />
            <Route path="/allocation" element={<SafePage><AllocationPage /></SafePage>} />
            <Route path="/performance" element={<SafePage><PerformancePage /></SafePage>} />
            <Route path="/daily-report" element={<SafePage><DailyReportPage /></SafePage>} />
            <Route path="/research" element={<SafePage><ResearchPage /></SafePage>} />
          </Route>
        </Routes>
      </PortfolioProvider>
      </LanguageProvider>
      </AuthGate>
    </BrowserRouter>
  );
}

export default App;
