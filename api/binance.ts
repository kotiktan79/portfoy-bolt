import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Env'e kazara kaçmış literal "\n" / boşlukları temizle (bilinen tuzak:
  // değerler trailing \n ile kaydedilince Binance "-2014 API-key format invalid" döner).
  const apiKey = (process.env.BINANCE_API_KEY || '').replace(/\\n$/, '').replace(/\s+/g, '');
  const apiSecret = (process.env.BINANCE_API_SECRET || '').replace(/\\n$/, '').replace(/\s+/g, '');

  if (!apiKey || !apiSecret) {
    return res.status(200).json({ success: false, error: 'Binance API not configured' });
  }

  try {
    // Get account info (balances)
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');

    const accountRes = await fetch(
      `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`,
      { headers: { 'X-MBX-APIKEY': apiKey } }
    );

    if (!accountRes.ok) {
      const err = await accountRes.text();
      console.error('Binance API error:', err);
      return res.status(200).json({ success: false, error: 'Binance API error' });
    }

    const account = await accountRes.json();

    // Filter non-zero balances
    const balances = account.balances
      .filter((b: any) => parseFloat(b.free) + parseFloat(b.locked) > 0)
      .map((b: any) => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
        total: parseFloat(b.free) + parseFloat(b.locked),
      }));

    // Get current prices for all assets
    const pricesRes = await fetch('https://api.binance.com/api/v3/ticker/price');
    const allPrices: Array<{ symbol: string; price: string }> = await pricesRes.json();

    const priceMap: Record<string, number> = {};
    allPrices.forEach(p => { priceMap[p.symbol] = parseFloat(p.price); });

    // Enrich balances with USD value
    const enriched = balances.map((b: any) => {
      let usdValue = 0;
      let usdPrice = 0;

      if (b.asset === 'USDT' || b.asset === 'USDC' || b.asset === 'BUSD' || b.asset === 'FDUSD') {
        usdValue = b.total;
        usdPrice = 1;
      } else if (priceMap[`${b.asset}USDT`]) {
        usdPrice = priceMap[`${b.asset}USDT`];
        usdValue = b.total * usdPrice;
      } else if (priceMap[`${b.asset}BUSD`]) {
        usdPrice = priceMap[`${b.asset}BUSD`];
        usdValue = b.total * usdPrice;
      }

      return {
        ...b,
        usdPrice,
        usdValue,
      };
    })
    .filter((b: any) => b.usdValue > 1) // Filter dust (< $1)
    .sort((a: any, b: any) => b.usdValue - a.usdValue);

    const totalUsdValue = enriched.reduce((s: number, b: any) => s + b.usdValue, 0);

    return res.status(200).json({
      success: true,
      balances: enriched,
      totalUsdValue,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error('Binance error:', error);
    return res.status(200).json({ success: false, error: error.message });
  }
}
