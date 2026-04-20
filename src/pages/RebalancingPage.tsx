import { Scale } from 'lucide-react';
import RebalancingEngine from '../components/RebalancingEngine';
import CashFlowRebalanceWidget from '../components/CashFlowRebalanceWidget';
import TradeSimulator from '../components/TradeSimulator';
import { PageHeader } from '../components/ui/PageHeader';

export default function RebalancingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50/40 via-white to-accent-50/30 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          icon={Scale}
          title="Portföy Rebalancing"
          subtitle="Yeni nakit dağıtımı, trade simülasyonu ve otomatik dengeleme"
        />
        <div className="space-y-6">
          <CashFlowRebalanceWidget />
          <TradeSimulator />
          <RebalancingEngine />
        </div>
      </div>
    </div>
  );
}
