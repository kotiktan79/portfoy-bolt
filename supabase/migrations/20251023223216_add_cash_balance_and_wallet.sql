/*
  # Nakit Bakiyesi ve Cüzdan Sistemi

  1. Yeni Tablolar
    - `cash_balances`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `currency` (text) - TRY, USD, EUR
      - `balance` (decimal) - Mevcut bakiye
      - `total_deposits` (decimal) - Toplam yatırılan
      - `total_withdrawals` (decimal) - Toplam çekilen
      - `realized_profit` (decimal) - Gerçekleşen kar/zarar
      - `updated_at` (timestamptz)

    - `cash_transactions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `transaction_type` (text) - deposit, withdrawal, buy, sell
      - `currency` (text)
      - `amount` (decimal)
      - `balance_before` (decimal)
      - `balance_after` (decimal)
      - `related_holding_id` (uuid, nullable)
      - `notes` (text)
      - `created_at` (timestamptz)

  2. Güvenlik
    - RLS etkin tüm tablolarda
    - Her kullanıcı sadece kendi verilerine erişebilir
    
  3. Notlar
    - Satış yapılınca para otomatik bakiyeye eklenir
    - Alış yapılınca para bakiyeden düşer
    - Farklı para birimleri desteklenir
*/

-- cash_balances tablosu
CREATE TABLE IF NOT EXISTS cash_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  currency text NOT NULL DEFAULT 'TRY',
  balance decimal(20, 2) NOT NULL DEFAULT 0,
  total_deposits decimal(20, 2) NOT NULL DEFAULT 0,
  total_withdrawals decimal(20, 2) NOT NULL DEFAULT 0,
  realized_profit decimal(20, 2) NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, currency)
);

-- cash_transactions tablosu
CREATE TABLE IF NOT EXISTS cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'buy', 'sell', 'dividend')),
  currency text NOT NULL DEFAULT 'TRY',
  amount decimal(20, 2) NOT NULL,
  balance_before decimal(20, 2) NOT NULL DEFAULT 0,
  balance_after decimal(20, 2) NOT NULL DEFAULT 0,
  related_holding_id uuid REFERENCES holdings(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- RLS politikaları
ALTER TABLE cash_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;

-- cash_balances policies
CREATE POLICY "Users can view own cash balances"
  ON cash_balances FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cash balances"
  ON cash_balances FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cash balances"
  ON cash_balances FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- cash_transactions policies
CREATE POLICY "Users can view own cash transactions"
  ON cash_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cash transactions"
  ON cash_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_cash_balances_user_currency 
  ON cash_balances(user_id, currency);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_user 
  ON cash_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_type 
  ON cash_transactions(transaction_type);

-- Varsayılan TRY bakiyesi oluşturma fonksiyonu
CREATE OR REPLACE FUNCTION create_default_cash_balance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO cash_balances (user_id, currency, balance)
  VALUES (NEW.id, 'TRY', 0)
  ON CONFLICT (user_id, currency) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Yeni user için otomatik bakiye oluştur
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'create_cash_balance_on_user_create'
  ) THEN
    CREATE TRIGGER create_cash_balance_on_user_create
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION create_default_cash_balance();
  END IF;
END $$;
