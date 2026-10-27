import { Hammer } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { RomaniaRenovationCard } from '../components/RomaniaRenovationCard';
import type { RenovationSummary } from '../lib/romaniaRenovation';

/** Portföy rakamlarından bağımsız tadilat ekranı. */
export default function RomaniaRenovationPage({ summary }: { summary?: RenovationSummary }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950">
      <div className="px-4 py-5 max-w-3xl mx-auto">
        <PageHeader
          title="Romanya Ev Tadilatı"
          subtitle="Evin tadilat harcaması. Portföy toplamına girmez."
          icon={Hammer}
        />
        <RomaniaRenovationCard summary={summary} />
      </div>
    </div>
  );
}
