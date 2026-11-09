import { supabase, type CashBalance } from '../lib/supabase';
import { ANON_USER_ID } from '../config';
import { invalidateKasaFxCache } from './kasaFxService';

export function ledgerDifference(b: Pick<CashBalance, 'balance' | 'total_deposits' | 'total_withdrawals'>): number {
  return Number(b.balance) - (Number(b.total_deposits) - Number(b.total_withdrawals));
}

export function conversionBalances(from: CashBalance, to: CashBalance, amount: number, received: number): [CashBalance, CashBalance] {
  if (from.currency === to.currency || from.user_id !== to.user_id || ![amount, received].every(n => Number.isFinite(n) && n > 0)) {
    throw new Error('Farklı dövizler ve sıfırdan büyük tutarlar gerekli.');
  }
  if (Number(from.balance) < amount) throw new Error('Yetersiz bakiye.');
  // Eski defter farkını koru: geçmişi onarmadan iki tarafa aynı büyüklükte hareket ekle.
  return [
    { ...from, balance: Number(from.balance) - amount, total_withdrawals: Number(from.total_withdrawals) + amount },
    { ...to, balance: Number(to.balance) + received, total_deposits: Number(to.total_deposits) + received },
  ];
}

export async function readCashLedger(): Promise<CashBalance[]> {
  const { data, error } = await supabase.from('cash_balances').select('*').eq('user_id', ANON_USER_ID).order('currency');
  if (error) throw error;
  return data || [];
}

// Şema/RPC eklemeden iyimser kilit: başka ekranın değiştirdiği bakiyeyi ezme.
async function replaceBalance(before: CashBalance, after: CashBalance): Promise<CashBalance> {
  const { data, error } = await supabase.from('cash_balances').update({
    balance: after.balance, total_deposits: after.total_deposits,
    total_withdrawals: after.total_withdrawals, updated_at: new Date().toISOString(),
  }).eq('id', before.id).eq('user_id', ANON_USER_ID)
    .eq('balance', before.balance).eq('total_deposits', before.total_deposits)
    .eq('total_withdrawals', before.total_withdrawals).eq('updated_at', before.updated_at)
    .select('*').single();
  if (error || !data) throw new Error('Kasa değişmiş veya güncellenemedi. Bakiyeleri yeniden yükleyin.');
  return data;
}

let converting = false;
export async function convertCash(fromCurrency: string, toCurrency: string, amount: number, received: number): Promise<void> {
  if (converting) throw new Error('Bir çevirme işlemi zaten sürüyor.');
  converting = true;
  const applied: Array<{ before: CashBalance; after: CashBalance }> = [];
  try {
    const balances = await readCashLedger();
    const from = balances.find(b => b.currency === fromCurrency);
    const to = balances.find(b => b.currency === toCurrency);
    if (!from || !to) throw new Error('Her iki dövizin kasa kaydı bulunmalı.');
    const next = conversionBalances(from, to, amount, received);
    for (const [i, before] of [from, to].entries()) {
      const after = await replaceBalance(before, next[i]);
      applied.push({ before, after });
    }
    const conversionId = crypto.randomUUID();
    // Mevcut buy/sell türleri: dış para yatırma/çekme ve gerçekleşen kâr hesabına girmez.
    // İki ayrı çevirme bacağı aynı kimlikle defterde izlenebilir; yeni DB enum'u gerekmez.
    const { error } = await supabase.from('cash_transactions').insert([from, to].map((b, i) => ({
      user_id: ANON_USER_ID, transaction_type: i === 0 ? 'buy' : 'sell', currency: b.currency,
      amount: i === 0 ? amount : received, balance_before: b.balance, balance_after: next[i].balance,
      notes: `Çevirme [${conversionId}]: ${amount} ${fromCurrency} → ${received} ${toCurrency}`,
    })));
    if (error) throw new Error('Çevirme hareketleri kaydedilemedi.');
  } catch (error) {
    // Sunucu transaction'ı yok: başarısız ikinci bacak/kayıtta kontrollü telafi.
    // Telafi sırasında da eşzamanlı değişikliklerin üstüne yazılmaz.
    let rollbackFailed = false;
    for (const { before, after } of applied.reverse()) {
      try { await replaceBalance(after, before); } catch { rollbackFailed = true; }
    }
    if (rollbackFailed) throw new Error('Çevirme tamamlanamadı; kasa kısmen değişmiş olabilir. Defteri kontrol edin, işlemi tekrarlamayın.');
    throw error;
  } finally {
    converting = false;
    invalidateKasaFxCache();
  }
}
