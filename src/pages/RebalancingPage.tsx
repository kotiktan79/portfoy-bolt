import { useNavigate } from 'react-router-dom';
import { Scale } from 'lucide-react';
import RebalancingEngine from '../components/RebalancingEngine';
import CashFlowRebalanceWidget from '../components/CashFlowRebalanceWidget';
import TradeSimulator from '../components/TradeSimulator';

export default function RebalancingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Scale className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Portföy Rebalancing</h1>
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Ana Sayfaya Dön
          </button>
        </div>
        <div className="space-y-6 mb-6">
          <CashFlowRebalanceWidget />
          <TradeSimulator />
        </div>
        <RebalancingEngine />
      </div>
    </div>
  );
}
