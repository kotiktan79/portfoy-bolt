import { useMemo, useState } from 'react';
import { ArrowRight, FlaskConical, Plus, Trash2, AlertCircle } from 'lucide-react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { AssetType } from '../lib/supabase';
import { applyTrades, ProposedTrade } from '../services/tradeSimulatorService';
import { analyzeXRay } from '../services/xrayService';
import { forecastDividends } from '../services/dividendForecastService';
import { formatCurrency } from '../services/priceService';
import { Card, CardHeader, CardBody } from './ui/Card';

const ASSET_TYPES: AssetType[] = ['stock', 'crypto', 'currency', 'fund', 'eurobond', 'commodity'];
const ASSET_LABELS: Record<AssetType, string> = {
  stock: 'Hisse', crypto: 'Kripto', currency: 'Döviz',
  fund: 'Fon', eurobond: 'Eurobond', commodity: 'Emtia', cash: 'Nakit',
};

function newTrade(action: 'sell' | 'buy'): ProposedTrade {
  return {
    id: `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action,
    symbol: '',
    assetType: 'stock',
    amountTry: 0,
  };
}

export default function TradeSimulator() {
  const { holdings } = usePortfolio();
  const [trades, setTrades] = useState<ProposedTrade[]>([]);

  const sim = useMemo(() => applyTrades(holdings, trades), [holdings, trades]);

  const beforeXRay = useMemo(() => analyzeXRay(holdings), [holdings]);
  const afterXRay = useMemo(() => analyzeXRay(sim.afterHoldings), [sim.afterHoldings]);
  const beforeDiv = useMemo(() => forecastDividends(holdings), [holdings]);
  const afterDiv = useMemo(() => forecastDividends(sim.afterHoldings), [sim.afterHoldings]);

  function addTrade(action: 'sell' | 'buy') {
    setTrades(t => [...t, newTrade(action)]);
  }

  function updateTrade(id: string, updates: Partial<ProposedTrade>) {
    setTrades(t => t.map(tr => (tr.id === id ? { ...tr, ...updates } : tr)));
  }

  function removeTrade(id: string) {
    setTrades(t => t.filter(tr => tr.id !== id));
  }

  if (holdings.length === 0) return null;

  const valueDelta = afterXRay.totalValue - beforeXRay.totalValue;
  const fxDelta = afterXRay.effectiveCurrencyPct - beforeXRay.effectiveCurrencyPct;
  const concDelta = (afterXRay.topConcentration?.weight || 0) - (beforeXRay.topConcentration?.weight || 0);
  const incomeDelta = afterDiv.annualTotal - beforeDiv.annualTotal;
  const healthDelta = afterXRay.healthScore - beforeXRay.healthScore;

  return (
    <Card>
      <CardHeader
        icon={FlaskConical}
        iconTone="brand"
        title="Trade Simülatörü"
        subtitle={'"Eğer satıp alsam" — gerçek alım-satım yapmadan etkisini gör'}
      />
      <CardBody>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => addTrade('sell')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-semibold hover:bg-red-200 dark:hover:bg-red-900/50"
          >
            <Plus size={12} /> Satış Ekle
          </button>
          <button
            onClick={() => addTrade('buy')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-400 text-xs font-semibold hover:bg-accent-200 dark:hover:bg-accent-900/50"
          >
            <Plus size={12} /> Alış Ekle
          </button>
          {trades.length > 0 && (
            <button
              onClick={() => setTrades([])}
              className="ml-auto text-[11px] text-gray-500 hover:text-red-600 underline"
            >
              Hepsini sıfırla
            </button>
          )}
        </div>

        {trades.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400 italic">
            Hipotezini test etmek için satış/alış ekle (örn: ₺250K EURO sat, ₺100K AKBNK + ₺100K BIMAS al)
          </div>
        ) : (
          <div className="space-y-2">
            {trades.map(trade => (
              <TradeRow
                key={trade.id}
                trade={trade}
                onUpdate={u => updateTrade(trade.id, u)}
                onRemove={() => removeTrade(trade.id)}
                holdings={holdings}
              />
            ))}
          </div>
        )}

        {trades.length > 0 && (
          <>
            <div className="rounded-xl border border-slate-200 dark:border-gray-800 p-3 bg-slate-50/50 dark:bg-gray-800/30 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-600 dark:text-gray-400">Net nakit akışı</span>
                <span className={`font-bold tabular-nums ${
                  sim.netCashFlow > 0 ? 'text-accent-600' : sim.netCashFlow < 0 ? 'text-red-600' : 'text-gray-500'
                }`}>
                  {sim.netCashFlow >= 0 ? '+' : ''}
                  {formatCurrency(sim.netCashFlow, 0)} ₺
                  <span className="ml-1 font-normal text-gray-500">
                    ({sim.netCashFlow > 0 ? 'cep dışına' : sim.netCashFlow < 0 ? 'ek nakit gerek' : 'dengede'})
                  </span>
                </span>
              </div>
              {sim.warnings.length > 0 && (
                <div className="space-y-1">
                  {sim.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Etki Karşılaştırması
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <CompareCard
                  label="Sağlık Skoru"
                  before={`${beforeXRay.healthScore}`}
                  after={`${afterXRay.healthScore}`}
                  delta={healthDelta}
                  positiveIsGood
                />
                <CompareCard
                  label="Döviz Maruziyeti"
                  before={`%${beforeXRay.effectiveCurrencyPct.toFixed(1)}`}
                  after={`%${afterXRay.effectiveCurrencyPct.toFixed(1)}`}
                  delta={fxDelta}
                  positiveIsGood={false}
                  unit="pp"
                />
                <CompareCard
                  label="En Büyük Pozisyon"
                  before={beforeXRay.topConcentration ? `%${beforeXRay.topConcentration.weight.toFixed(1)}` : '–'}
                  after={afterXRay.topConcentration ? `%${afterXRay.topConcentration.weight.toFixed(1)}` : '–'}
                  delta={concDelta}
                  positiveIsGood={false}
                  unit="pp"
                />
                <CompareCard
                  label="Yıllık Temettü"
                  before={`${formatCurrency(beforeDiv.annualTotal, 0)} ₺`}
                  after={`${formatCurrency(afterDiv.annualTotal, 0)} ₺`}
                  delta={incomeDelta}
                  positiveIsGood
                  unit="₺"
                  formatDelta
                />
                <CompareCard
                  label="Ölü Para"
                  before={`${beforeXRay.deadMoneyCount} pozisyon`}
                  after={`${afterXRay.deadMoneyCount} pozisyon`}
                  delta={afterXRay.deadMoneyCount - beforeXRay.deadMoneyCount}
                  positiveIsGood={false}
                />
                <CompareCard
                  label="Toplam Değer"
                  before={`${formatCurrency(beforeXRay.totalValue, 0)} ₺`}
                  after={`${formatCurrency(afterXRay.totalValue, 0)} ₺`}
                  delta={valueDelta}
                  positiveIsGood
                  unit="₺"
                  formatDelta
                />
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function TradeRow({ trade, onUpdate, onRemove, holdings }: {
  trade: ProposedTrade;
  onUpdate: (u: Partial<ProposedTrade>) => void;
  onRemove: () => void;
  holdings: { symbol: string; asset_type: AssetType }[];
}) {
  const isSell = trade.action === 'sell';
  const portfolioSymbols = [...new Set(holdings.map(h => h.symbol))].sort();

  return (
    <div className={`flex flex-wrap items-center gap-1.5 p-2 rounded-xl border ${
      isSell
        ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
        : 'bg-accent-50/50 dark:bg-accent-950/20 border-accent-200 dark:border-accent-900'
    }`}>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
        isSell
          ? 'bg-red-200 dark:bg-red-900/60 text-red-800 dark:text-red-300'
          : 'bg-accent-200 dark:bg-accent-900/60 text-accent-800 dark:text-accent-300'
      }`}>
        {isSell ? 'SAT' : 'AL'}
      </span>

      {isSell ? (
        <select
          value={trade.symbol}
          onChange={e => onUpdate({ symbol: e.target.value })}
          className="px-2 py-1 rounded text-xs font-semibold bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700"
        >
          <option value="">Sembol seç</option>
          {portfolioSymbols.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={trade.symbol}
          onChange={e => onUpdate({ symbol: e.target.value.toUpperCase() })}
          placeholder="Sembol"
          className="px-2 py-1 rounded text-xs font-semibold w-24 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 uppercase"
        />
      )}

      {!isSell && (
        <select
          value={trade.assetType}
          onChange={e => onUpdate({ assetType: e.target.value as AssetType })}
          className="px-2 py-1 rounded text-xs bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700"
        >
          {ASSET_TYPES.map(t => (
            <option key={t} value={t}>{ASSET_LABELS[t]}</option>
          ))}
        </select>
      )}

      <input
        type="number"
        value={trade.amountTry || ''}
        onChange={e => onUpdate({ amountTry: Math.max(0, parseFloat(e.target.value) || 0) })}
        placeholder="Tutar ₺"
        step={1000}
        className="px-2 py-1 rounded text-xs w-28 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 tabular-nums"
      />

      <button
        onClick={onRemove}
        className="ml-auto p-1 text-gray-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function CompareCard({
  label,
  before,
  after,
  delta,
  positiveIsGood,
  unit = '',
  formatDelta,
}: {
  label: string;
  before: string;
  after: string;
  delta: number;
  positiveIsGood: boolean;
  unit?: string;
  formatDelta?: boolean;
}) {
  const isImprovement = positiveIsGood ? delta > 0 : delta < 0;
  const noChange = Math.abs(delta) < 0.01;
  const color = noChange
    ? 'text-gray-400'
    : isImprovement
    ? 'text-accent-600 dark:text-accent-400'
    : 'text-red-600 dark:text-red-400';

  const deltaStr = noChange
    ? '—'
    : `${delta > 0 ? '+' : ''}${formatDelta ? formatCurrency(delta, 0) : delta.toFixed(unit === 'pp' ? 1 : 0)}${unit}`;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-800/30 p-2">
      <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
      </div>
      <div className="flex items-center gap-1 mt-1">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-500 tabular-nums">{before}</span>
        <ArrowRight size={9} className="text-gray-400" />
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">{after}</span>
      </div>
      <div className={`text-[11px] font-semibold tabular-nums ${color}`}>
        {deltaStr}
      </div>
    </div>
  );
}
