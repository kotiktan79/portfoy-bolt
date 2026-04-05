import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BISTPrice {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const symbols = url.searchParams.get('symbols')?.split(',') || [];

    if (symbols.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No symbols provided' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Fetching prices for: ${symbols.join(', ')}`);

    const prices: Record<string, BISTPrice> = {};
    const results = await Promise.allSettled(
      symbols.map(symbol => fetchBISTPrice(symbol.trim()))
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        prices[symbols[index].trim()] = result.value;
      } else {
        console.error(`Failed to fetch ${symbols[index]}:`, result.status === 'rejected' ? result.reason : 'No data');
      }
    });

    return new Response(
      JSON.stringify({ success: true, data: prices, count: Object.keys(prices).length }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function fetchBISTPrice(symbol: string): Promise<BISTPrice | null> {
  const timestamp = Date.now();

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}.IS&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,regularMarketPreviousClose&_=${timestamp}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
        },
      }
    );

    if (!response.ok) {
      console.log(`Yahoo v7 failed for ${symbol} (${response.status}), trying v8...`);
      return await fetchFromYahooV8(symbol);
    }

    const data = await response.json();
    const quote = data?.quoteResponse?.result?.[0];

    if (!quote || !quote.regularMarketPrice) {
      console.log(`Yahoo v7 no price for ${symbol}, trying v8...`);
      return await fetchFromYahooV8(symbol);
    }

    const currentPrice = quote.regularMarketPrice;
    const change = quote.regularMarketChange || 0;
    const changePercent = quote.regularMarketChangePercent || 0;

    console.log(`✅ ${symbol}: ${currentPrice} TRY (Yahoo v7)`);

    return {
      symbol,
      price: currentPrice,
      change,
      changePercent,
      volume: quote.regularMarketVolume || 0,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Yahoo v7 error for ${symbol}:`, error.message);
    return await fetchFromYahooV8(symbol);
  }
}

async function fetchFromYahooV8(symbol: string): Promise<BISTPrice | null> {
  const timestamp = Date.now();

  try {
    const response = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1m&range=1d&_=${timestamp}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
        },
      }
    );

    if (!response.ok) {
      console.log(`Yahoo v8 failed for ${symbol} (${response.status}), trying quoteSummary...`);
      return await fetchFromQuoteSummary(symbol);
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;

    if (!meta || !meta.regularMarketPrice) {
      console.log(`Yahoo v8 no price for ${symbol}, trying quoteSummary...`);
      return await fetchFromQuoteSummary(symbol);
    }

    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose || currentPrice;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    console.log(`✅ ${symbol}: ${currentPrice} TRY (Yahoo v8)`);

    return {
      symbol,
      price: currentPrice,
      change,
      changePercent,
      volume: meta.regularMarketVolume || 0,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Yahoo v8 error for ${symbol}:`, error.message);
    return await fetchFromQuoteSummary(symbol);
  }
}

async function fetchFromQuoteSummary(symbol: string): Promise<BISTPrice | null> {
  const timestamp = Date.now();

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}.IS?modules=price,summaryDetail&_=${timestamp}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
        },
      }
    );

    if (!response.ok) {
      console.log(`QuoteSummary failed for ${symbol} (${response.status})`);
      return await fetchFromCollectAPI(symbol);
    }

    const data = await response.json();
    const price = data?.quoteSummary?.result?.[0]?.price;

    if (!price || !price.regularMarketPrice?.raw) {
      console.log(`QuoteSummary no price for ${symbol}, trying CollectAPI...`);
      return await fetchFromCollectAPI(symbol);
    }

    const currentPrice = price.regularMarketPrice.raw;
    const change = price.regularMarketChange?.raw || 0;
    const changePercent = price.regularMarketChangePercent?.raw || 0;

    console.log(`✅ ${symbol}: ${currentPrice} TRY (QuoteSummary)`);

    return {
      symbol,
      price: currentPrice,
      change,
      changePercent,
      volume: price.regularMarketVolume?.raw || 0,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`QuoteSummary error for ${symbol}:`, error.message);
    return await fetchFromCollectAPI(symbol);
  }
}

async function fetchFromCollectAPI(symbol: string): Promise<BISTPrice | null> {
  try {
    const response = await fetch(
      `https://api.collectapi.com/economy/hisseSenedi?code=${symbol}`,
      {
        headers: {
          'authorization': 'apikey demo',
          'content-type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.log(`CollectAPI failed for ${symbol} (${response.status})`);
      return null;
    }

    const data = await response.json();
    if (data.success && data.result && data.result.price) {
      const currentPrice = parseFloat(data.result.price);
      const change = parseFloat(data.result.change || '0');
      const changePercent = parseFloat(data.result.rate || '0');

      console.log(`✅ ${symbol}: ${currentPrice} TRY (CollectAPI)`);

      return {
        symbol,
        price: currentPrice,
        change,
        changePercent,
        volume: 0,
        timestamp: new Date().toISOString(),
      };
    }

    console.log(`CollectAPI no data for ${symbol}`);
    return null;
  } catch (error) {
    console.error(`CollectAPI error for ${symbol}:`, error.message);
    return null;
  }
}