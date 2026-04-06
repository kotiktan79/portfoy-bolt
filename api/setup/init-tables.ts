import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Initialize bot system tables via Supabase service role key.
 *
 * Usage:
 *   POST /api/setup/init-tables
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in Vercel env vars.
 *
 * Tables created:
 * - daily_reports: AI günlük rapor + piyasa analizi
 * - income_records: Gelir takibi (temettü, faiz, staking, kupon)
 * - monthly_salary: Aylık dinamik maaş hesaplama
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return res.status(200).json({
      success: false,
      error: 'SUPABASE_SERVICE_ROLE_KEY required',
      manual_instructions: {
        step1: 'Go to Supabase Dashboard > SQL Editor',
        step2: 'Copy the SQL from: supabase/migrations/20260406_create_daily_reports_and_income.sql',
        step3: 'Paste and run it',
        step4: 'This endpoint is no longer needed after tables are created',
      }
    });
  }

  // Use service role key to bypass RLS and execute DDL via pg_catalog
  const supabase = createClient(url, serviceKey, {
    db: { schema: 'public' },
    auth: { persistSession: false },
  });

  const results: string[] = [];

  // Test each table - try to select, if error = not exists
  const tables = ['daily_reports', 'income_records', 'monthly_salary'];
  const missing: string[] = [];

  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error) {
      missing.push(table);
      results.push(`${table}: missing, needs creation`);
    } else {
      results.push(`${table}: already exists`);
    }
  }

  if (missing.length === 0) {
    return res.status(200).json({ success: true, message: 'All tables already exist', results });
  }

  // Try creating tables using SQL via the Management API
  const projectRef = url.replace('https://', '').replace('.supabase.co', '');

  try {
    // Execute SQL via Supabase Management API
    const sqlResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        query: MIGRATION_SQL,
      }),
    });

    if (sqlResponse.ok) {
      results.push('Migration executed successfully via Management API');
    } else {
      const errText = await sqlResponse.text();
      results.push(`Management API failed: ${errText}`);
      results.push('Please run migration manually in Supabase Dashboard SQL Editor');
    }
  } catch (e: any) {
    results.push(`Error: ${e.message}`);
    results.push('Please run migration manually in Supabase Dashboard SQL Editor');
  }

  return res.status(200).json({ success: true, missing, results });
}

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  portfolio_value numeric,
  portfolio_investment numeric,
  portfolio_pnl numeric,
  portfolio_pnl_pct numeric,
  market_data jsonb DEFAULT '{}',
  actions jsonb DEFAULT '[]',
  monthly_income jsonb DEFAULT '{}',
  market_outlook text,
  portfolio_diagnosis text,
  top_pick text,
  news_alerts jsonb DEFAULT '[]',
  wealth_building_tip text,
  safe_monthly_income numeric DEFAULT 0,
  moderate_monthly_income numeric DEFAULT 0,
  ai_model text,
  generation_time_ms integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for daily_reports" ON daily_reports;
CREATE POLICY "Allow all for daily_reports" ON daily_reports FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports (report_date DESC);

CREATE TABLE IF NOT EXISTS income_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  income_date date NOT NULL,
  income_type text NOT NULL,
  source_symbol text,
  source_asset_type text,
  amount numeric NOT NULL,
  currency text DEFAULT 'TRY',
  amount_try numeric NOT NULL,
  notes text,
  is_projected boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE income_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for income_records" ON income_records;
CREATE POLICY "Allow all for income_records" ON income_records FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_income_records_date ON income_records (income_date DESC);
CREATE INDEX IF NOT EXISTS idx_income_records_type ON income_records (income_type);

CREATE TABLE IF NOT EXISTS monthly_salary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salary_month date NOT NULL UNIQUE,
  portfolio_value numeric,
  safe_amount numeric DEFAULT 0,
  moderate_amount numeric DEFAULT 0,
  actual_income numeric DEFAULT 0,
  withdrawn_amount numeric DEFAULT 0,
  dividend_income numeric DEFAULT 0,
  interest_income numeric DEFAULT 0,
  staking_income numeric DEFAULT 0,
  coupon_income numeric DEFAULT 0,
  profit_taking_income numeric DEFAULT 0,
  ai_recommendation text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE monthly_salary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for monthly_salary" ON monthly_salary;
CREATE POLICY "Allow all for monthly_salary" ON monthly_salary FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_monthly_salary_month ON monthly_salary (salary_month DESC);
`;
