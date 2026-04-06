import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Migration endpoint - creates the bot system tables if they don't exist.
 * Call once after deployment: POST /api/setup/migrate
 * Requires SUPABASE_SERVICE_ROLE_KEY env var for DDL operations.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return res.status(500).json({
      error: 'SUPABASE_SERVICE_ROLE_KEY required for migrations',
      hint: 'Set SUPABASE_SERVICE_ROLE_KEY in Vercel Environment Variables',
    });
  }

  const supabase = createClient(url, key);
  const results: string[] = [];

  try {
    // daily_reports
    const { error: e1 } = await supabase.rpc('exec_sql', {
      query: `
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
      `
    });
    results.push(e1 ? `daily_reports: ${e1.message}` : 'daily_reports: OK');

    // income_records
    const { error: e2 } = await supabase.rpc('exec_sql', {
      query: `
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
      `
    });
    results.push(e2 ? `income_records: ${e2.message}` : 'income_records: OK');

    // monthly_salary
    const { error: e3 } = await supabase.rpc('exec_sql', {
      query: `
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
      `
    });
    results.push(e3 ? `monthly_salary: ${e3.message}` : 'monthly_salary: OK');

    return res.status(200).json({ success: true, results });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      results,
      fallback: 'Run the SQL in supabase/migrations/20260406_create_daily_reports_and_income.sql manually in Supabase Dashboard SQL Editor',
    });
  }
}
