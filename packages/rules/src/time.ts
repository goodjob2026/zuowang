import { DAILY_RESET_HOUR, DAY, HOUR } from './config.ts';

const OFFSET = 9 * HOUR;

export function dayKey(ms: number): string {
  return new Date(ms + OFFSET).toISOString().slice(0, 10);
}

export function atJst(day: string, hour: number): number {
  return Date.parse(`${day}T00:00:00Z`) - OFFSET + hour * HOUR;
}

export function resetDay(ms: number): string {
  return dayKey(ms - DAILY_RESET_HOUR * HOUR);
}
export function addDays(day: string, n: number): string {
  return dayKey(atJst(day, 12) + n * DAY);
}

export function nextAt(ms: number, hour: number): number {
  const t = atJst(dayKey(ms), hour);
  return t >= ms ? t : t + DAY;
}

export function weekKey(ms: number): string {
  const d = dayKey(ms);
  const dow = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(d, -dow);
}

export function isoJst(ms: number): string {
  return `${new Date(ms + OFFSET).toISOString().slice(0, 19)}+09:00`;
}
export function hourJst(ms: number): number {
  return new Date(ms + OFFSET).getUTCHours() + new Date(ms + OFFSET).getUTCMinutes() / 60;
}
