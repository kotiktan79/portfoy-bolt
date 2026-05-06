-- Kâr Cüzdanı (Salary Reservoir) System
-- Anaparayı korurken hedef maaşı garantili çekme sistemi

CREATE TABLE IF NOT EXISTS salary_settings (
  id              integer PRIMARY KEY DEFAULT 1,
  baseline_usd    numeric(14,2) NOT NULL,           -- locked anapara değeri (USD)
  target_monthly_usd numeric(10,2) NOT NULL DEFAULT 2000,
  baseline_set_at timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salary_settings_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS salary_withdrawals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawn_at    timestamptz NOT NULL DEFAULT now(),
  amount_usd      numeric(10,2) NOT NULL,
  reservoir_after_usd numeric(14,2) NOT NULL,
  portfolio_value_usd numeric(14,2) NOT NULL,
  note            text
);

CREATE INDEX IF NOT EXISTS idx_salary_withdrawals_at ON salary_withdrawals(withdrawn_at DESC);

ALTER TABLE salary_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_withdrawals ENABLE ROW LEVEL SECURITY;

-- Tek kullanıcı, permissive RLS
CREATE POLICY "salary_settings all" ON salary_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "salary_withdrawals all" ON salary_withdrawals FOR ALL USING (true) WITH CHECK (true);
