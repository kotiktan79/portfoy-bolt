-- ============================================
-- DAILY REPORTS: AI günlük rapor + piyasa analizi
-- ============================================
CREATE TABLE IF NOT EXISTS daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  -- Portföy snapshot
  portfolio_value numeric,
  portfolio_investment numeric,
  portfolio_pnl numeric,
  portfolio_pnl_pct numeric,
  -- Piyasa verileri (JSON)
  market_data jsonb DEFAULT '{}',
  -- AI analiz çıktıları
  actions jsonb DEFAULT '[]',
  monthly_income jsonb DEFAULT '{}',
  market_outlook text,
  portfolio_diagnosis text,
  top_pick text,
  news_alerts jsonb DEFAULT '[]',
  wealth_building_tip text,
  -- Dinamik maaş
  safe_monthly_income numeric DEFAULT 0,
  moderate_monthly_income numeric DEFAULT 0,
  -- Meta
  ai_model text,
  generation_time_ms integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for daily_reports" ON daily_reports
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_daily_reports_date ON daily_reports (report_date DESC);

-- ============================================
-- INCOME RECORDS: Gelir takibi (temettü, faiz, staking, kâr realizasyonu)
-- ============================================
CREATE TABLE IF NOT EXISTS income_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  income_date date NOT NULL,
  income_type text NOT NULL CHECK (income_type IN ('dividend', 'interest', 'staking', 'coupon', 'profit_taking', 'other')),
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
CREATE POLICY "Allow all for income_records" ON income_records
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_income_records_date ON income_records (income_date DESC);
CREATE INDEX idx_income_records_type ON income_records (income_type);

-- ============================================
-- MONTHLY SALARY: Aylık dinamik maaş hesaplama
-- ============================================
CREATE TABLE IF NOT EXISTS monthly_salary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salary_month date NOT NULL UNIQUE, -- Her ay 1'i (2026-04-01)
  portfolio_value numeric,
  -- Hesaplanan maaş
  safe_amount numeric DEFAULT 0,
  moderate_amount numeric DEFAULT 0,
  -- Gerçekleşen gelir
  actual_income numeric DEFAULT 0,
  withdrawn_amount numeric DEFAULT 0,
  -- Kaynaklar
  dividend_income numeric DEFAULT 0,
  interest_income numeric DEFAULT 0,
  staking_income numeric DEFAULT 0,
  coupon_income numeric DEFAULT 0,
  profit_taking_income numeric DEFAULT 0,
  -- AI notu
  ai_recommendation text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE monthly_salary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for monthly_salary" ON monthly_salary
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_monthly_salary_month ON monthly_salary (salary_month DESC);
