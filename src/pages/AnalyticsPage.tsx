import { BarChart3 } from 'lucide-react';
import ComprehensiveAnalytics from '../components/ComprehensiveAnalytics';
import RealizedPnLReport from '../components/RealizedPnLReport';
import PerformanceAttribution from '../components/PerformanceAttribution';
import FireGoalTracker from '../components/FireGoalTracker';
import RiskMetricsCard from '../components/RiskMetricsCard';
import { PageHeader } from '../components/ui/PageHeader';

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50/40 via-white to-accent-50/30 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          icon={BarChart3}
          title="Gelişmiş Analitik"
          subtitle="Risk metrikleri, FIRE hedefi, performans atfı ve realize kâr/zarar"
        />
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
