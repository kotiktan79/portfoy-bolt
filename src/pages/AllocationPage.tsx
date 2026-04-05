import { useNavigate } from 'react-router-dom';
import { AssetAllocationPage } from '../components/AssetAllocationPage';
import { usePortfolio } from '../contexts/PortfolioContext';

export default function AllocationPage() {
  const navigate = useNavigate();
  const { holdings } = usePortfolio();

  return (
    <AssetAllocationPage
      holdings={holdings}
      onBack={() => navigate(-1)}
    />
  );
}
