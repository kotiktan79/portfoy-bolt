/*
  # Drop 15 unused tables

  These 15 tables had ZERO references in the app (verified across src/ and api/
  on 2026-06-04) — speculative/abandoned features. On the live DB only 5 of them
  actually existed (ai_suggestions, email_alerts, leaderboard, portfolio_shares,
  user_preferences), all with 0 rows; the other 10 were defined in migrations but
  never materialised on the remote (schema drift). This was applied to the live
  project via the Management API on 2026-06-04 with zero data loss; kept here as a
  tracked migration so fresh `db reset` converges to the same state. IF EXISTS +
  CASCADE make it idempotent and safe to re-run.

  Notable: `binance_api_keys` was designed to store api_key/api_secret as plain
  text (comment said "encrypted" but nothing encrypted them); dropping it removes
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
