export interface BenchmarkPoint {
  date: string;
  value: number;
}

export interface BenchmarkSeries {
  symbol: string;
  series: BenchmarkPoint[];
}

const BENCHMARKS = {
  XU100: { symbol: '^XU100', label: 'BIST 100' },
  SPX: { symbol: '^GSPC', label: 'S&P 500' },
  GOLD: { symbol: 'GC=F', label: 'Altın (USD)' },
} as const;

export type BenchmarkKey = keyof typeof BENCHMARKS;

export const BENCHMARK_OPTIONS: { key: BenchmarkKey; label: string }[] = [
  { key: 'XU100', label: BENCHMARKS.XU100.label },
  { key: 'SPX', label: BENCHMARKS.SPX.label },
  { key: 'GOLD', label: BENCHMARKS.GOLD.label },
];

export async function getBenchmarkHistory(
  key: BenchmarkKey,
  days: number
): Promise<BenchmarkSeries | null> {
  const cfg = BENCHMARKS[key];
  if (!cfg) return null;

  try {
    const params = new URLSearchParams({
      type: 'benchmark-history',
      symbol: cfg.symbol,
      days: String(days),
    });
    const res = await fetch(`/api/price-proxy?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.success) return null;
    return data.data as BenchmarkSeries;
  } catch {
    return null;
  }
}
