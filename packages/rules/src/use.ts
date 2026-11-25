import { HEAL_DYING_CUT_MS, HEAL_HURT_CUT_MS, HURT_MS, ZUO_BUFF_MS, ZUO_DAN } from './config.ts';
import { item } from './content.ts';
import type { GameEvent } from './events.ts';
import { type Player, bank, heal, removeItem, statusAt } from './player.ts';

export function equipGongfa(p: Player, id: string, now: number): GameEvent[] {
  const g = item(id);
  if (g.cat !== 'gongfa') throw new Error('not gongfa');
  if ((p.inv[id] ?? 0) < 1) throw new Error('not owned');
  bank(p, now);
  p.gongfa = id;
  return [{ kind: 'gongfa_equip', id }];
}

export function useItem(p: Player, id: string, now: number): GameEvent[] {
  const it = item(id);
  const ev: GameEvent[] = [];
  const s = statusAt(p, now);
  if (it.effect === 'fullheal') {
    if (s === 'ok') throw new Error('无伤可治');
    removeItem(p, id);
    heal(p, 'ok', now, ev);
    return ev;
  }
  if (it.effect === 'heal') {

    if (s === 'ok') throw new Error('无伤可治');
    const t = it.tier;
    if (s === 'dying' && t < 2) throw new Error('药力不足以治濒死');
    removeItem(p, id);
    bank(p, now);
    if (s === 'hurt') {
      if (t >= 1) heal(p, 'ok', now, ev);
      else {
        p.statusUntil = Math.max(now, p.statusUntil - HEAL_HURT_CUT_MS);
        ev.push({ kind: 'healed', status: 'hurt', shortened: true });
      }
    } else if (t >= 5) heal(p, 'ok', now, ev);
    else if (t === 4) {

      p.status = 'hurt';
      p.statusUntil = Math.min(p.statusUntil, now + HURT_MS);
      ev.push({ kind: 'healed', status: 'hurt' });
    } else {
      p.statusUntil = Math.max(now, p.statusUntil - (HEAL_DYING_CUT_MS[t] as number));
      ev.push({ kind: 'healed', status: 'dying', shortened: true });
    }
    return ev;
  }
  if (it.effect === 'zuo') {
    removeItem(p, id);
    bank(p, now);
    const v = ZUO_DAN[it.tier] as number;
    p.buffs.push({ kind: 'zuo', value: v, until: now + ZUO_BUFF_MS });
    ev.push({ kind: 'buff', value: v, until: now + ZUO_BUFF_MS });
    return ev;
  }
  throw new Error('此物不能直接服用');
}
