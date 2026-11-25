import type { GameEvent } from './events.ts';
import { expireKills } from './encounter.ts';
import { type Player, bank, fillDefaults } from './player.ts';
import { rollRike } from './rike.ts';
import { pruneEnemies } from './nemesis.ts';
import { type MeetWorld, settleYouli } from './youli.ts';
import { grantQiyu, moGongfaTick } from './qiyu.ts';
import { SeededRng, hashSeed } from './rng.ts';
import { addDays, atJst, resetDay } from './time.ts';
import { DAILY_RESET_HOUR, QIYU_NOON_HOUR } from './config.ts';

export function catchUp(p: Player, now: number, w?: MeetWorld): GameEvent[] {
  const ev: GameEvent[] = [];
  fillDefaults(p);
  bank(p, now);
  settleYouli(p, now, ev, w);
  const today = resetDay(now);
  if (p.dailyDay === '') {
    p.dailyDay = today;
    grantQiyu(p, now, new SeededRng(hashSeed(`${p.id}:qiyu:${today}`)), ev);

    p.qiyuNoon = now >= atJst(today, QIYU_NOON_HOUR) ? today : addDays(today, -1);
  } else {
    let d = p.dailyDay;
    let guard = 0;
    while (d < today && guard++ < 60) {
      d = addDays(d, 1);
      const at = atJst(d, DAILY_RESET_HOUR);
      grantQiyu(p, at, new SeededRng(hashSeed(`${p.id}:qiyu:${d}`)), ev);
      moGongfaTick(p, ev, at);
    }
    p.dailyDay = today;
  }

  {
    let d = p.qiyuNoon || addDays(today, -1);
    let guard = 0;
    while (d < today && guard++ < 60) {
      const nd = addDays(d, 1);
      const at = atJst(nd, QIYU_NOON_HOUR);
      if (at > now) break;
      grantQiyu(p, at, new SeededRng(hashSeed(`${p.id}:qiyu2:${nd}`)), ev, true);
      d = nd;
    }
    p.qiyuNoon = d;
  }
  if (p.rike.day !== today) rollRike(p, today, now);
  pruneEnemies(p, now);
  expireKills(p, now, ev);
  return ev;
}
