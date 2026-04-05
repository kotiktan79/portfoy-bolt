import { useState, useEffect, useRef } from 'react';
import { Award, Lock } from 'lucide-react';
import * as Icons from 'lucide-react';
import { getAchievementProgress } from '../services/achievementService';

interface AchievementBadgesProps {
  stats: {
    totalHoldings: number;
    totalValue: number;
    totalPnL: number;
    assetTypes: string[];
    positiveDays: number;
    totalDividends: number;
    totalTransactions: number;
  };
}

export function AchievementBadges({ stats }: AchievementBadgesProps) {
  const [progress, setProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const previousStatsRef = useRef<string>('');

  useEffect(() => {
    const statsString = JSON.stringify(stats);
    if (statsString !== previousStatsRef.current) {
      previousStatsRef.current = statsString;
      loadProgress();
    }
  }, [stats]);

  async function loadProgress() {
    const data = await getAchievementProgress(stats);
    setProgress(data);
    setLoading(false);
  }

  const unlockedCount = progress.filter((a) => a.unlocked).length;

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100 mb-4">Başarılar</h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700 dark:border-gray-300"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">Başarılar</h3>
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-gray-400">
          <Award size={18} />
          <span className="font-semibold">
            {unlockedCount}/{progress.length}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {progress.map((achievement) => {
          const IconComponent = (Icons as any)[achievement.icon] || Award;

          return (
            <div
              key={achievement.type}
              className={`relative p-4 rounded-lg border-2 transition-all ${
                achievement.unlocked
                  ? 'bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-400 shadow-md'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
              title={achievement.description}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className={`p-3 rounded-full mb-2 ${
                    achievement.unlocked
                      ? 'bg-yellow-400 text-white'
                      : 'bg-slate-300 text-slate-500'
                  }`}
                >
                  {achievement.unlocked ? (
                    <IconComponent size={24} />
                  ) : (
                    <Lock size={24} />
                  )}
                </div>
                <p className="text-xs font-semibold text-slate-700 line-clamp-2">
                  {achievement.title}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
