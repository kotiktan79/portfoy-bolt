import { useNavigate } from 'react-router-dom';
import AIAdvisor from '../components/AIAdvisor';

export default function AIAdvisorPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            ← Geri
          </button>
        </div>
        <AIAdvisor />
      </div>
    </div>
  );
}
