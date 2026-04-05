import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, TrendingUp, BarChart3, Activity, PieChart, RefreshCw } from 'lucide-react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useTheme } from '../hooks/useTheme';
import { useDarkMode } from '../hooks/useDarkMode';
import { calculateRebalance } from '../services/analyticsService';
import { Holding } from '../lib/supabase';

// Core components (always loaded)
import { AddHoldingModal } from '../components/AddHoldingModal';
import { EditHoldingModal } from '../components/EditHoldingModal';
import { HoldingRow } from '../components/HoldingRow';
import { PnLCard } from '../components/PnLCard';
import { DailyGainPanel } from '../components/DailyGainPanel';
import { ProfitSummary } from '../components/ProfitSummary';
import { HoldingsFilter } from '../components/HoldingsFilter';
import { ToastContainer } from '../components/Toast';
import { CashDashboard } from '../components/CashDashboard';
import { PerformanceDashboard } from '../components/PerformanceDashboard';
import { AssetBreakdownWidget } from '../components/AssetBreakdownWidget';
import { DashboardHeader } from '../components/DashboardHeader';
import { PortfolioMetricsBar } from '../components/PortfolioMetricsBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DailyMonthlyPnL } from '../components/DailyMonthlyPnL';
import InstallPWA from '../components/InstallPWA';
import { PriceUpdateNotification } from '../components/PriceUpdateNotification';
import { APIHealthMonitor } from '../components/APIHealthMonitor';

// Lazy loaded components (charts, modals, analytics - loaded on demand)
const RebalanceModal = lazy(() => import('../components/RebalanceModal').then(m => ({ default: m.RebalanceModal })));
const PortfolioChart = lazy(() => import('../components/PortfolioChart').then(m => ({ default: m.PortfolioChart })));
const AllocationChart = lazy(() => import('../components/AllocationChart').then(m => ({ default: m.AllocationChart })));
const TransactionHistory = lazy(() => import('../components/TransactionHistory').then(m => ({ default: m.TransactionHistory })));
const AchievementBadges = lazy(() => import('../components/AchievementBadges').then(m => ({ default: m.AchievementBadges })));
const PriceAlertModal = lazy(() => import('../components/PriceAlertModal').then(m => ({ default: m.PriceAlertModal })));
const RiskMetrics = lazy(() => import('../components/RiskMetrics').then(m => ({ default: m.RiskMetrics })));
const ScenarioAnalysis = lazy(() => import('../components/ScenarioAnalysis').then(m => ({ default: m.ScenarioAnalysis })));
const WithdrawalCalculator = lazy(() => import('../components/WithdrawalCalculator').then(m => ({ default: m.WithdrawalCalculator })));
const QuickProfitWithdrawal = lazy(() => import('../components/QuickProfitWithdrawal').then(m => ({ default: m.QuickProfitWithdrawal })));
const ExportImportModal = lazy(() => import('../components/ExportImportModal').then(m => ({ default: m.ExportImportModal })));
const TradingSignals = lazy(() => import('../components/TradingSignals').then(m => ({ default: m.TradingSignals })));
const AdvancedChart = lazy(() => import('../components/AdvancedChart').then(m => ({ default: m.AdvancedChart })));
const BackupRestore = lazy(() => import('../components/BackupRestore').then(m => ({ default: m.BackupRestore })));
const AIPortfolioSuggestions = lazy(() => import('../components/AIPortfolioSuggestions').then(m => ({ default: m.AIPortfolioSuggestions })));
const MultiBenchmark = lazy(() => import('../components/MultiBenchmark').then(m => ({ default: m.MultiBenchmark })));
const AdvancedAnalytics = lazy(() => import('../components/AdvancedAnalytics').then(m => ({ default: m.AdvancedAnalytics })));
const Security2FA = lazy(() => import('../components/Security2FA').then(m => ({ default: m.Security2FA })));
const AutoRebalanceSettings = lazy(() => import('../components/AutoRebalanceSettings').then(m => ({ default: m.AutoRebalanceSettings })));

function ChartLoader() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
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

  const {
    totalInvestment, totalCurrentValue,
    totalProfitLoss, totalProfitLossPercent,
    totalInvestmentUSD, totalCurrentValueUSD, grandTotalUSD,
  } = portfolioMetrics;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-slate-900">
      <div className="max-w-7xl mx-auto px-3 md:px-4 py-4 md:py-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-200/50 dark:border-gray-700/50">

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
            onShowAnalytics={() => navigate('/analytics')}
            onShowAllocation={() => navigate('/allocation')}
            onShowRebalancing={() => navigate('/rebalancing')}
            onShowScenario={() => navigate('/scenario')}
            onShowAIAdvisor={() => navigate('/ai-advisor')}
            onShowRebalanceModal={() => setShowRebalanceModal(true)}
            onEnableNotifications={enableNotifications}
            onThemeCycle={() => {
              const themes: Array<'light' | 'dark' | 'blue' | 'purple' | 'green'> = ['light', 'dark', 'blue', 'purple', 'green'];
              const currentIndex = themes.indexOf(theme);
              setTheme(themes[(currentIndex + 1) % themes.length]);
            }}
          />

          <PortfolioMetricsBar
            holdings={holdings}
            totalInvestment={totalInvestment}
            totalCurrentValue={totalCurrentValue}
            totalProfitLoss={totalProfitLoss}
            totalProfitLossPercent={totalProfitLossPercent}
            totalInvestmentUSD={totalInvestmentUSD}
            totalCurrentValueUSD={totalCurrentValueUSD}
            grandTotalUSD={grandTotalUSD}
            livePnlData={livePnlData}
            totalCashValue={totalCashValue}
          />

          {/* Dashboard Content */}
          <div className="p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 border-b border-slate-200 dark:border-gray-700 space-y-5">

            {holdings.length > 0 && (
              <PerformanceDashboard holdings={holdings} totalValue={totalCurrentValue} totalInvestment={totalInvestment} />
            )}

            {holdings.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2">
                  <ProfitSummary unrealizedProfit={totalProfitLoss} unrealizedProfitPercent={totalProfitLossPercent} />
                </div>
                <AssetBreakdownWidget holdings={holdings} totalValue={totalCurrentValue} />
              </div>
            )}

            {livePnlData && (
              <>
                <CashDashboard />
                {holdings.length > 0 && (
                  <DailyGainPanel holdings={holdings} totalDailyChange={livePnlData.daily.change} totalDailyPct={livePnlData.daily.percentage} />
                )}
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                    <TrendingUp className="text-blue-600" size={18} />
                    Periyodik PnL
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <PnLCard data={livePnlData.daily} />
                    <PnLCard data={livePnlData.weekly} />
                    <PnLCard data={livePnlData.monthly} />
                  </div>
                </div>
              </>
            )}

            {holdings.length > 0 && <DailyMonthlyPnL />}

            {/* Charts Toggle */}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 dark:text-gray-200 flex items-center gap-2">
                <BarChart3 className="text-blue-600" size={18} />
                Grafikler & Analizler
              </h3>
              <button
                onClick={() => setShowCharts(!showCharts)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                  showCharts
                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                    : 'bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300 border-slate-200 dark:border-gray-600 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                <BarChart3 size={16} />
                {showCharts ? 'Gizle' : 'Göster'}
              </button>
            </div>

            {showCharts && holdings.length > 0 && (
              <Suspense fallback={<ChartLoader />}>
                <TradingSignals holdings={holdings} />
                <AIPortfolioSuggestions holdings={holdings} totalValue={totalCurrentValue} />
                <AdvancedAnalytics holdings={holdings} totalValue={totalCurrentValue} totalInvestment={totalInvestment} />
                <MultiBenchmark portfolioValue={totalCurrentValue} initialValue={totalInvestment} />

                {holdings.length > 0 && (
                  <AdvancedChart symbol={holdings[0].symbol} currentPrice={holdings[0].current_price} />
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 hover:shadow-md transition-shadow">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                      <BarChart3 className="text-blue-600" size={18} />
                      Portföy Performansı
                    </h3>
                    <div className="h-72">
                      {historicalData.length > 0 ? (
                        <PortfolioChart data={historicalData} type="area" />
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500">
                          <p className="text-sm">Henüz geçmiş veri yok. Lütfen bekleyin...</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 hover:shadow-md transition-shadow">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                      <PieChart className="text-blue-600" size={18} />
                      Varlık Dağılımı
                    </h3>
                    <div className="h-72">
                      <AllocationChart holdings={holdings} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <RiskMetrics />
                  <ScenarioAnalysis holdings={holdings} currentValue={totalCurrentValue} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <TransactionHistory />
                  <AchievementBadges
                    stats={{
                      totalHoldings: holdings.length,
                      totalValue: totalCurrentValue,
                      totalPnL: totalProfitLoss,
                      assetTypes: [...new Set(holdings.map((h) => h.asset_type))],
                      positiveDays: 0,
                      totalDividends: 0,
                      totalTransactions: 0,
                    }}
                  />
                </div>
              </Suspense>
            )}
          </div>

          {/* Holdings Table */}
          <div>
            <div className="px-4 md:px-6 py-4 flex items-center gap-3 border-b border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Activity size={16} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-base font-bold text-slate-800 dark:text-gray-200">Varlık Portföyü</h2>
              {holdings.length > 0 && (
                <span className="ml-auto text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-gray-700 px-2.5 py-1 rounded-full">
                  {holdings.length} varlık
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
                  <p className="mt-4 text-slate-500 dark:text-gray-400 font-medium">Yükleniyor...</p>
                </div>
              ) : holdings.length === 0 ? (
                <div className="text-center py-20 px-4">
                  <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <TrendingUp className="text-blue-400 dark:text-blue-500" size={36} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-700 dark:text-gray-200 mb-2">Henüz varlık eklemediniz</h3>
                  <p className="text-slate-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">Portföyünüzü takip etmeye başlamak için ilk varlığınızı ekleyin</p>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-bold shadow-lg hover:shadow-xl hover:scale-105"
                  >
                    <Plus size={20} />
                    İlk Varlığı Ekle
                  </button>
                </div>
              ) : (
                <>
                  <div className="px-4 md:px-8 pt-6">
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
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700">
                      <tr>
                        <th className="px-3 md:px-6 py-3 md:py-4 text-left text-xs md:text-sm font-semibold text-slate-700 dark:text-gray-300">Varlık</th>
                        <th className="px-3 md:px-6 py-3 md:py-4 text-right text-xs md:text-sm font-semibold text-slate-700 dark:text-gray-300 hidden sm:table-cell">Alış Fiyatı</th>
                        <th className="px-3 md:px-6 py-3 md:py-4 text-right text-xs md:text-sm font-semibold text-slate-700 dark:text-gray-300 hidden md:table-cell">Miktar</th>
                        <th className="px-3 md:px-6 py-3 md:py-4 text-right text-xs md:text-sm font-semibold text-slate-700 dark:text-gray-300">Güncel Fiyat</th>
                        <th className="px-3 md:px-6 py-3 md:py-4 text-right text-xs md:text-sm font-semibold text-slate-700 dark:text-gray-300 hidden lg:table-cell">Toplam Değer</th>
                        <th className="px-3 md:px-6 py-3 md:py-4 text-right text-xs md:text-sm font-semibold text-slate-700 dark:text-gray-300">Kar/Zarar</th>
                        <th className="px-3 md:px-6 py-3 md:py-4 text-right text-xs md:text-sm font-semibold text-slate-700 dark:text-gray-300">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody>
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
                </>
              )}
            </div>
          </div>
        </div>

        {holdings.length > 0 && (
          <Suspense fallback={<ChartLoader />}>
            <div className="mt-6 space-y-4">
              <QuickProfitWithdrawal holdings={holdings} onWithdrawalComplete={handleRefresh} />
              <WithdrawalCalculator holdings={holdings} />
            </div>
          </Suspense>
        )}

        {/* Status Bar */}
        <div className="mt-4 mb-2">
          <div className="bg-white dark:bg-gray-800 px-5 py-3 rounded-xl border border-slate-200 dark:border-gray-700 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {connectionStatus === 'connected' ? (
                <div className="flex items-center gap-1.5">
                  <Activity className="text-green-500 animate-pulse" size={14} />
                  <span className="text-xs font-semibold text-green-600 dark:text-green-400">WebSocket Aktif</span>
                </div>
              ) : connectionStatus === 'connecting' ? (
                <div className="flex items-center gap-1.5">
                  <RefreshCw className="text-yellow-500 animate-spin" size={14} />
                  <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">Bağlanıyor...</span>
                </div>
              ) : connectionStatus === 'error' ? (
                <div className="flex items-center gap-1.5">
                  <Activity className="text-red-500" size={14} />
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">Bağlantı Hatası</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Activity className="text-slate-400" size={14} />
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Çevrimdışı</span>
                </div>
              )}
              <div className="h-3 w-px bg-slate-200 dark:bg-gray-600"></div>
              <div className="flex items-center gap-1.5">
                <RefreshCw className="text-blue-500" size={14} />
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">REST API (30s)</span>
              </div>
            </div>
            {lastUpdate && (
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-xs">Son: {lastUpdate}</p>
            )}
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
      <APIHealthMonitor />
    </div>
  );
}
