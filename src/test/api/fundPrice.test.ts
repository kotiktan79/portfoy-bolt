import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchTefasFundPrice,
  infoPrice,
  latestHistoryPrice,
  planFundAutoPrice,
  tefasCodeForSymbol,
} from '../../../api/lib/fundPrice';

const GTL_NAME = 'GARANTİ PORTFÖY BİRİNCİ PARA PİYASASI (TL) FONU';
const GPA_NAME = 'GARANTİ PORTFÖY EUROBOND BORÇLANMA ARAÇLARI (DÖVİZ) FONU';
const IPV_NAME = 'İŞ PORTFÖY EUROBOND BORÇLANMA ARAÇLARI (DÖVİZ) FONU';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('tefasCodeForSymbol', () => {
  it('GPY1PPF Garanti birinci para piyasası fonunun TEFAS kodu GTL', () => {
    expect(tefasCodeForSymbol('GPY1PPF')).toBe('GTL');
    expect(tefasCodeForSymbol(' gpy1ppf ')).toBe('GTL');
  });

  it('GPA ve IPV kendi TEFAS kodları', () => {
    expect(tefasCodeForSymbol('GPA')).toBe('GPA');
    expect(tefasCodeForSymbol('IPV')).toBe('IPV');
  });

  it('eşlenmemiş sembol ve boş GPY kodu null', () => {
    expect(tefasCodeForSymbol('GPY')).toBeNull();
    expect(tefasCodeForSymbol('EUROFON')).toBeNull();
    expect(tefasCodeForSymbol('')).toBeNull();
  });
});

describe('latestHistoryPrice', () => {
  it('tarihe göre en son fiyatı seçer, dizi sırasına bakmaz', () => {
    const quote = latestHistoryPrice([
      { fonKodu: 'GTL', fonUnvan: GTL_NAME, tarih: '2026-10-15', fiyat: 0.141 },
      { fonKodu: 'GTL', fonUnvan: GTL_NAME, tarih: '2026-10-14', fiyat: 0.14 },
      { fonKodu: 'GTL', fonUnvan: GTL_NAME, tarih: '2026-10-16', fiyat: 0.142216 },
    ], 'GTL');
    expect(quote).toEqual({ price: 0.142216, name: GTL_NAME, asOf: '2026-10-16' });
  });

  it('başka fon kodunu ve geçersiz fiyatı eler', () => {
    expect(latestHistoryPrice([
      { fonKodu: 'GPA', fonUnvan: GPA_NAME, tarih: '2026-10-16', fiyat: 23.7 },
      { fonKodu: 'GTL', tarih: '2026-10-16', fiyat: 0 },
    ], 'GTL')).toBeNull();
  });
});

describe('infoPrice', () => {
  it('sonFiyat yedeğini okur', () => {
    expect(infoPrice([{ fonKodu: 'IPV', fonUnvan: IPV_NAME, sonFiyat: 80.255315 }], 'IPV'))
      .toEqual({ price: 80.255315, name: IPV_NAME, asOf: null });
  });
});

describe('planFundAutoPrice', () => {
  it('eşlenmiş manuel fon, makul sapmada yazılır ve kilit kalkar', () => {
    expect(planFundAutoPrice({
      symbol: 'GPA',
      manualPrice: true,
      oldPrice: 19.56,
      nextPrice: 23.724091,
    })).toEqual({ write: true, clearManual: true, price: 23.724091 });
  });

  it('eşlenmiş manuel fonda 5 kattan büyük sapma satırı değiştirmez', () => {
    expect(planFundAutoPrice({
      symbol: 'GPY1PPF',
      manualPrice: true,
      oldPrice: 1.42,
      nextPrice: 0.142216,
    })).toEqual({ write: false, clearManual: false, reason: 'unlock-anomaly' });
  });

  it('otomatik fonda günlük %25 bandı durur', () => {
    expect(planFundAutoPrice({
      symbol: 'IPV',
      manualPrice: false,
      oldPrice: 80,
      nextPrice: 110,
    })).toEqual({ write: false, clearManual: false, reason: 'daily-anomaly' });
  });

  it('eşlenmemiş manuel fon hiç değişmez', () => {
    expect(planFundAutoPrice({
      symbol: 'EUROFON',
      manualPrice: true,
      oldPrice: 10,
      nextPrice: 10.1,
    })).toEqual({ write: false, clearManual: false, reason: 'manual-unmapped' });
  });

  it('fiyat yoksa kilit açık kalır', () => {
    expect(planFundAutoPrice({
      symbol: 'IPV',
      manualPrice: true,
      oldPrice: 80,
      nextPrice: null,
    })).toEqual({ write: false, clearManual: false, reason: 'no-price' });
  });
});

describe('fetchTefasFundPrice', () => {
  it('GPY1PPF isteğini GTL geçmiş fiyatına çevirir', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.fonKodu).toBe('GTL');
      expect(String(url)).toContain('fonFiyatBilgiGetir');
      return jsonResponse({
        errorCode: null,
        errorMessage: null,
        resultList: [
          { fonKodu: 'GTL', fonUnvan: GTL_NAME, tarih: '2026-10-15', fiyat: 0.141 },
          { fonKodu: 'GTL', fonUnvan: GTL_NAME, tarih: '2026-10-16', fiyat: 0.142216 },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const quote = await fetchTefasFundPrice('GPY1PPF');
    expect(quote).toEqual({ price: 0.142216, name: GTL_NAME, asOf: '2026-10-16' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('geçmiş boşsa fonBilgiGetir son fiyatına düşer', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('fonFiyatBilgiGetir')) {
        return jsonResponse({ errorCode: null, errorMessage: null, resultList: [] });
      }
      return jsonResponse({
        errorCode: null,
        errorMessage: null,
        resultList: [{ fonKodu: 'GPA', fonUnvan: GPA_NAME, sonFiyat: 23.724091 }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const quote = await fetchTefasFundPrice('GPA');
    expect(quote?.price).toBe(23.724091);
    expect(quote?.asOf).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ünvan beklenen fonu tutmuyorsa fiyat yazılmaz', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      errorCode: null,
      errorMessage: null,
      resultList: [{
        fonKodu: 'GTL',
        fonUnvan: 'BİR BAŞKA FON',
        tarih: '2026-10-16',
        fiyat: 5,
      }],
    })));
    expect(await fetchTefasFundPrice('GPY1PPF')).toBeNull();
  });
});
