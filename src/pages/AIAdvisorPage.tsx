import { Brain } from 'lucide-react';
import AIAdvisor from '../components/AIAdvisor';
import { PageHeader } from '../components/ui/PageHeader';

export default function AIAdvisorPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50/40 via-white to-accent-50/30 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          icon={Brain}
          title="AI Danışman"
          subtitle="Risk profili, buy/sell sinyalleri ve akıllı öneriler"
        />
        <AIAdvisor />
      </div>
    </div>
  );
}
