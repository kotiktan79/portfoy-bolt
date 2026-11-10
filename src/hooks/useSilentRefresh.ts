import { useCallback, useEffect, useRef, useState } from 'react';
import { keepPrevious } from '../lib/refreshData';

export const BACKGROUND_REFRESH_MS = 60_000;

/** İlk yükleme dışında içerik boşaltılmaz; istekler çakışmaz, aynı veri render başlatmaz. */
export function useSilentRefresh<T>(load: () => Promise<T>, enabled = true) {
  const loader = useRef(load);
  loader.current = load;
  const [state, setState] = useState<{ data: T | null; error: string | null; loaded: boolean }>({
    data: null, error: null, loaded: false,
  });
  const stateRef = useRef(state);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let pending: Promise<void> | null = null;
    const run = (): Promise<void> => {
      if (pending) return pending;
      pending = Promise.resolve().then(async () => {
        if (!active) return;
        const next = await loader.current();
        if (!active) return;
        const previous = stateRef.current;
        const data = previous.loaded ? keepPrevious(previous.data, next) : next;
        if (previous.loaded && data === previous.data) return;
        const updated = { data, error: null, loaded: true };
        stateRef.current = updated;
        setState(updated);
      }).catch(error => {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Veri okunamadı.';
        const previous = stateRef.current;
        if (previous.loaded || previous.error === message) return;
        const updated = { ...previous, error: message };
        stateRef.current = updated;
        setState(updated);
      }).finally(() => { pending = null; });
      return pending;
    };
    refreshRef.current = run;
    void run();
    const timer = setInterval(run, BACKGROUND_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
      refreshRef.current = async () => {};
    };
  }, [enabled]);

  return { data: state.data, loading: enabled && !state.loaded && !state.error, error: state.error, refresh };
}
