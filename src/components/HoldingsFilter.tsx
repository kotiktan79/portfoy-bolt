import { Search, Filter } from 'lucide-react';
import { AssetType } from '../lib/supabase';

interface HoldingsFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedType: AssetType | 'all';
  onTypeChange: (type: AssetType | 'all') => void;
  sortBy: 'name' | 'value' | 'pnl' | 'pnl_percent';
  onSortChange: (sort: 'name' | 'value' | 'pnl' | 'pnl_percent') => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (order: 'asc' | 'desc') => void;
}

export function HoldingsFilter({
  searchQuery,
  onSearchChange,
  selectedType,
  onTypeChange,
  sortBy,
  onSortChange,
  sortOrder,
  onSortOrderChange,
}: HoldingsFilterProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-6">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Sembol veya isim ara..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-600 dark:text-gray-400" />
            <select
              value={selectedType}
              onChange={(e) => onTypeChange(e.target.value as AssetType | 'all')}
              className="px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="all">Tüm Varlıklar</option>
              <option value="stock">Hisse Senedi</option>
              <option value="crypto">Kripto</option>
              <option value="gold">Altın</option>
              <option value="forex">Döviz</option>
            </select>
          </div>

          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="name">İsim</option>
            <option value="value">Toplam Değer</option>
            <option value="pnl">Kar/Zarar</option>
            <option value="pnl_percent">K/Z %</option>
          </select>

          <button
            onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors dark:text-gray-100"
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>
    </div>
  );
}
