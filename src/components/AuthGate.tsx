import { useEffect, useState, ReactNode, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { Lock, LogIn } from 'lucide-react';

/**
 * Gates the entire app behind a Supabase Auth session. Children (including the
 * data-fetching PortfolioProvider) only mount once authenticated, so no request
 * hits the database before login. After the RLS lockdown (anon role has no table
 * grants), an unauthenticated visitor with only the public anon key can read
 * nothing — the login session upgrades the request to the `authenticated` role.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950">
        <div className="h-10 w-10 rounded-full border-4 border-slate-300 border-t-slate-600 animate-spin" />
      </div>
    );
  }

  if (!session) return <LoginScreen />;
  return <>{children}</>;
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInError) {
      setError('Giriş başarısız. E-posta veya parola hatalı.');
    }
    // On success, onAuthStateChange in AuthGate swaps in the app.
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-xl border border-slate-200 dark:border-gray-800 p-6 space-y-4"
      >
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
          <span className="h-9 w-9 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center">
            <Lock size={18} />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Portföy</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Devam etmek için giriş yap</p>
          </div>
        </div>

        <div className="space-y-2">
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-posta"
            className="w-full rounded-xl border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-400"
          />
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Parola"
            className="w-full rounded-xl border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <LogIn size={16} />
          {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
        </button>
      </form>
    </div>
  );
}

export async function signOut() {
  await supabase.auth.signOut();
}
