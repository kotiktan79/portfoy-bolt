import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, BarChart3, PieChart, LayoutGrid, List } from 'lucide-react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useTheme } from '../hooks/useTheme';
import { useDarkMode } from '../hooks/useDarkMode';
import { calculateRebalance } from '../services/analyticsService';
import { Holding } from '../lib/supabase';

// Core components (always loaded)
import { AddHoldingModal } from '../components/AddHoldingModal';
import { EditHoldingModal } from '../components/EditHoldingModal';
import { HoldingRow } from '../components/HoldingRow';
import { HoldingCard } from '../components/HoldingCard';
import { getSparklineData } from '../services/priceHistoryService';
import { SkeletonRow, SkeletonCard } from '../components/ui/Skeleton';
import { HoldingsFilter } from '../components/HoldingsFilter';
import { ToastContainer } from '../components/Toast';
import { DailyActionPlan } from '../components/DailyActionPlan';
import { SmartAlerts } from '../components/SmartAlerts';
import { DashboardHeader } from '../components/DashboardHeader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import InstallPWA from '../components/InstallPWA';
import { PriceUpdateNotification } from '../components/PriceUpdateNotification';
import IncomeWidget from '../components/IncomeWidget';
import PortfolioXRay from '../components/PortfolioXRay';
import { RebalancePlan } from '../components/RebalancePlan';
import KarCuzdani from '../components/KarCuzdani';
import DividendInvestmentPlanner from '../components/DividendInvestmentPlanner';
import HeroDashboard from '../components/HeroDashboard';
import { getDynamicWithdrawal } from '../services/analyticsService';
import { DynamicWithdrawal } from '../lib/portfolioMetrics';

// Lazy loaded components (charts, modals - loaded on demand)
const RebalanceModal = lazy(() => import('../components/RebalanceModal').then(m => ({ default: m.RebalanceModal })));
const PortfolioChart = lazy(() => import('../components/PortfolioChart').then(m => ({ default: m.PortfolioChart })));
const AllocationChart = lazy(() => import('../components/AllocationChart').then(m => ({ default: m.AllocationChart })));
const TransactionHistory = lazy(() => import('../components/TransactionHistory').then(m => ({ default: m.TransactionHistory })));
const PriceAlertModal = lazy(() => import('../components/PriceAlertModal').then(m => ({ default: m.PriceAlertModal })));
const ExportImportModal = lazy(() => import('../components/ExportImportModal').then(m => ({ default: m.ExportImportModal })));
const BackupRestore = lazy(() => import('../components/BackupRestore').then(m => ({ default: m.BackupRestore })));
const Security2FA = lazy(() => import('../components/Security2FA').then(m => ({ default: m.Security2FA })));
const AutoRebalanceSettings = lazy(() => import('../components/AutoRebalanceSettings').then(m => ({ default: m.AutoRebalanceSettings })));

function ChartLoader() {
  return <div className="h-full w-full animate-pulse rounded-xl bg-gradient-to-b from-slate-100 to-slate-200 dark:from-gray-800 dark:to-gray-900" />;
}

export default function HomePage() {
  const navigate = useNavigate();
  const {
    holdings, loading, refreshing,
    livePnlData, historicalData,
    connectionStatus, lastUpdate,
    totalCashValue, notificationsEnabled, enableNotifications,
    handleAddHolding, handleUpdateHolding, handleDeleteHolding,
    pendingDeleteId, confirmDelete, cancelDelete,
    handleRefresh,
    portfolioMetrics,
    searchQuery, setSearchQuery,
    selectedAssetType, setSelectedAssetType,
    sortBy, setSortBy,
    sortOrder, setSortOrder,
    filteredAndSortedHoldings,
    targetAllocations, setTargetAllocations,
    toast,
  } = usePortfolio();

  const { theme, setTheme } = useTheme();
  const { isDark, toggle: toggleDarkMode } = useDarkMode();

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showExportImportModal, setShowExportImportModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [showAutoRebalanceModal, setShowAutoRebalanceModal] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => {
    return (localStorage.getItem('tandor_holdings_view') as 'table' | 'grid') || 'table';
  });
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [dynamic, setDynamic] = useState<DynamicWithdrawal | null>(null);

  useEffect(() => {
    getDynamicWithdrawal().then(setDynamic).catch(() => {});
  }, []);

  const {
    totalInvestment, totalCurrentValue,
    totalProfitLoss, totalProfitLossPercent,
  } = portfolioMetrics;

  useEffect(() => {
    if (viewMode === 'grid' && holdings.length > 0) {
      const symbols = [...new Set(holdings.map(h => h.symbol))];
      getSparklineData(symbols, 30).then(setSparklines);
    }
  }, [viewMode, holdings]);

  const handleViewModeChange = (mode: 'table' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('tandor_holdings_view', mode);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 animate-fade-in">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white dark:bg-gray-900 min-h-screen">

          <DashboardHeader
            connectionStatus={connectionStatus}
            refreshing={refreshing}
            isDark={isDark}
            notificationsEnabled={notificationsEnabled}
            onToggleDark={toggleDarkMode}
            onRefresh={handleRefresh}
            onAddHolding={() => setShowAddModal(true)}
            onShowAlerts={() => setShowAlertModal(true)}
            onShowExport={() => setShowExportImportModal(true)}
            onShowBackup={() => setShowBackupModal(true)}
            onShow2FA={() => setShow2FAModal(true)}
            onShowPerformance={() => navigate('/performance')}
            onShowAllocation={() => navigate('/allocation')}
            onShowAIAdvisor={() => navigate('/ai-advisor')}
            onShowResearch={() => navigate('/research')}
            onShowRebalanceModal={() => setShowRebalanceModal(true)}
            onEnableNotifications={enableNotifications}
            onThemeCycle={() => {
              const themes: Array<'light' | 'dark' | 'blue' | 'purple' | 'green'> = ['light', 'dark', 'blue', 'purple', 'green'];
              const currentIndex = themes.indexOf(theme);
              setTheme(themes[(currentIndex + 1) % themes.length]);
            }}
          />

          {/* Dashboard Content - Kiranism grid layout */}
          <div className="px-3 md:px-5 pt-4 pb-2 space-y-4">

            {/* Hero — Tremor modern dashboard */}
            {holdings.length > 0 && (
              <HeroDashboard
                holdings={holdings}
                totalCashValue={totalCashValue}
                dailyChange={livePnlData?.daily.change}
                dailyChangePct={livePnlData?.daily.percentage}
                historicalData={historicalData?.map(d => ({ date: d.date, value: Number(d.total_value) }))}
                dynamicSafeMaxUSD={dynamic?.safeMonthlyUSD}
                totalPnLTRY={totalProfitLoss}
                totalPnLPct={totalProfitLossPercent}
              />
            )}

            {/* 💰 Kâr Cüzdanı — ana maaş paneli */}
            {holdings.length > 0 && <KarCuzdani holdings={holdings} />}

            {/* Alerts strip */}
            {holdings.length > 0 && <SmartAlerts />}

            {/* Main 2-col grid: Chart left + Right rail */}
            {holdings.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left: Performance chart (2/3) */}
                <div className="lg:col-span-2">
                  <div className="card-secondary p-5 h-full">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="t-h3">Portföy Trendi</h3>
                        <p className="t-caption">Son dönemdeki değer değişimi</p>
                      </div>
                      <button
                        onClick={() => navigate('/performance')}
                        className="text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline"
                      >
                        Detay →
                      </button>
                    </div>
                    <div className="h-72 md:h-64">
                      <Suspense fallback={<ChartLoader />}>
                        {historicalData.length > 0 ? (
                          <PortfolioChart data={historicalData} type="area" />
                        ) : (
                          <div className="flex items-center justify-center h-full text-slate-300 dark:text-gray-600 text-sm">
                            Veri bekleniyor...
                          </div>
                        )}
                      </Suspense>
                    </div>
                  </div>
                </div>

                {/* Right rail: Tab'lı tek kart — X-Ray, Gelir, Çekim, Maaş, Temettü */}
                <div>
                  <RightRailTabs
                    holdings={holdings}
                    totalCashValue={totalCashValue}
                  />
                </div>
              </div>
            )}

            {/* AI Action Plan (full width, below) */}
            {holdings.length > 0 && (
              <DailyActionPlan
                holdings={holdings}
                totalValue={totalCurrentValue}
                totalInvestment={totalInvestment}
                totalProfitLoss={totalProfitLoss}
                totalProfitLossPercent={totalProfitLossPercent}
                totalCashValue={totalCashValue}
              />
            )}

          </div>

          {/* Holdings Table / Grid */}
          <div className="mt-2 mx-2 md:mx-6 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden">
            <div className="px-4 md:px-5 py-3 bg-slate-50/80 dark:bg-gray-800/50 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-300 tracking-wide">Varlıklar</h2>
                {holdings.length > 0 && (
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-gray-700 px-2 py-0.5 rounded-md border border-slate-200 dark:border-gray-600">
                    {holdings.length}
                  </span>
                )}
              </div>
              {holdings.length > 0 && (
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white dark:bg-gray-700 border border-slate-200 dark:border-gray-600">
                  <button
                    onClick={() => handleViewModeChange('table')}
                    className={`p-1.5 rounded transition-colors ${
                      viewMode === 'table'
                        ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300'
                        : 'text-slate-500 dark:text-gray-400 hover:text-slate-700'
                    }`}
                    title="Tablo görünümü"
                  >
                    <List size={14} />
                  </button>
                  <button
                    onClick={() => handleViewModeChange('grid')}
                    className={`p-1.5 rounded transition-colors ${
                      viewMode === 'grid'
                        ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300'
                        : 'text-slate-500 dark:text-gray-400 hover:text-slate-700'
                    }`}
                    title="Kart görünümü"
                  >
                    <LayoutGrid size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                viewMode === 'grid' ? (
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
                  </div>
                ) : (
                  <div className="p-4 space-y-1">
                    {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
                  </div>
                )
              ) : holdings.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <PieChart className="text-slate-300 dark:text-gray-600" size={28} />
                  </div>
                  <h3 className="text-base font-semibold text-slate-600 dark:text-gray-300 mb-1">Portfoyunuz bos</h3>
                  <p className="text-sm text-slate-400 dark:text-gray-500 mb-5 max-w-xs mx-auto">Takip etmek istediginiz ilk varliginizi ekleyerek baslayabilirsiniz.</p>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Plus size={16} />
                    Varlik Ekle
                  </button>
                </div>
              ) : (
                <>
                  <div className="px-4 md:px-5 pt-3 pb-1">
                    <HoldingsFilter
                      searchQuery={searchQuery}
                      onSearchChange={setSearchQuery}
                      selectedType={selectedAssetType}
                      onTypeChange={setSelectedAssetType}
                      sortBy={sortBy}
                      onSortChange={setSortBy}
                      sortOrder={sortOrder}
                      onSortOrderChange={setSortOrder}
                    />
                  </div>
                  {viewMode === 'grid' ? (
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {(() => {
                        const topByPnl = [...holdings]
                          .filter(h => h.purchase_price > 0)
                          .map(h => ({
                            id: h.id,
                            pnlPct: ((h.current_price - h.purchase_price) / h.purchase_price) * 100,
                          }))
                          .sort((a, b) => b.pnlPct - a.pnlPct)
                          .slice(0, 3);
                        const rankMap = new Map(topByPnl.map((h, i) => [h.id, i + 1]));
                        return filteredAndSortedHoldings.map((holding) => (
                          <HoldingCard
                            key={holding.id}
                            holding={holding}
                            sparklineData={sparklines[holding.symbol]}
                            rank={rankMap.get(holding.id)}
                            onEdit={setEditingHolding}
                            onDelete={handleDeleteHolding}
                            onTransactionComplete={handleRefresh}
                          />
                        ));
                      })()}
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-gray-800">
                          <th className="px-3 md:px-5 py-2.5 text-left text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider">Varlık</th>
                          <th className="px-3 md:px-5 py-2.5 text-right text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider hidden sm:table-cell">Alış</th>
                          <th className="px-3 md:px-5 py-2.5 text-right text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider hidden md:table-cell">Miktar</th>
                          <th className="px-3 md:px-5 py-2.5 text-right text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider">Fiyat</th>
                          <th className="px-3 md:px-5 py-2.5 text-right text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider hidden lg:table-cell">Değer</th>
                          <th className="px-3 md:px-5 py-2.5 text-right text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider">K/Z</th>
                          <th className="px-3 md:px-5 py-2.5 text-right text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-gray-800/50">
                        {filteredAndSortedHoldings.map((holding) => (
                          <HoldingRow
                            key={holding.id}
                            holding={holding}
                            onEdit={setEditingHolding}
                            onDelete={handleDeleteHolding}
                            onTransactionComplete={handleRefresh}
                          />
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Analytics Toggle */}
          {holdings.length > 0 && (
            <div className="mx-4 md:mx-6 mt-4 mb-2">
              <button
                onClick={() => setShowCharts(!showCharts)}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  showCharts
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800'
                    : 'bg-slate-50 dark:bg-gray-800 text-slate-500 dark:text-gray-400 border border-slate-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-gray-600 hover:text-slate-600 dark:hover:text-gray-300'
                }`}
              >
                <BarChart3 size={15} />
                {showCharts ? 'Dağılımı Gizle' : 'Dağılım ve İşlem Geçmişi'}
              </button>
            </div>
          )}

          {showCharts && holdings.length > 0 && (
            <div className="px-3 md:px-5 pb-4 space-y-3">
              <Suspense fallback={<ChartLoader />}>
                <div className="card-secondary p-5">
                  <h3 className="t-h3 mb-3">Varlık Dağılımı</h3>
                  <div className="h-72">
                    <AllocationChart holdings={holdings} />
                  </div>
                </div>
                <TransactionHistory />
              </Suspense>
            </div>
          )}
        </div>

        {/* Minimal Status Bar */}
        <div className="px-4 md:px-6 py-1.5 bg-slate-50 dark:bg-gray-900 border-t border-slate-100 dark:border-gray-800">
          <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-600">
            <div className="flex items-center gap-2">
              <div className={`w-1 h-1 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-400' :
                connectionStatus === 'connecting' ? 'bg-yellow-400' :
                connectionStatus === 'error' ? 'bg-red-400' : 'bg-slate-300'
              }`} />
              <span>{connectionStatus === 'connected' ? 'Canli' : connectionStatus === 'connecting' ? 'Baglaniyor' : connectionStatus === 'error' ? 'Hata' : 'Cevrimdisi'}</span>
            </div>
            {lastUpdate && <span className="truncate max-w-[200px]">{lastUpdate}</span>}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddHoldingModal onClose={() => setShowAddModal(false)} onAdd={handleAddHolding} />
      )}
      {editingHolding && (
        <EditHoldingModal holding={editingHolding} onClose={() => setEditingHolding(null)} onUpdate={handleUpdateHolding} />
      )}
      <Suspense fallback={null}>
        {showRebalanceModal && (
          <RebalanceModal
            allocations={calculateRebalance(holdings, targetAllocations)}
            onClose={() => setShowRebalanceModal(false)}
            onUpdateTargets={(targets) => setTargetAllocations(targets)}
          />
        )}
        {showExportImportModal && (
          <ExportImportModal isOpen={showExportImportModal} onClose={() => setShowExportImportModal(false)} onImportComplete={handleRefresh} />
        )}
        {showAlertModal && (
          <PriceAlertModal onClose={() => setShowAlertModal(false)} onAdd={() => { setShowAlertModal(false); handleRefresh(); }} />
        )}
        {showBackupModal && (
          <BackupRestore onClose={() => setShowBackupModal(false)} onComplete={handleRefresh} />
        )}
        {show2FAModal && (
          <Security2FA onClose={() => setShow2FAModal(false)} onEnable={() => { toast.addToast('2FA başarıyla etkinleştirildi!', 'success'); }} />
        )}
        {showAutoRebalanceModal && (
          <AutoRebalanceSettings
            onClose={() => setShowAutoRebalanceModal(false)}
            onSave={() => { toast.addToast('Otomatik rebalance ayarları kaydedildi!', 'success'); handleRefresh(); }}
          />
        )}
      </Suspense>

      {pendingDeleteId && (
        <ConfirmDialog
          title="Varlığı Sil"
          message="Bu varlığı silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
          confirmLabel="Sil"
          cancelLabel="İptal"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
      <InstallPWA />
      <PriceUpdateNotification />
    </div>
  );
}

// Sağ ray: Plan, X-Ray, Gelir, Temettü tab'ları (Çekim ve Maaş tab'ları Kâr Cüzdanı'na taşındı)
type RightRailTab = 'rebalance' | 'xray' | 'income' | 'dividend';

function RightRailTabs({ holdings, totalCashValue }: { holdings: Holding[]; totalCashValue: number }) {
  const [tab, setTab] = useState<RightRailTab>('rebalance');
  const tabs: { key: RightRailTab; label: string }[] = [
    { key: 'rebalance', label: 'Plan' },
    { key: 'xray', label: 'X-Ray' },
    { key: 'income', label: 'Gelir' },
    { key: 'dividend', label: 'Temettü' },
  ];

  return (
    <div className="card-secondary p-3 md:p-4">
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>
        {tab === 'rebalance' && <RebalancePlan holdings={holdings} totalCashValue={totalCashValue} />}
        {tab === 'xray' && <PortfolioXRay />}
        {tab === 'income' && <IncomeWidget />}
        {tab === 'dividend' && <DividendInvestmentPlanner holdings={holdings} totalCashValue={totalCashValue} />}
      </div>
    </div>
  );
}
