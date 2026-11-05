import { INVESTMENT_SCHEDULE } from '../config';

export interface ScheduleBuy { date: string; amountEUR: number }
export interface ScheduleState {
  deployedEUR: number; remainingEUR: number; totalEUR: number; pct: number;
  buys: number; lastBuyDate: string | null; weeksLeft: number; finishDate: string | null;
}

const addDays = (iso: string, d: number) => {
  const t = new Date(`${iso.slice(0, 10)}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};

/** Alım günü Bükreş takvimiyle (gece yarısı UTC kaymasın). */
export function buyDay(ts: string): string {
  if (ts.length <= 10) return ts;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts.slice(0, 10) : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(d);
}

/** euroQty: EURO holding adedi. buys: START_DATE'ten beri VWCE alımları (€). today: YYYY-MM-DD */
export function investmentSchedule(euroQty: number, buys: ScheduleBuy[], today: string, cfg = INVESTMENT_SCHEDULE): ScheduleState {
  const own = buys.map(b => ({ ...b, date: buyDay(b.date) })).filter(b => b.date >= cfg.START_DATE).sort((a, b) => a.date.localeCompare(b.date));
  const days = [...new Set(own.map(b => b.date))];
  const deployedEUR = own.reduce((s, b) => s + (Number(b.amountEUR) || 0), 0);
  const remainingEUR = Math.max(0, (Number(euroQty) || 0) - cfg.RESERVE_EUR);
  const totalEUR = deployedEUR + remainingEUR;
  const weeksLeft = Math.ceil(remainingEUR / cfg.WEEKLY_EUR - 1e-9);
  const lastBuyDate = own.length ? own[own.length - 1].date.slice(0, 10) : null;
  const base = lastBuyDate && lastBuyDate > addDays(today, -7) ? lastBuyDate : addDays(today, -7);
  return {
    deployedEUR, remainingEUR, totalEUR, pct: totalEUR > 0 ? (deployedEUR / totalEUR) * 100 : 0,
    buys: days.length, lastBuyDate, weeksLeft,
    finishDate: weeksLeft > 0 ? addDays(base, weeksLeft * 7) : null,
  };
}
