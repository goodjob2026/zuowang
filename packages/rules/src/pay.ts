import { JULING_EFFICACY, JULING_HOURS, JULING_MAX_PER_DAY } from './config.ts';
import type { GameEvent } from './events.ts';
import { type Player, bank, grantXiuweiHours, heal, statusAt } from './player.ts';
import { resetDay } from './time.ts';

export type Product = 'juling' | 'heal_hurt' | 'heal_dying';

export function julingEfficacy(p: Player, now: number): { nth: number; efficacy: number; allowed: boolean } {
  const day = resetDay(now);
  const used = p.julingDay === day ? p.julingCount : 0;
  return { nth: used + 1, efficacy: JULING_EFFICACY[Math.min(used, JULING_EFFICACY.length - 1)] as number, allowed: used < JULING_MAX_PER_DAY };
}

export function canBuy(p: Player, product: Product, now: number): string | null {
  const s = statusAt(p, now);
  if (product === 'juling') return julingEfficacy(p, now).allowed ? null : '今日药力已到极限';
  if (product === 'heal_hurt') return s === 'hurt' ? null : '没有受伤';
  if (product === 'heal_dying') return s === 'dying' ? null : '没有濒死';
  return 'unknown product';
}

export function deliver(p: Player, product: Product, now: number): GameEvent[] {
  const ev: GameEvent[] = [];
  bank(p, now);
  if (product === 'juling') {
    const e = julingEfficacy(p, now);
    const day = resetDay(now);
    if (p.julingDay !== day) {
      p.julingDay = day;
      p.julingCount = 0;
    }
    p.julingCount += 1;
    const gain = e.allowed ? grantXiuweiHours(p, JULING_HOURS * e.efficacy, now, ev) : 0;
    ev.unshift({ kind: 'juling', gain, efficacy: e.allowed ? e.efficacy : 0, nth: e.nth });
    return ev;
  }
  const s = statusAt(p, now);
  if (product === 'heal_hurt') {
    if (s === 'hurt') heal(p, 'ok', now, ev);
    return ev;
  }

  const day = resetDay(now);
  if (p.healDyingDay !== day) {
    p.healDyingDay = day;
    p.healDyingCount = 0;
  }
  p.healDyingCount += 1;
  if (s === 'dying') heal(p, p.healDyingCount >= 2 ? 'hurt' : 'ok', now, ev);
  return ev;
}
