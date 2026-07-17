import { useNavigate } from 'react-router-dom';
import { AssetAllocationPage } from '../components/AssetAllocationPage';
import CurrencyExposureCard from '../components/CurrencyExposureCard';
import TradeSimulatorCard from '../components/TradeSimulatorCard';
import { usePortfolio } from '../contexts/PortfolioContext';

export default function AllocationPage() {
  const navigate = useNavigate();
  const { holdings } = usePortfolio();

  return (
    <>
      <AssetAllocationPage
        holdings={holdings}
        onBack={() => navigate(-1)}
      />
      <div className="bg-slate-50 dark:bg-gray-950">
        <div className="px-4 pb-6 max-w-7xl mx-auto space-y-6">
          <CurrencyExposureCard />
          <TradeSimulatorCard holdings={holdings} />
        </div>
      </div>
    </>
  );
}
