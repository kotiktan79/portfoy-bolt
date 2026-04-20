import { Zap } from 'lucide-react';
import ScenarioSimulator from '../components/ScenarioSimulator';
import { PageHeader } from '../components/ui/PageHeader';

export default function ScenarioPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50/40 via-white to-accent-50/30 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          icon={Zap}
          title="Senaryo Analizi"
          subtitle="Piyasa şokları ve Monte Carlo simülasyonları"
        />
        <ScenarioSimulator />
      </div>
    </div>
  );
}
