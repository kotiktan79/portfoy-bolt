import { Brain } from 'lucide-react';
import AIAdvisor from '../components/AIAdvisor';
import { PageHeader } from '../components/ui/PageHeader';
import { AI_DISABLED_MESSAGE, AI_ENABLED } from '../lib/aiFeature';

export default function AIAdvisorPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50/40 via-white to-accent-50/30 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          icon={Brain}
          title="AI Danışman"
          subtitle={AI_ENABLED
            ? 'Rakamları açıklar, anomali bildirir — işlem önermez, maaş hesaplamaz'
            : AI_DISABLED_MESSAGE}
        />
        {AI_ENABLED ? (
          <AIAdvisor />
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{AI_DISABLED_MESSAGE}</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Sohbet kapalı. Portföy rakamları ana sayfada, maaş Kâr Cüzdanı'nda, haftalık plan Günaydın kartında duruyor.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
