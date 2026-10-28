import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_DISABLED_MESSAGE, AI_ENABLED, AI_OFF_MODEL } from '../../lib/aiFeature';
import { callAnthropicMessages } from '../../../api/lib/anthropic';
import { buildMonthlyEmail, type MonthlySnapshot } from '../../../api/lib/email';
import { sendEmail } from '../../../api/lib/email';
import { sendTelegram } from '../../../api/lib/telegram';
import chatHandler from '../../../api/chat';
import researchHandler from '../../../api/cron/ai-research';
import dailyReportHandler from '../../../api/cron/daily-report';
import { dayInTZ } from '../../lib/eurPnl';

const gate = vi.hoisted(() => {
  const writes: unknown[] = [];
  function query(data: unknown = []) {
    const result = { data, error: null };
    const builder: Record<string, any> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.insert = chain;
    builder.update = chain;
    builder.upsert = (rows: unknown) => {
      writes.push(rows);
      return builder;
    };
    builder.eq = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.maybeSingle = async () => ({ data: null, error: null });
    builder.single = async () => ({ data: null, error: null });
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return builder;
  }
  return { writes, query };
});

vi.mock('../../../api/lib/serviceSupabase', () => ({
  getServiceSupabase: () => ({ from: () => gate.query([]) }),
}));

vi.mock('../../../api/lib/aiContext', async () => {
  const { dayInTZ: todayOf } = await import('../../lib/eurPnl');
  const today = todayOf(new Date());
  return {
    AI_RULES: 'rules',
    buildAiContext: vi.fn(async () => ({
      text: 'ctx',
      eur: {
        wealthEUR: 100000,
        prevWealthEUR: 99000,
        dayGainEUR: 1000,
        dayGainPct: 1,
        weekGainEUR: 500,
        weekGainPct: 0.5,
        entitlementEUR: 200,
        poolEUR: 235,
        eurRate: 50,
        wealthTRY: 5_000_000,
        asOf: today,
        health: { ok: true, lastEurRateDay: today },
        mtd: {
          gainEUR: 300,
          realGainEUR: 200,
          salaryEUR: 180,
          inflationEUR: 100,
          carryInEUR: 0,
          carryResetApplied: false,
        },
        lastFull: { month: '2026-09' },
      },
      weekPlan: [{ symbol: 'VWCE', instruction: 'Bu hafta al', detail: 'tamamı VWCE', amountEUR: 1000 }],
      anomalies: [],
    })),
  };
});

vi.mock('../../../api/lib/email', async () => {
  const actual = await vi.importActual<typeof import('../../../api/lib/email')>('../../../api/lib/email');
  return {
    ...actual,
    sendEmail: vi.fn(async () => ({ sent: true, id: 'email-1' })),
  };
});

vi.mock('../../../api/lib/telegram', async () => {
  const actual = await vi.importActual<typeof import('../../../api/lib/telegram')>('../../../api/lib/telegram');
  return {
    ...actual,
    sendTelegram: vi.fn(async () => ({ sent: true })),
  };
});

vi.mock('../../../api/lib/push', () => ({
  sendPushToAll: vi.fn(async () => ({ sent: 0, failed: 0, removed: 0 })),
}));

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ['CRON_SECRET', 'ANTHROPIC_API_KEY', 'NEWS_API_KEY'] as const;

function mockRes() {
  return {
    statusCode: 0,
    body: undefined as any,
    headers: {} as Record<string, string | number>,
    setHeader(name: string, value: string | number) {
      this.headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

function anthropicCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter((call) => String(call[0]).includes('anthropic'));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  gate.writes.length = 0;
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.CRON_SECRET = 'cron-s';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-still-present';
  delete process.env.NEWS_API_KEY;
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('anthropic')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: '{"market_outlook":"olmamalı"}' }] }),
        text: async () => 'anthropic-body',
      };
    }
    return { ok: false, status: 599, json: async () => ({}), text: async () => '' };
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(sendEmail).mockClear();
  vi.mocked(sendTelegram).mockClear();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
});

describe('yapay zekâ kapalı', () => {
  it('tek anahtar varsayılan kapalı', () => {
    expect(AI_ENABLED).toBe(false);
  });

  it('callAnthropicMessages anahtar olsa da fetch etmez', async () => {
    await expect(callAnthropicMessages('sk-ant-test-key-still-present', { model: 'claude-sonnet-5' }))
      .rejects.toThrow(AI_DISABLED_MESSAGE);
    expect(anthropicCalls(fetchMock)).toEqual([]);
  });

  it('sohbet ucu 200 ve Türkçe mesaj döner, Anthropic çağırmaz', async () => {
    const res = mockRes();
    await chatHandler(
      { method: 'POST', headers: { authorization: 'Bearer cron-s' }, body: { question: 'ne alayım?' } } as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, disabled: true, message: AI_DISABLED_MESSAGE });
    expect(anthropicCalls(fetchMock)).toEqual([]);
  });

  it('araştırma ucu 200 döner ve Anthropic çağırmaz', async () => {
    const res = mockRes();
    await researchHandler(
      { method: 'POST', headers: { authorization: 'Bearer cron-s' }, query: { force: 'true' } } as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, disabled: true, message: AI_DISABLED_MESSAGE });
    expect(anthropicCalls(fetchMock)).toEqual([]);
    expect(gate.writes).toEqual([]);
  });

  it('günlük rapor rakam, e-posta ve Telegram gönderir; AI metni ve Anthropic yok', async () => {
    const res = mockRes();
    await dailyReportHandler(
      { method: 'GET', headers: { authorization: 'Bearer cron-s' }, query: {} } as never,
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(anthropicCalls(fetchMock)).toEqual([]);
    expect(String((res.body.log || []).join('\n'))).not.toMatch(/Claude API error|ANTHROPIC_API_KEY missing|AI failed/i);

    expect(gate.writes.length).toBe(1);
    const saved = (gate.writes[0] as any[])[0];
    expect(saved.ai_model).toBe(AI_OFF_MODEL);
    expect(saved.market_outlook).toBe('');
    expect(saved.portfolio_diagnosis).toBe('');
    expect(saved.wealth_building_tip).toBe('');
    expect(saved.top_pick).toBe('');
    expect(saved.wealth_eur).toBe(100000);
    expect(saved.salary_eur).toBe(200);
    expect(saved.actions[0].symbol).toBe('VWCE');
    expect(saved.report_date).toBe(dayInTZ(new Date()));

    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    const html = String(vi.mocked(sendEmail).mock.calls[0][1]);
    expect(html).toContain('Servet');
    expect(html).toContain('Dinamik Maaş');
    expect(html).toContain('VWCE');
    expect(html).not.toContain('Portföy Tanı');
    expect(html).not.toContain('Piyasa Görünümü');
    expect(html).not.toContain('AI Yorumu');
    expect(html).not.toContain('Yapay zekâ kapalı');
    expect(html).not.toContain('Claude');

    expect(vi.mocked(sendTelegram)).toHaveBeenCalledTimes(1);
    const tg = String(vi.mocked(sendTelegram).mock.calls[0][0]);
    expect(tg).toContain('Servet');
    expect(tg).toContain('Çekilebilir maaş');
    expect(tg).not.toContain('Portföy Tanı');
    expect(tg).not.toContain('AI Yorumu');
    expect(tg).not.toContain('Yapay zekâ kapalı');
  });

  it('aylık e-posta boş tanıda AI bloğu basmaz, maaşı basar', () => {
    const snap: MonthlySnapshot = {
      monthLabel: 'Eyl 2026',
      salaryMonthLabel: 'Eki 2026',
      startWealthEUR: 1000,
      endWealthEUR: 1100,
      gainEUR: 100,
      inflationEUR: 3,
      realGainEUR: 97,
      carryInEUR: 0,
      withdrawableEUR: 97,
      carryOutEUR: 97,
      salaryEUR: 82,
      realizedIncomeEUR: 0,
      monthIncomeBreakdown: [],
      topGainersThisMonth: [],
      yearRows: [],
      diagnosisAi: '',
      healthOk: true,
    };
    const { html } = buildMonthlyEmail(snap);
    expect(html).toContain('Maaşı');
    expect(html).not.toContain('AI Yorumu');
  });
});
