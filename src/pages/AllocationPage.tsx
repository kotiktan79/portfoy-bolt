import { useNavigate } from 'react-router-dom';
import { AssetAllocationPage } from '../components/AssetAllocationPage';
import CurrencyExposureCard from '../components/CurrencyExposureCard';
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
      <div className="px-4 pb-6 -mt-6 max-w-7xl mx-auto">
        <CurrencyExposureCard />
      </div>
    </>
  );
}
