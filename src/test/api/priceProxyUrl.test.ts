import { describe, expect, it, vi } from 'vitest';
import handler from '../../../api/price-proxy';

vi.mock('../../../api/lib/serviceSupabase', () => ({ getServiceSupabase: vi.fn() }));
describe('price-proxy WHATWG URL', () => {
  it('legacy query getter okunmaz; kod çözme ve type parametresi korunur', async () => {
    const req = { method: 'GET', url: '/api/price-proxy?type=benchmark-history&symbol=%5EXU100&days=7', get query(): never { throw new Error('legacy url.parse tetiklendi'); } };
    const fetcher = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ chart: { result: [{ timestamp: [0, 86400], indicators: { quote: [{ close: [12, null] }] } }] } }) }));
    vi.stubGlobal('fetch', fetcher);
    const res = { setHeader: vi.fn(), json: vi.fn(), status: vi.fn().mockReturnThis() };
    try {
      await handler(req as never, res as never);
      expect(fetcher.mock.calls[0][0]).toContain('%5EXU100?interval=1d&range=7d');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { symbol: '^XU100', series: [{ date: '1970-01-01', value: 12 }] } });
    } finally { vi.unstubAllGlobals(); }
  });
});
