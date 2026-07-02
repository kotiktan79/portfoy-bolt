import crypto from 'crypto';

// Binance gerçek-hesap senkronu.
// price_notes = 'Binance - otomatik aktarım' olan kripto holding'lerin adedini
// VE USDC currency holding'ini Binance'teki GERÇEK bakiyeye eşitler.
//
// Bakiye = Spot + Funding + Simple-Earn (flexible) toplamı. Bir varlık artık
// hesapta yoksa adet 0'a çekilir (örn. düşüşte satılıp USDC'ye dönmüş pozisyon).
//
// NOT: api/v3/account TEK BAŞINA sadece spot'u verir; gerçek varlıklar Earn/
// Funding'de olabildiği için üç cüzdan birleştirilir.

const BINANCE_NOTE = 'Binance - otomatik aktarım';

function cleanKey(v: string | undefined): string {
  // Vercel env'e kazara kaçmış literal "\n" / boşlukları temizle (bilinen tuzak).
  return (v || '').replace(/\\n$/, '').replace(/\s+/g, '');
}

function sign(query: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

async function signedGet(path: string, key: string, secret: string): Promise<any> {
  const q = `timestamp=${Date.now()}&recvWindow=10000`;
  const sig = sign(q, secret);
  const res = await fetch(`https://api.binance.com${path}?${q}&signature=${sig}`, {
    headers: { 'X-MBX-APIKEY': key },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

async function signedPost(path: string, key: string, secret: string): Promise<any> {
  const q = `timestamp=${Date.now()}&recvWindow=10000`;
  const sig = sign(q, secret);
  const res = await fetch(`https://api.binance.com${path}?${q}&signature=${sig}`, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': key },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

/** Spot + Funding + Earn(flexible) toplam bakiyesini asset→miktar map'i olarak döner. */
async function fetchRealBalances(key: string, secret: string): Promise<Record<string, number>> {
  const totals: Record<string, number> = {};
  const add = (asset: string, amt: number) => {
    if (!asset || !isFinite(amt) || amt <= 0) return;
    totals[asset] = (totals[asset] || 0) + amt;
  };

  // Spot
  const acc = await signedGet('/api/v3/account', key, secret);
  for (const b of acc.balances || []) {
    add(b.asset, (parseFloat(b.free) || 0) + (parseFloat(b.locked) || 0));
  }
  // Funding (POST) — best-effort
  try {
    const fund = await signedPost('/sapi/v1/asset/get-funding-asset', key, secret);
    if (Array.isArray(fund)) for (const f of fund) {
      add(f.asset, (parseFloat(f.free) || 0) + (parseFloat(f.locked) || 0) + (parseFloat(f.freeze) || 0));
    }
  } catch { /* funding izinsiz olabilir, atla */ }
  // Simple-Earn flexible — best-effort
  try {
    const earn = await signedGet('/sapi/v1/simple-earn/flexible/position', key, secret);
    for (const r of earn?.rows || []) add(r.asset, parseFloat(r.totalAmount) || 0);
  } catch { /* atla */ }

  return totals;
}

/**
 * Binance-notlu holding'leri gerçek bakiyeyle eşitler.
 * @returns değişiklik özeti (log için)
 */
export async function syncBinanceHoldings(supabase: any, log: string[]): Promise<void> {
  const key = cleanKey(process.env.BINANCE_API_KEY);
  const secret = cleanKey(process.env.BINANCE_API_SECRET);
  if (!key || !secret) {
    log.push('Binance sync: API key yok, atlandı');
    return;
  }

  let balances: Record<string, number>;
  try {
    balances = await fetchRealBalances(key, secret);
  } catch (e: any) {
    log.push(`Binance sync HATA: ${e.message}`);
    return;
  }

  // Senkronlanacak holding'ler: Binance-notlu kriptolar + USDC currency.
  const { data: rows } = await supabase
    .from('holdings')
    .select('id,symbol,asset_type,quantity,price_notes')
    .or(`price_notes.eq.${BINANCE_NOTE},and(symbol.eq.USDC,asset_type.eq.currency)`);

  if (!rows || rows.length === 0) {
    log.push('Binance sync: eşitlenecek holding yok');
    return;
  }

  let changed = 0;
  for (const h of rows) {
    const real = balances[h.symbol.toUpperCase()] || 0;
    const cur = Number(h.quantity) || 0;
    // Aynıysa (8 hane toleransı) yazma
    if (Math.abs(real - cur) < 1e-8) continue;
    const { error } = await supabase
      .from('holdings')
      .update({ quantity: real, updated_at: new Date().toISOString() })
      .eq('id', h.id);
    if (error) {
      log.push(`Binance sync ${h.symbol}: güncellenemedi (${error.message})`);
    } else {
      changed++;
      log.push(`Binance sync ${h.symbol}: ${cur} → ${real}`);
    }
  }
  log.push(`Binance sync: ${changed} holding güncellendi`);
}
