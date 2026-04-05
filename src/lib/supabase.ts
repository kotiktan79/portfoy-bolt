import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase bilgileri eksik. Lütfen .env dosyasını kontrol edin.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type AssetType = 'stock' | 'crypto' | 'currency' | 'fund' | 'eurobond' | 'commodity' | 'cash';
export type TransactionType = 'deposit' | 'withdrawal' | 'buy' | 'sell' | 'dividend';

export interface Holding {
  id: string;
  symbol: string;
  asset_type: AssetType;
  purchase_price: number;
  quantity: number;
  current_price: number;
  currency?: string;
  source?: string;
  portfolio_id?: string;
  manual_price?: boolean;
  manual_price_updated_at?: string;
  price_notes?: string;
  cost_basis?: number;
  unrealized_pnl?: number;
  unrealized_pnl_percent?: number;
  total_realized_pnl?: number;
  created_at: string;
  updated_at: string;
}

export interface CashBalance {
  id: string;
  user_id: string;
  currency: string;
  balance: number;
  total_deposits: number;
  total_withdrawals: number;
  realized_profit: number;
  updated_at: string;
}

export interface CashTransaction {
  id: string;
  user_id: string;
  transaction_type: TransactionType;
  currency: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  related_holding_id?: string;
  notes?: string;
  created_at: string;
}
