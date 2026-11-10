import { Profiler, StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKGROUND_REFRESH_MS, useSilentRefresh } from './useSilentRefresh';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function Probe({ load, rendered = () => {} }: { load: () => Promise<{ value: number }>; rendered?: () => void }) {
  const { data, loading, error } = useSilentRefresh(load);
  rendered();
  return <div>{loading ? 'Yükleniyor' : error ? 'Hata' : <output>{data?.value}</output>}</div>;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('sessiz arka plan yenilemesi', () => {
  it('ilk yüklemeden sonra bekleyen istek, aynı veri ve hata içeriği kaldırmaz; parent render olmaz', async () => {
    const request = deferred<{ value: number }>();
    const load = vi.fn().mockResolvedValueOnce({ value: 400 }).mockReturnValueOnce(request.promise).mockRejectedValueOnce(new Error('offline'));
    const parentRendered = vi.fn();
    function Parent() { parentRendered(); return <Probe load={load} />; }
    render(<Parent />);
    expect(screen.getByText('Yükleniyor')).toBeInTheDocument();
    await act(async () => {});
    const output = screen.getByRole('status');
    expect(output).toHaveTextContent('400');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Yükleniyor')).toBeNull();
    expect(screen.getByRole('status')).toBe(output);
    await act(async () => { request.resolve({ value: 400 }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.queryByText('Hata')).toBeNull();
    expect(screen.getByRole('status')).toBe(output);
    expect(parentRendered).toHaveBeenCalledTimes(1);
  });

  it('aynı değerler yeni nesne olarak gelse bile yeni commit oluşmaz', async () => {
    const rendered = vi.fn(), committed = vi.fn();
    render(<Profiler id="resource" onRender={committed}><Probe load={async () => ({ value: 400 })} rendered={rendered} /></Profiler>);
    await act(async () => {});
    const count = committed.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(committed).toHaveBeenCalledTimes(count);
    expect(screen.getByRole('status')).toHaveTextContent('400');
  });

  it('prop değişiklikleri zamanlayıcıyı yeniden başlatmaz; tick en güncel girdiyi kullanır', async () => {
    const first = vi.fn(async () => ({ value: 400 })), next = vi.fn(async () => ({ value: 450 }));
    const { rerender } = render(<Probe load={first} />);
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    rerender(<Probe load={next} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
    expect(next).not.toHaveBeenCalled();
    const output = screen.getByRole('status');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(next).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toBe(output);
    expect(output).toHaveTextContent('450');
    expect(BACKGROUND_REFRESH_MS).toBe(60_000);
  });

  it('StrictMode yeniden kurulumunda iptal edilmiş efekt okuma başlatmaz', async () => {
    const load = vi.fn(async () => ({ value: 400 }));
    render(<StrictMode><Probe load={load} /></StrictMode>);
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('400');
  });

  it('uzun istekle çakışan tick ek istek açmaz; unmount timerı temizler', async () => {
    const request = deferred<{ value: number }>();
    const load = vi.fn(() => request.promise);
    const { unmount } = render(<Probe load={load} />);
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(load).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => { request.resolve({ value: 400 }); await vi.advanceTimersByTimeAsync(180_000); });
    expect(load).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
