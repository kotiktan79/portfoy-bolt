import { Target } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import FireProjection from '../components/FireProjection';
import AnnualReportCard from '../components/AnnualReportCard';

export default function ProjectionPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50/40 via-white to-accent-50/30 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <PageHeader
          icon={Target}
          title="Hedef & Projeksiyon"
          subtitle="FIRE hedefine gidiş ve yıl bazında kazanç dökümü"
        />
        <div className="space-y-6">
          <FireProjection />
          <AnnualReportCard />
        </div>
      </div>
    </div>
  );
}
