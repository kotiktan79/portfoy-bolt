import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// GET /api/confirm-split?symbol=BIMAS&ratio=2&key=SECRET
// Telegram'dan gelen split onayını uygular: quantity × ratio, purchase_price / ratio.
// Toplam pozisyon değeri ve maliyet bazı korunur, sadece adet/birim fiyat ayarlanır.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = String(req.query.symbol || '').toUpperCase();
  const ratio = Number(req.query.ratio || 0);
  const key = String(req.query.key || '');

  const secret = process.env.CRON_SECRET;
  if (!secret || key !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!symbol || !ratio || ratio < 1 || ratio > 100) {
    return res.status(400).json({ error: 'symbol ve ratio (1-100) gerekli' });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !supaKey) return res.status(500).json({ error: 'Supabase credentials missing' });
  const sb = createClient(url, supaKey);

  const { data: h, error: fetchErr } = await sb.from('holdings').select('*').eq('symbol', symbol).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!h) return res.status(404).json({ error: `${symbol} bulunamadı` });

  const oldQty = Number(h.quantity) || 0;
  const oldPurchase = Number(h.purchase_price) || 0;
  const newQty = oldQty * ratio;
  const newPurchase = oldPurchase / ratio;
  const cost = newQty * newPurchase;
  const value = newQty * (Number(h.current_price) || 0);
  const pnl = value - cost;
  const pct = cost > 0 ? (pnl / cost) * 100 : 0;

  const { error: updErr } = await sb.from('holdings').update({
    quantity: newQty,
    purchase_price: Number(newPurchase.toFixed(8)),
    cost_basis: Number(cost.toFixed(4)),
    unrealized_pnl: Number(pnl.toFixed(4)),
    unrealized_pnl_percent: Number(pct.toFixed(4)),
    updated_at: new Date().toISOString(),
    price_notes: `${symbol} ${ratio}:1 stock split adjustment (${new Date().toISOString().split('T')[0]})`,
  }).eq('id', h.id);
  if (updErr) return res.status(500).json({ error: updErr.message });

  return res.status(200).json({
    success: true,
    symbol,
    ratio,
    before: { quantity: oldQty, purchase_price: oldPurchase },
    after: { quantity: newQty, purchase_price: newPurchase },
    value_preserved: cost,
    message: `${symbol} ${ratio}:1 split uygulandı. Adet ${oldQty} → ${newQty}, alış ${oldPurchase.toFixed(2)} → ${newPurchase.toFixed(2)}. Pozisyon değeri korundu.`,
  });
}
