/*
  # Remove foreign key constraint on user_id for cash tables

  The app operates without authentication. The user_id column
  uses a fixed anonymous UUID, so the FK reference to auth.users
  must be removed to allow inserts without a real auth user.
*/

ALTER TABLE cash_balances DROP CONSTRAINT IF EXISTS cash_balances_user_id_fkey;
ALTER TABLE cash_transactions DROP CONSTRAINT IF EXISTS cash_transactions_user_id_fkey;
