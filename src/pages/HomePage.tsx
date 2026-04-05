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
import { FinancialCoach } from '../components/FinancialCoach';
import { DailyActionPlan } from '../components/DailyActionPlan';
import { SmartAlerts } from '../components/SmartAlerts';
import { AssetBreakdownWidget } from '../components/AssetBreakdownWidget';
import { DashboardHeader } from '../components/DashboardHeader';
import { PortfolioMetricsBar } from '../components/PortfolioMetricsBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DailyMonthlyPnL } from '../components/DailyMonthlyPnL';
import InstallPWA from '../components/InstallPWA';
import { PriceUpdateNotification } from '../components/PriceUpdateNotification';

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
const TaxCalculator = lazy(() => import('../components/TaxCalculator').then(m => ({ default: m.TaxCalculator })));
const InvestmentGoals = lazy(() => import('../components/InvestmentGoals').then(m => ({ default: m.InvestmentGoals })));
const DCAPlanner = lazy(() => import('../components/DCAPlanner').then(m => ({ default: m.DCAPlanner })));

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

          {/* Dashboard Content - Clean, minimal */}
          <div className="px-3 md:px-5 pt-4 pb-2 space-y-3">

            {/* Alerts - only when critical */}
            {holdings.length > 0 && <SmartAlerts />}

            {/* AI Action Plan - the core feature */}
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

            {/* PnL Cards - compact row */}
            {livePnlData && (
              <div className="grid grid-cols-3 gap-2">
                <PnLCard data={livePnlData.daily} />
                <PnLCard data={livePnlData.weekly} />
                <PnLCard data={livePnlData.monthly} />
              </div>
            )}
          </div>

          {/* Holdings Table */}
          <div className="mt-2 mx-2 md:mx-6 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden">
            <div className="px-4 md:px-5 py-3 bg-slate-50/80 dark:bg-gray-800/50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-300 tracking-wide">Varliklar</h2>
              {holdings.length > 0 && (
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-gray-700 px-2 py-0.5 rounded-md border border-slate-200 dark:border-gray-600">
                  {holdings.length}
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-200 border-t-blue-600 dark:border-gray-600 dark:border-t-blue-400"></div>
                  <p className="mt-3 text-sm text-slate-400 dark:text-gray-500">Yukleniyor...</p>
                </div>
              ) : holdings.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <PieChart className="text-slate-300 dark:text-gray-600" size={28} />
                  </div>
                  <h3 className="text-base font-semibold text-slate-600 dark:text-gray-300 mb-1">Portfoyunuz bos</h3>
                  <p className="text-sm text-slate-400 dark:text-gray-500 mb-5 max-w-xs mx-auto">Takip etmek istediginiz ilk varliginizi ekleyerek baslayabilirsiniz.</p>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
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
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-gray-800">
                        <th className="px-3 md:px-5 py-2.5 text-left text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider">Varlik</th>
                        <th className="px-3 md:px-5 py-2.5 text-right text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider hidden sm:table-cell">Alis</th>
                        <th className="px-3 md:px-5 py-2.5 text-right text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider hidden md:table-cell">Miktar</th>
                        <th className="px-3 md:px-5 py-2.5 text-right text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider">Fiyat</th>
                        <th className="px-3 md:px-5 py-2.5 text-right text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider hidden lg:table-cell">Deger</th>
                        <th className="px-3 md:px-5 py-2.5 text-right text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider">K/Z</th>
                        <th className="px-3 md:px-5 py-2.5 text-right text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-gray-800/50">
                      {filteredAndSortedHoldings.map((holding, idx) => (
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

          {/* Analytics Toggle */}
          {holdings.length > 0 && (
            <div className="mx-4 md:mx-6 mt-4 mb-2">
              <button
                onClick={() => setShowCharts(!showCharts)}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  showCharts
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                    : 'bg-slate-50 dark:bg-gray-800 text-slate-500 dark:text-gray-400 border border-slate-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-gray-600 hover:text-slate-600 dark:hover:text-gray-300'
                }`}
              >
                <BarChart3 size={15} />
                {showCharts ? 'Grafikleri Gizle' : 'Grafikleri ve Analizleri Gor'}
              </button>
            </div>
          )}

          {showCharts && holdings.length > 0 && (
            <div className="px-3 md:px-5 pb-4 space-y-3">
              <Suspense fallback={<ChartLoader />}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-slate-200 dark:border-gray-700">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Performans</h3>
                    <div className="h-56">
                      {historicalData.length > 0 ? (
                        <PortfolioChart data={historicalData} type="area" />
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-300 dark:text-gray-600 text-sm">Veri bekleniyor...</div>
                      )}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-slate-200 dark:border-gray-700">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Dağılım</h3>
                    <div className="h-56">
                      <AllocationChart holdings={holdings} />
                    </div>
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
