-- AI Araştırma Motoru
-- Günlük cron Claude + web search ile portföy için makro/sektörel rapor üretir.
-- Kullanıcı önerileri sırayla uygular, "uygulandı" işaretler.

CREATE TABLE IF NOT EXISTS ai_research_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date     date NOT NULL DEFAULT CURRENT_DATE,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  -- Raw rapor içeriği (JSON: macro_summary, sector_view, per_holding_actions, etc.)
  content         jsonb NOT NULL,
  -- Özet metin (UI'da göstermek için)
  headline        text,
  -- Modeli, token kullanımı vb. meta
  model           text,
  tokens_used     integer,
  CONSTRAINT ai_research_one_per_day UNIQUE (report_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_research_date ON ai_research_reports(report_date DESC);

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid REFERENCES ai_research_reports(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Aksiyon tipi: trim, sell, buy, rotate, hold, watch
  action          text NOT NULL,
  symbol          text NOT NULL,
  -- Hedef miktar (qty veya pct veya tutar) — serbest format
  target_qty      numeric(20,8),
  target_amount   numeric(14,2),
  target_currency text DEFAULT 'EUR',
  -- Öncelik 1 (en yüksek) .. 5 (en düşük)
  priority        integer DEFAULT 3,
  -- Gerekçe metni
  reason          text NOT NULL,
  -- Durum: pending, applied, snoozed, dismissed
  status          text NOT NULL DEFAULT 'pending',
  status_updated_at timestamptz,
  status_note     text
);

CREATE INDEX IF NOT EXISTS idx_ai_rec_report ON ai_recommendations(report_id);
CREATE INDEX IF NOT EXISTS idx_ai_rec_status ON ai_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_ai_rec_symbol ON ai_recommendations(symbol);

ALTER TABLE ai_research_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_recommendations ENABLE ROW LEVEL SECURITY;

-- Tek kullanıcı, permissive RLS
DROP POLICY IF EXISTS "ai_research_reports all" ON ai_research_reports;
CREATE POLICY "ai_research_reports all" ON ai_research_reports FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_recommendations all" ON ai_recommendations;
CREATE POLICY "ai_recommendations all" ON ai_recommendations FOR ALL USING (true) WITH CHECK (true);
