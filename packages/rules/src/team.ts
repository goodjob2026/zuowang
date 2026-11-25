import { TEAM_NPC_JOIN } from './config.ts';
import type { GameEvent } from './events.ts';
import { NPC_BY_ID, attitudeOf, npcDecline } from './ledger.ts';
import type { Out } from './nemesis.ts';
import { type Player, isActive, realmOf } from './player.ts';
import { type Push, type RegionWorld, type Stance, type Stay, enterBlock, enterRegion, isEarly, todayRealm } from './region.ts';
import { SeededRng, hashSeed } from './rng.ts';
import { resetDay } from './time.ts';
import { calDay } from './calendar.ts';
import { closeYuan, yuanOf } from './yuan.ts';

export interface TeamOpts {
  depth?: 0 | 1 | 2;
  push: Push;
  stance: Stance;
}

export interface MateCand {
  id: string;
  name: string;
  kind: 'friend' | 'npc';
  odds: number;
  busy: boolean;
  sworn: boolean;

  full: boolean;
  no: string | null;

  invited?: boolean;
}

export function invitedBy(p: Player, npc: string, now: number): boolean {
  const y = yuanOf(p, npc, ['repay']);
  return y?.form === 'tongxing' && y.show?.day === calDay(now);
}

export function mateCandidates(w: RegionWorld, p: Player, now: number): MateCand[] {
  const day = resetDay(now);
  const out: MateCand[] = [];
  for (const id of p.friends ?? []) {
    const o = w.players.get(id);
    if (!o || o.npc || o.needRebirth || !isActive(o, now) || realmOf(o.level) !== realmOf(p.level)) continue;
    out.push({ id: o.id, name: o.daohao, kind: 'friend', odds: 1, busy: false, sworn: false, full: false, no: o.shenDay === day ? '他今天已经出过一回神念' : null });
  }
  const npcs: MateCand[] = [];
  for (const o of w.players.values()) {
    if (!o.npc || o.needRebirth || o.id === p.id || realmOf(o.level) !== realmOf(p.level)) continue;
    const m = w.ledger ? attitudeOf({ ledger: w.ledger }, p.id, o.npc, now) : 'neutral';
    if (m !== 'sworn' && m !== 'friend') continue;
    const refused = p.mateNo?.day === day && p.mateNo.ids.includes(o.id);

    if (invitedBy(p, o.npc, now)) {
      npcs.push({ id: o.id, name: o.daohao, kind: 'npc', odds: 1, busy: !!o.stay || !!(o.youli && now < o.youli.end), sworn: m === 'sworn', full: true, no: null, invited: true });
      continue;
    }
    npcs.push({ id: o.id, name: o.daohao, kind: 'npc', odds: TEAM_NPC_JOIN[m], busy: !!o.stay || !!(o.youli && now < o.youli.end), sworn: m === 'sworn', full: true, no: refused ? '他今天回绝过你' : null });
  }
  npcs.sort((a, b) => b.odds - a.odds || a.id.localeCompare(b.id));
  return [...out, ...npcs];
}

export function teamBlock(w: RegionWorld, p: Player, toId: string, now: number): string | null {
  const t = w.players.get(toId);
  if (!t || t.id === p.id || t.needRebirth) return '没有这个人';
  const why = enterBlock(w, p, undefined, now);
  if (why) return why;
  const c = mateCandidates(w, p, now).find((x) => x.id === toId);
  if (!c) {
    if (realmOf(t.level) !== realmOf(p.level)) return '要同一个境界才能结伴';
    return t.npc ? '他和你还没有这份交情' : '只有至交才肯分出神念陪你';
  }
  return c.no;
}
function go(w: RegionWorld, p: Player, o: TeamOpts, now: number, out: Out, mate: NonNullable<Stay['mate']>): GameEvent[] {
  const ev: GameEvent[] = [];
  enterRegion(w, p, todayRealm(w, p, now).id, isEarly(p.level) ? 'spare' : o.stance, now, (id, e) => (id === p.id ? ev.push(e) : out(id, e)), undefined, o.depth, o.push, mate);
  return ev;
}

export function teamInvite(w: RegionWorld, p: Player, toId: string, o: TeamOpts, now: number, out: Out): GameEvent[] {
  const why = teamBlock(w, p, toId, now);
  if (why) throw new Error(why);
  const t = w.players.get(toId) as Player;
  const day = resetDay(now);
  if (!t.npc) {
    t.shenDay = day;
    return [{ kind: 'team_go', with: t.daohao, mode: 'shen' }, ...go(w, p, o, now, out, { pid: t.id, name: t.daohao, mode: 'shen', lead: true })];
  }
  const c = mateCandidates(w, p, now).find((x) => x.id === toId) as MateCand;
  if (c.odds < 1 && new SeededRng(hashSeed(`${w.seed}:teamask:${p.id}:${t.id}:${day}`)).nextFloat() >= c.odds) {
    p.mateNo = p.mateNo?.day === day ? { day, ids: [...p.mateNo.ids, t.id] } : { day, ids: [t.id] };
    const def = NPC_BY_ID.get(t.npc);
    return [{ kind: 'team_no', with: t.daohao, npc: t.npc, line: def ? npcDecline(def, now) : '今日不便，改日再说。' }];
  }
  if (!c.full || enterBlock(w, t, undefined, now) !== null) {
    return [{ kind: 'team_go', with: t.daohao, mode: 'aid' }, ...go(w, p, o, now, out, { pid: t.id, name: t.daohao, mode: 'aid', lead: true })];
  }

  const kept: GameEvent[] = [];
  const y = invitedBy(p, t.npc, now) ? yuanOf(p, t.npc, ['repay']) : undefined;
  if (y) kept.push(closeYuan(p, y, 'tongxing', now));

  const ev = [...go(w, p, o, now, out, { pid: t.id, name: t.daohao, mode: 'team', lead: true, ...(y ? { sure: true } : {}) }), ...kept];
  for (const e of go(w, t, { ...o, stance: 'spare' }, now, out, { pid: p.id, name: p.daohao, mode: 'team', lead: false })) out(t.id, e);
  return [{ kind: 'team_go', with: t.daohao, mode: 'team' }, ...ev];
}
