/*
  OPTIONAL — NOT a migration, does NOT run automatically.

  These 15 tables exist in the schema but have ZERO references in the app
  (verified across src/ and api/ on 2026-06-04). They are speculative/abandoned
  features. Dropping them is DESTRUCTIVE and IRREVERSIBLE — any data they hold is
  lost. This file lives outside supabase/migrations/ on purpose so `supabase db
  reset/push` never executes it.

  To apply: review, then run manually in the Supabase Dashboard SQL Editor (or
  `psql`). Take a backup first. Remove CASCADE if you want it to fail instead of
  silently dropping any dependent objects.

  Notable: `binance_api_keys` was designed to store api_key/api_secret as plain
  text (comment says "encrypted" but nothing encrypts them); dropping it removes
  that latent secret-exposure surface.

  Intentionally NOT dropped:
    - portfolios            (FK parent for many active tables)
    - monthly_withdrawals   (unused, but reconciled to a clean shape; keep as-is)
*/

DROP TABLE IF EXISTS ai_suggestions          CASCADE;
DROP TABLE IF EXISTS audit_logs              CASCADE;
DROP TABLE IF EXISTS backups                 CASCADE;
DROP TABLE IF EXISTS binance_api_keys        CASCADE;
DROP TABLE IF EXISTS binance_balances        CASCADE;
DROP TABLE IF EXISTS bot_performance         CASCADE;
DROP TABLE IF EXISTS dca_strategies          CASCADE;
DROP TABLE IF EXISTS email_alerts            CASCADE;
DROP TABLE IF EXISTS leaderboard             CASCADE;
DROP TABLE IF EXISTS notification_settings   CASCADE;
DROP TABLE IF EXISTS portfolio_shares        CASCADE;
DROP TABLE IF EXISTS rebalancing_rules       CASCADE;
DROP TABLE IF EXISTS stop_loss_take_profit   CASCADE;
DROP TABLE IF EXISTS sync_history            CASCADE;
DROP TABLE IF EXISTS user_preferences        CASCADE;
