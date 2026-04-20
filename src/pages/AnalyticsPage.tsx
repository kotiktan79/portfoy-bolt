import { useNavigate } from 'react-router-dom';
import ComprehensiveAnalytics from '../components/ComprehensiveAnalytics';
import RealizedPnLReport from '../components/RealizedPnLReport';
import PerformanceAttribution from '../components/PerformanceAttribution';
import FireGoalTracker from '../components/FireGoalTracker';
import RiskMetricsCard from '../components/RiskMetricsCard';

export default function AnalyticsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-accent-50/30 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-md"
          >
            ← Geri
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gelişmiş Analitik</h1>
        </div>
        <div className="space-y-6">
          <ComprehensiveAnalytics />
          <RiskMetricsCard />
          <FireGoalTracker />
          <PerformanceAttribution />
          <RealizedPnLReport />
        </div>
      </div>
    </div>
  );
}
