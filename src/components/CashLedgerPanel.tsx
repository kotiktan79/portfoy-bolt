import { useEffect, useState } from 'react';
import type { CashBalance } from '../lib/supabase';
import { convertCash, readCashLedger } from '../services/cashConversionService';

export function CashLedgerPanel({ initialBalances }: { initialBalances?: CashBalance[] }) {
  const [balances, setBalances] = useState<CashBalance[]>(initialBalances || []);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (initialBalances) return;
    let active = true;
    readCashLedger().then(rows => { if (active) setBalances(rows); })
      .catch(() => { if (active) setMessage('Kasa defteri yüklenemedi.'); });
    return () => { active = false; };
  }, [initialBalances]);
  return <section className="card-secondary p-4 m-4">
    <h3 className="text-sm font-semibold">Kasa defteri</h3>
    {balances.map(b => (
      <div key={b.id} className="text-xs mt-2">
        {b.currency}: {Number(b.balance).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
      </div>
    ))}
    {balances.length >= 2 && <details className="mt-3 text-sm">
      <summary className="cursor-pointer">Döviz çevir</summary>
      <form className="flex flex-wrap gap-2 mt-2" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setMessage('');
        try {
          await convertCash(from, to, Number(amount), Number(received));
          setMessage('Çevirme kaydedildi.'); setAmount(''); setReceived('');
        } catch (err) { setMessage(err instanceof Error ? err.message : 'Çevirme başarısız.'); }
        finally { try { setBalances(await readCashLedger()); } catch { /* mevcut görünümü koru */ } setBusy(false); }
      }}>
        <fieldset disabled={busy} className="flex flex-wrap gap-2">
          <select required aria-label="Çıkış dövizi" value={from} onChange={e => setFrom(e.target.value)}><option value="">Çıkış dövizi</option>{balances.map(b => <option key={b.id}>{b.currency}</option>)}</select>
          <input required aria-label="Çıkış tutarı" type="number" min="0.00000001" step="any" placeholder="Çıkış tutarı" value={amount} onChange={e => setAmount(e.target.value)} className="w-32" />
          <select required aria-label="Giriş dövizi" value={to} onChange={e => setTo(e.target.value)}><option value="">Giriş dövizi</option>{balances.filter(b => b.currency !== from).map(b => <option key={b.id}>{b.currency}</option>)}</select>
          <input required aria-label="Alınan tutar" type="number" min="0.00000001" step="any" placeholder="Alınan tutar" value={received} onChange={e => setReceived(e.target.value)} className="w-32" />
          <button type="submit" className="px-3 py-1 rounded bg-brand-600 text-white">{busy ? 'Kaydediliyor…' : 'Çevirmeyi kaydet'}</button>
        </fieldset>
      </form>
    </details>}
    {message && <p role="status" className="text-xs mt-2">{message}</p>}
  </section>;
}
