import {
  CATCHUP_SHIELD_LAG,
  DANTIAN_CAP_MS,
  DAY,
  HOUR,
  LUNDAO_GET_PER_DAY,
  LUNDAO_GIVE_PER_DAY,
  LUNDAO_HOURS,
  LUNDAO_TRUST,
  RAID_HEAVY_MS,
  RAID_HIT_PER_DAY,
  RAID_HOME_BONUS,
  RAID_HURT_MS,
  RAID_MIN_LEVEL,
  RAID_PER_DAY,
  RAID_REVENGE_BONUS,
  RAID_REVENGE_MS,
  RAID_SAME_MS,
  RAID_SHANE,
  RAID_SHIELD_MS,
  RAID_STREAK_DAYS,
  RAID_TAKE,
  RAID_TAKE_CAP_HOURS,
} from './config.ts';
import { isFriend } from './bonds.ts';
import { duelWinProb, powerOf } from './combat.ts';
import { item } from './content.ts';
import type { GameEvent, Rumor } from './events.ts';
import { type Out, addEnemy } from './nemesis.ts';
import { type Player, accrue, awayAt, bank, effectiveLoadout, grantXiuweiHours, healthyRate, isActive, lagRealms, realmOf, statusAt } from './player.ts';
import { applyShane } from './qiyu.ts';
import type { Rng } from './rng.ts';
import { addDays, resetDay, weekKey } from './time.ts';
import { TRUST_LOSS, addTrust, checkBond } from './trust.ts';

export interface RaidWorld {
  players: Map<string, Player>;
  rumors: Rumor[];
}

function lundaoOf(p: Player, now: number): NonNullable<Player['lundao']> {
  const day = resetDay(now);
  if (p.lundao?.day !== day) p.lundao = { day, gave: 0, got: 0 };
  return p.lundao as NonNullable<Player['lundao']>;
}

export function lundaoBlock(p: Player, t: Player | undefined, now: number): string | null {
  if (!t || t.id === p.id || t.needRebirth) return '没有这个人';
  if (t.npc) return '论道找的是道友；山中人物在「山中人物」里往来';
  if (realmOf(t.level) !== realmOf(p.level)) return '要同一个大境界才论得起来';
  if (!isActive(t, now)) return '他许久没回山了';
  if (lundaoOf(p, now).gave >= LUNDAO_GIVE_PER_DAY) return '今天已经论过道了';
  if (lundaoOf(t, now).got >= LUNDAO_GET_PER_DAY) return '今天找他论道的人太多了';
  return null;
}
export function lundao(p: Player, t: Player | undefined, now: number, out: Out): GameEvent[] {
  const why = lundaoBlock(p, t, now);
  if (why) throw new Error(why);
  const o = t as Player;
  lundaoOf(p, now).gave += 1;
  lundaoOf(o, now).got += 1;
  const ev: GameEvent[] = [];
  const mine = grantXiuweiHours(p, LUNDAO_HOURS, now, ev);
  const oev: GameEvent[] = [];
  const his = grantXiuweiHours(o, LUNDAO_HOURS, now, oev);
  addTrust(p, o.id, LUNDAO_TRUST);
  addTrust(o, p.id, LUNDAO_TRUST);
  out(o.id, { kind: 'lundao_got', from: p.daohao, xiuwei: his });
  for (const e of oev) out(o.id, e);
  return [{ kind: 'lundao_go', with: o.daohao, xiuwei: mine }, ...ev];
}

export function raidOf(p: Player, now: number): NonNullable<Player['raid']> {
  const day = resetDay(now);
  p.raid ??= { day, made: 0, by: {}, shieldUntil: 0, hitDay: day, hit: 0, streak: 0, streakDay: '', owed: null, heavyWeek: '' };
  const r = p.raid;
  if (r.day !== day) {
    r.day = day;
    r.made = 0;
  }
  if (r.hitDay !== day) {
    r.hitDay = day;
    r.hit = 0;
  }
  if (r.owed && now >= r.owed.until) r.owed = null;
  for (const [id, at] of Object.entries(r.by)) if (now - at >= RAID_SAME_MS) delete r.by[id];
  return r;
}

export function shielded(t: Player, now: number): boolean {
  const r = raidOf(t, now);
  if (now < r.shieldUntil) return true;
  return r.streak >= RAID_STREAK_DAYS && resetDay(now) === addDays(r.streakDay, 1);
}

function raidPower(p: Player, now: number): number {
  return powerOf(p, now, effectiveLoadout(p).filter((id) => item(id).cat === 'fabao')).power;
}

export function isFoe(p: Player, t: Player): boolean {
  return p.enemies.some((e) => e.id === t.id) || (p.foes ?? []).includes(t.id);
}

export function stockOf(t: Player, now: number): { qi: number; level: 'empty' | 'half' | 'full' } {
  const qi = accrue(t, now).qi;
  const cap = healthyRate(t, now) * (DANTIAN_CAP_MS / HOUR);
  const f = cap > 0 ? qi / cap : 0;
  return { qi, level: f < 0.25 ? 'empty' : f < 0.7 ? 'half' : 'full' };
}
export interface RaidPreview {
  pWin: number;

  qi: number;
  stock: 'empty' | 'half' | 'full';
}
export function raidPreview(p: Player, t: Player, now: number, revenge = false): RaidPreview {
  const pa = raidPower(p, now);
  const pd = raidPower(t, now) * (1 + RAID_HOME_BONUS);
  const pWin = duelWinProb({ power: pa, yun: 0 }, { power: pd, yun: 0 });
  const st = stockOf(t, now);
  const owed = revenge ? raidOf(p, now).owed : null;
  const qi = owed ? Math.round(owed.qi * (1 + RAID_REVENGE_BONUS)) : Math.floor(Math.min(st.qi * RAID_TAKE, healthyRate(p, now) * RAID_TAKE_CAP_HOURS) * Math.min(1, pd / (1 + RAID_HOME_BONUS) / pa));
  return { pWin, qi, stock: st.level };
}

export function raidBlock(p: Player, t: Player | undefined, now: number, revenge = false): string | null {
  if (!t || t.id === p.id || t.needRebirth) return '没有这个人';
  if (t.npc) return '山中人物居无定所，没有洞府可闯';
  if (p.level < RAID_MIN_LEVEL) return '筑基之后才碰得了洞府的事';
  if (t.level < RAID_MIN_LEVEL) return '他还在练气，不闯新人的洞府';
  if (realmOf(t.level) !== realmOf(p.level)) return '要同一个大境界';
  if (statusAt(p, now) !== 'ok') return '你身上带着伤，闯不动';
  if (p.stay || awayAt(p, now)) return '你人不在洞府';
  if (now < (p.newbieUntil ?? 0)) return '你初入山门，护体未散，先别惹事';

  if (!revenge && raidOf(p, now).by[t.id] !== undefined) return '三天内闯过他一回了';
  if (statusAt(t, now) !== 'ok') return '他正养着伤，不落井下石';
  if (revenge) {
    const owed = raidOf(p, now).owed;
    return owed && owed.from === t.id ? null : '眼下没有能向他讨回来的账';
  }
  if (!isActive(t, now)) return '他许久没回山了';
  if (isFriend(p, t.id)) return '至交的洞府不能闯';
  if (now < (t.newbieUntil ?? 0) || now < t.protectUntil) return '他有护体，闯不得';
  if (lagRealms(t) >= CATCHUP_SHIELD_LAG) return '他是后来者，天道护着';
  const mine = raidOf(p, now);
  if (mine.made >= RAID_PER_DAY) return `今天已经闯过 ${RAID_PER_DAY} 回了`;
  if (mine.by[t.id] !== undefined) return '三天内闯过他一回了';
  if (shielded(t, now)) return '他的洞府护阵正开着';
  if (raidOf(t, now).hit >= RAID_HIT_PER_DAY) return '他今天已经被人闯过了';

  if (raidPreview(p, t, now).qi <= 0) return '闯了也无物可取';
  return null;
}

function wound(p: Player, kind: 'hurt' | 'dying', now: number, ev: GameEvent[]): void {
  bank(p, now);
  p.status = kind;
  p.statusUntil = now + (kind === 'hurt' ? RAID_HURT_MS : RAID_HEAVY_MS);
  ev.push({ kind: 'status', status: kind, until: p.statusUntil, ms: p.statusUntil - now });
}

export function raid(w: RaidWorld, p: Player, t: Player | undefined, now: number, rng: Rng, out: Out, opt: { heavy?: boolean; revenge?: boolean } = {}): GameEvent[] {
  const revenge = !!opt.revenge;
  const why = raidBlock(p, t, now, revenge);
  if (why) throw new Error(why);
  const o = t as Player;
  const mine = raidOf(p, now);
  const his = raidOf(o, now);
  const heavy = !!opt.heavy && isFoe(p, o) && his.heavyWeek !== weekKey(now);
  const pv = raidPreview(p, o, now, revenge);
  const won = rng.nextFloat() < pv.pWin;
  const ev: GameEvent[] = [];
  const oev: GameEvent[] = [];
  let qi = 0;
  if (won) {
    bank(o, now);
    bank(p, now);
    if (revenge) {
      qi = pv.qi;
      o.dantian.qi = Math.max(0, o.dantian.qi - qi);
    } else {
      qi = Math.min(pv.qi, Math.floor(o.dantian.qi));
      o.dantian.qi -= qi;
    }
    p.dantian.qi += qi;
    wound(o, heavy ? 'dying' : 'hurt', now, oev);
    if (heavy) his.heavyWeek = weekKey(now);
  } else wound(p, heavy ? 'dying' : 'hurt', now, ev);
  if (revenge) mine.owed = null;
  else {
    mine.made += 1;
    mine.by[o.id] = now;
    his.shieldUntil = now + RAID_SHIELD_MS;
    if (won) {
      const day = resetDay(now);
      his.hit += 1;
      his.streak = his.streakDay === day ? his.streak : his.streakDay === addDays(day, -1) ? his.streak + 1 : 1;
      his.streakDay = day;
      his.owed = { from: p.id, name: p.daohao, qi, until: now + RAID_REVENGE_MS };
    }

    applyShane(p, RAID_SHANE, ev, now);
    addTrust(o, p.id, -TRUST_LOSS.rob);
    checkBond(o, p);
    addEnemy(o, p.id, now, 'rob');
    w.rumors.push({ at: now, kind: 'raid', who: p.daohao, text: `${o.daohao}|${won ? 1 : 0}|${qi}` });
  }
  out(o.id, { kind: 'raided', by: p.daohao, won, qi, heavy, revenge, until: !revenge && won ? now + RAID_REVENGE_MS : 0 });
  for (const e of oev) out(o.id, e);
  return [{ kind: 'raid', target: o.daohao, won, qi, pWin: pv.pWin, heavy, revenge }, ...ev];
}

export const RAID_DAY = DAY;
