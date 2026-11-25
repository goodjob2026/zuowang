import { LAYERS_PER_REALM, REBIRTH_PROTECT_MS, need } from './config.ts';
import type { GameEvent } from './events.ts';
import { type Player, bank, realmOf, removeItem, setStatus } from './player.ts';

export type DeathCause = 'jie' | 'mijing' | 'zhan';

export function die(p: Player, cause: DeathCause, now: number, events: GameEvent[]): boolean {
  bank(p, now);
  if ((p.inv.lunhui_zhu ?? 0) > 0) {
    removeItem(p, 'lunhui_zhu');
    events.push({ kind: 'death', cause, revived: true, level: p.level });
    setStatus(p, 'hurt', now, events);
    return false;
  }
  p.youli = null;

  const r = realmOf(p.level);
  p.level = r > 0 ? r * LAYERS_PER_REALM - 1 : 0;
  p.xiuwei = r > 0 ? need(p.level) : 0;
  p.status = 'ok';
  p.statusUntil = 0;
  p.dantian = { qi: 0, sitMs: 0, lostMs: 0, since: now };
  p.protectUntil = now + REBIRTH_PROTECT_MS;
  p.deaths += 1;
  p.needRebirth = true;
  delete p.slainBy;
  p.gateFails = 0;
  p.gateFullSince = r > 0 ? now : 0;
  events.push({ kind: 'death', cause, revived: false, level: p.level });
  return true;
}

export function completeRebirth(p: Player, xingxiang: string, gender: Player['gender'], xinxing: Player['xinxing'], daohao?: string, renshe?: string): void {
  if (!p.needRebirth) throw new Error('no rebirth pending');
  p.xingxiang = xingxiang;
  p.gender = gender;
  p.xinxing = xinxing;
  if (daohao) p.daohao = daohao;
  if (renshe) p.renshe = renshe;
  p.needRebirth = false;
  delete p.slainBy;
}

export function bingjie(p: Player, now: number): void {
  if (p.feisheng < 1) throw new Error('not ascended');
  bank(p, now);
  p.level = 0;
  p.maxLevel = 0;
  p.xiuwei = 0;
  p.dantian = { qi: 0, sitMs: 0, lostMs: 0, since: now };
}
