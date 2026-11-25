import { TRUST_GAIN, addTrust } from './trust.ts';
import { hasGrudge } from './yuan.ts';
import {
  DUN_TO,
  ENCOUNTER_DAILY_CHANCE,
  ENCOUNTER_DECIDE_MS,
  ENCOUNTER_PAIR_COOLDOWN_MS,
  KILL_SHANE,
  ZHAN_SUCCESS,
  ZHENG_MO_FIGHT_CHANCE,
  ZHENG_VS_MO_BONUS,
} from './config.ts';
import { duelWinProb, powerOf } from './combat.ts';
import type { GameEvent } from './events.ts';
import { die } from './fate.ts';
import { type Player, addItem, bank, campOf, grantXiuweiHours, isActive, nextUid, realmOf, removeItem, setStatus } from './player.ts';
import { type Rng, chance, pick, shuffle } from './rng.ts';
import { rollItem } from './mijing.ts';
import { BASE_LOOT_TIER } from './config.ts';
import { item } from './content.ts';
import { applyShane } from './qiyu.ts';
import { type Out, addEnemy, afterKill, lethalBlock } from './nemesis.ts';
import { type RegionWorld, bandOf, kickOut, stayOf } from './region.ts';

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function dailyPairs(players: Player[], met: Record<string, number>, now: number, rng: Rng): [Player, Player][] {
  const pool = shuffle(
    rng,
    players.filter((p) => !p.needRebirth && !p.npc && isActive(p, now) && chance(rng, ENCOUNTER_DAILY_CHANCE)),
  );
  const pairs: [Player, Player][] = [];
  const used = new Set<string>();
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i] as Player;
    if (used.has(a.id)) continue;
    for (let j = i + 1; j < pool.length; j++) {
      const b = pool[j] as Player;
      if (used.has(b.id)) continue;
      if (bandOf(a.level) !== bandOf(b.level)) continue;
      const last = met[pairKey(a.id, b.id)];
      if (last !== undefined && now - last < ENCOUNTER_PAIR_COOLDOWN_MS) continue;
      pairs.push([a, b]);
      used.add(a.id);
      used.add(b.id);
      met[pairKey(a.id, b.id)] = now;
      break;
    }
  }
  return pairs;
}

function push(m: Map<string, GameEvent[]>, id: string, e: GameEvent) {
  const a = m.get(id) ?? [];
  a.push(e);
  m.set(id, a);
}

export function resolvePair(a: Player, b: Player, now: number, rng: Rng, out: Map<string, GameEvent[]>): void {
  bank(a, now);
  bank(b, now);
  const ca = campOf(a);
  const cb = campOf(b);
  const prot = now < a.protectUntil || now < b.protectUntil;
  const base = (type: string, extra: Record<string, unknown> = {}) => {
    push(out, a.id, { kind: 'encounter', type, other: b.daohao, otherCamp: cb, ...extra });
    push(out, b.id, { kind: 'encounter', type, other: a.daohao, otherCamp: ca, ...extra });
  };
  const opposed = (ca === 'zheng' && cb === 'mo') || (ca === 'mo' && cb === 'zheng');
  if (!prot && opposed && !chance(rng, ZHENG_MO_FIGHT_CHANCE)) {
    base('duizhi');
    return;
  }
  if (!prot && opposed) {
    const z = ca === 'zheng' ? a : b;
    const m = ca === 'zheng' ? b : a;
    const pz = duelWinProb(powerOf(z, now), powerOf(m, now), ZHENG_VS_MO_BONUS);
    const zWins = chance(rng, pz);
    const win = zWins ? z : m;
    const lose = zWins ? m : z;
    const evL: GameEvent[] = [];
    setStatus(lose, 'hurt', now, evL);
    win.pendingKills.push({ uid: nextUid(win), targetId: lose.id, targetName: lose.daohao, until: now + ENCOUNTER_DECIDE_MS });
    push(out, win.id, { kind: 'encounter', type: 'fight', other: lose.daohao, otherCamp: campOf(lose), won: true });
    push(out, lose.id, { kind: 'encounter', type: 'fight', other: win.daohao, otherCamp: campOf(win), won: false });
    for (const e of evL) push(out, lose.id, e);
    return;
  }
  const r = rng.nextFloat();
  if (ca === 'zheng' && cb === 'zheng') {
    if (r < 0.4) {
      const ga = grantXiuweiHours(a, 1, now, []);
      const gb = grantXiuweiHours(b, 1, now, []);
      push(out, a.id, { kind: 'encounter', type: 'lundao', other: b.daohao, otherCamp: cb, xiuwei: ga });
      push(out, b.id, { kind: 'encounter', type: 'lundao', other: a.daohao, otherCamp: ca, xiuwei: gb });
    } else if (r < 0.7) {
      const giver = chance(rng, 0.5) ? a : b;
      const taker = giver === a ? b : a;
      const gift = rollItem(taker.level, BASE_LOOT_TIER[realmOf(taker.level)] as number, rng, 'cao');
      addItem(taker, gift);
      push(out, taker.id, { kind: 'encounter', type: 'zengli', other: giver.daohao, otherCamp: campOf(giver), got: gift });
      push(out, giver.id, { kind: 'encounter', type: 'zengli_give', other: taker.daohao, otherCamp: campOf(taker), gave: gift });
    } else base('cajian');
    return;
  }
  if (ca === 'mo' && cb === 'mo' && !prot) {
    if (r < 0.4) {
      const ls = (x: Player) => 20 * (1 + realmOf(x.level));
      a.lingshi += ls(a);
      b.lingshi += ls(b);
      push(out, a.id, { kind: 'encounter', type: 'fenzang', other: b.daohao, otherCamp: cb, lingshi: ls(a) });
      push(out, b.id, { kind: 'encounter', type: 'fenzang', other: a.daohao, otherCamp: ca, lingshi: ls(b) });
    } else if (r < 0.7) {
      const aWins = chance(rng, duelWinProb(powerOf(a, now), powerOf(b, now)));
      const win = aWins ? a : b;
      const lose = aWins ? b : a;
      const pills = Object.keys(lose.inv).filter((id) => item(id).cat === 'dan');
      let lost: string | null = null;
      if (pills.length) {
        lost = pick(rng, pills);
        removeItem(lose, lost);
        addItem(win, lost);
      } else {
        const ls = Math.min(lose.lingshi, 30);
        lose.lingshi -= ls;
        win.lingshi += ls;
      }
      push(out, win.id, { kind: 'encounter', type: 'heichihei', other: lose.daohao, otherCamp: campOf(lose), won: true, item: lost });
      push(out, lose.id, { kind: 'encounter', type: 'heichihei', other: win.daohao, otherCamp: campOf(win), won: false, item: lost });
    } else base('cajian');
    return;
  }

  if (r < 0.35) {
    a.lingshi += 10;
    b.lingshi += 10;
    base('wenlu', { lingshi: 10 });
  } else base('cajian');
}

export function decideKill(
  p: Player,
  uid: string,
  kill: boolean,
  target: Player | undefined,
  now: number,
  out: Map<string, GameEvent[]>,
  w: RegionWorld,
  rng: Rng,
): void {
  const idx = p.pendingKills.findIndex((k) => k.uid === uid);
  if (idx < 0) throw new Error('nothing to decide');
  const pk = p.pendingKills[idx] as (typeof p.pendingKills)[number];
  p.pendingKills.splice(idx, 1);
  const camp = campOf(p);
  if (!kill || !target) {
    applyShane(p, camp === 'zheng' ? KILL_SHANE.zhengSparesMo : KILL_SHANE.moSparesZheng, out.get(p.id) ?? setGet(out, p.id));
    push(out, p.id, { kind: 'decide', target: pk.targetName, kill: false });
    if (target) {
      push(out, target.id, { kind: 'spared', by: p.daohao });
      addTrust(target, p.id, TRUST_GAIN.spare);
    }
    return;
  }

  const killShane = camp === 'zheng' ? KILL_SHANE.zhengKillsMo : KILL_SHANE.moKillsZheng;
  if (!(killShane < 0 && target.npc && hasGrudge(p, target.npc))) applyShane(p, killShane, out.get(p.id) ?? setGet(out, p.id));
  const emit: Out = (id, e) => push(out, id, e);
  const block = lethalBlock(p, target, now);
  if (block) {

    const ev: GameEvent[] = [];
    setStatus(target, block === 'protect' ? 'hurt' : 'dying', now, ev);
    if (block !== 'protect') addEnemy(target, p.id, now, 'maim');
    push(out, p.id, { kind: 'decide', target: pk.targetName, kill: true, blocked: true, block });
    push(out, target.id, { kind: 'zhan_blocked', by: p.daohao, dying: block !== 'protect' });
    for (const e of ev) push(out, target.id, e);
    const st0 = block !== 'protect' ? stayOf(w, target) : null;
    if (st0 && st0.status === 'in') kickOut(w, st0, target, now, emit);
    return;
  }
  const dun = Object.keys(target.inv)
    .filter((id) => (target.inv[id] ?? 0) > 0 && item(id).effect === 'dun')
    .sort((a, b) => item(b).tier - item(a).tier)[0];
  if (dun || !chance(rng, ZHAN_SUCCESS)) {

    const to = dun ? (DUN_TO[item(dun).tier] as 'dying' | 'hurt' | 'safe') : 'dying';
    if (dun) removeItem(target, dun);
    const ev: GameEvent[] = [];
    if (to !== 'safe') setStatus(target, to, now, ev);
    addEnemy(target, p.id, now, 'maim');
    push(out, p.id, { kind: 'decide', target: pk.targetName, kill: true, escaped: true });
    push(out, target.id, { kind: 'zhan_escaped', by: p.daohao, dun: dun ?? null, to });
    for (const e of ev) push(out, target.id, e);
    const st = stayOf(w, target);
    if (st && st.status === 'in') kickOut(w, st, target, now, emit);
    return;
  }
  const ev: GameEvent[] = [{ kind: 'killed', by: p.daohao }];
  const reborn = die(target, 'zhan', now, ev);
  for (const e of ev) push(out, target.id, e);
  push(out, p.id, { kind: 'decide', target: pk.targetName, kill: true });
  afterKill(w, p, target, now, emit, { revived: !reborn });
  const st = stayOf(w, target);
  if (st && st.status === 'in') kickOut(w, st, target, now, emit);
}
function setGet(m: Map<string, GameEvent[]>, id: string): GameEvent[] {
  const a: GameEvent[] = [];
  m.set(id, a);
  return a;
}

export function expireKills(p: Player, now: number, events: GameEvent[]): void {
  const keep = [];
  for (const k of p.pendingKills) {
    if (k.until <= now) {
      applyShane(p, campOf(p) === 'zheng' ? KILL_SHANE.zhengSparesMo : KILL_SHANE.moSparesZheng, events);
      events.push({ kind: 'decide', target: k.targetName, kill: false, auto: true });
    } else keep.push(k);
  }
  p.pendingKills = keep;
}
