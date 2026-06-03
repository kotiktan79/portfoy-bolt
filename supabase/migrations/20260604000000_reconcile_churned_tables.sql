/*
  # Reconcile churned tables to a deterministic final shape

  `monthly_withdrawals` was created by FOUR conflicting migrations and
  `exchange_rates` by THREE, all guarded by CREATE TABLE IF NOT EXISTS. On a
  fresh `supabase db reset` the earliest definition wins and the rest become
  silent no-ops, so the resulting schema is non-deterministic. For
  monthly_withdrawals the earliest (auth-only RLS + NOT NULL symbol/quantity +
  FK to auth.users) wins — which the anon-key app cannot use at all.

  This migration runs last and pins both tables to the wide-open-anon shape the
  rest of the schema uses, idempotently, so a clean replay always lands in a
  usable, deterministic state. It is safe to run against the live DB too (only
  additive ADD COLUMN IF NOT EXISTS, NOT NULL relaxation, and policy resets).

  NOTE: applies only when supabase migrations are run (db reset / push); it does
  not run on a Vercel deploy.
*/

-- monthly_withdrawals: normalize columns + RLS (table is currently unused by the
-- app, so this is purely fresh-reset safety / future-proofing).
DO $$
BEGIN
  IF to_regclass('public.monthly_withdrawals') IS NOT NULL THEN
    BEGIN ALTER TABLE monthly_withdrawals ALTER COLUMN symbol DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN ALTER TABLE monthly_withdrawals ALTER COLUMN quantity DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END;
    ALTER TABLE monthly_withdrawals ADD COLUMN IF NOT EXISTS portfolio_id uuid;
    ALTER TABLE monthly_withdrawals ADD COLUMN IF NOT EXISTS actual_amount numeric;
    ALTER TABLE monthly_withdrawals ADD COLUMN IF NOT EXISTS executed_at timestamptz;

    ALTER TABLE monthly_withdrawals ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view own withdrawals" ON monthly_withdrawals;
    DROP POLICY IF EXISTS "Users can insert own withdrawals" ON monthly_withdrawals;
    DROP POLICY IF EXISTS "Users can update own withdrawals" ON monthly_withdrawals;
    DROP POLICY IF EXISTS "Users can delete own withdrawals" ON monthly_withdrawals;
    DROP POLICY IF EXISTS "Allow all for monthly_withdrawals" ON monthly_withdrawals;
    CREATE POLICY "Allow all for monthly_withdrawals" ON monthly_withdrawals FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- exchange_rates: guarantee the columns the app reads/writes
-- (from_currency, to_currency, rate, recorded_at, source) all exist regardless
-- of which conflicting definition won the IF NOT EXISTS race.
DO $$
BEGIN
  IF to_regclass('public.exchange_rates') IS NOT NULL THEN
    ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
    ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS recorded_at timestamptz DEFAULT now();
  END IF;
END $$;
