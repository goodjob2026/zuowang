import { BASE_LOOT_TIER, DAY, QIANDAO_CYCLE, QIANDAO_LINGSHI_RATE } from './config.ts';
import type { GameEvent } from './events.ts';
import { rollItem } from './mijing.ts';
import { type Player, addItem, realmOf } from './player.ts';
import { rikeLingshi } from './rike.ts';
import { SeededRng, hashSeed } from './rng.ts';
import { resetDay } from './time.ts';

export function signedToday(p: Player, now: number): boolean {
  return p.qiandao?.day === resetDay(now);
}

export function qiandaoStreak(p: Player, now: number): number {
  const q = p.qiandao;
  if (!q?.day) return 0;
  return q.day === resetDay(now) || q.day === resetDay(now - DAY) ? q.streak : 0;
}

export const QIANDAO_TUNE = { rate: QIANDAO_LINGSHI_RATE };

export const qiandaoLingshi = (p: Player): number => Math.max(1, Math.round(rikeLingshi(p) * QIANDAO_TUNE.rate));

export function qiandao(p: Player, now: number): GameEvent[] {
  if (p.needRebirth) throw new Error('转世之后再签');
  if (signedToday(p, now)) throw new Error('今日已签过了');
  const day = resetDay(now);
  const n = (qiandaoStreak(p, now) % QIANDAO_CYCLE) + 1;
  p.qiandao = { day, streak: n };
  const lingshi = qiandaoLingshi(p);
  p.lingshi += lingshi;
  const e: GameEvent = { kind: 'qiandao', n, lingshi };
  if (n === QIANDAO_CYCLE) {
    const rng = new SeededRng(hashSeed(`${p.id}:qiandao:${day}`));
    const got = rollItem(p.level, BASE_LOOT_TIER[realmOf(p.level)] as number, rng, rng.nextFloat() < 0.7 ? 'cao' : 'fu');
    addItem(p, got, 1);
    e.got = got;
  }
  return [e];
}
