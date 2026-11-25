import { AMENDS_BASE, AVENGER_MAX, DAY, MEDIATE_COOLDOWN_MS, VOW_DELAY_MS, GATE_ALLY_CHANCE, GATE_FOE_CHANCE, GATE_FOE_PENALTY, GATE_HELPER_GUARD, GATE_HELP_EACH, GATE_HELP_MAX, HOUR } from './config.ts';
import type { GameEvent } from './events.ts';
import { type LedgerEntry, NPC_BY_ID, attitudeOf, kinOf, reasonsOf, record } from './ledger.ts';
import type { Out } from './nemesis.ts';
import { duelWinProb, powerOf } from './combat.ts';
import { SeededRng, hashSeed } from './rng.ts';
import { type Player, realmOf } from './player.ts';
import { TRUST_NEED, trustEnough, trustOf } from './trust.ts';

export const FRIEND_MAX = 8;
export const FOE_MAX = 3;

export const FRIEND_ASK_KEEP_MS = 7 * DAY;

export interface BondWorld {
  players: Map<string, Player>;
  ledger?: LedgerEntry[];
}
const fr = (p: Player) => (p.friends ??= []);
const asks = (p: Player) => (p.friendAsks ??= []);
const fo = (p: Player) => (p.foes ??= []);

export function isFriend(p: Player, id: string): boolean {
  return (p.friends ?? []).includes(id);
}

export function friendBlock(w: BondWorld, p: Player, targetId: string, now: number): string | null {
  const t = w.players.get(targetId);
  if (!t || t.id === p.id) return '没有这个人';
  if (t.npc) return '他不是能这样结交的人，对他好，他自然记着';
  if (isFriend(p, t.id)) return '已经是至交了';
  if (fr(p).length >= FRIEND_MAX) return `至交最多 ${FRIEND_MAX} 位`;
  if (fr(t).length >= FRIEND_MAX) return '他的至交已经满了';
  if (asks(t).some((a) => a.from === p.id && now - a.at < FRIEND_ASK_KEEP_MS)) return '已经问过他了，等他回话';

  if (!trustEnough(p, t)) return `交情还不够：要彼此的信任都到 ${TRUST_NEED} 才能结为至交（你信他 ${trustOf(p, t.id)}，他信你 ${trustOf(t, p.id)}）`;
  return null;
}
function bind(a: Player, b: Player): void {
  if (!fr(a).includes(b.id)) fr(a).push(b.id);
  if (!fr(b).includes(a.id)) fr(b).push(a.id);
  a.friendAsks = asks(a).filter((x) => x.from !== b.id);
  b.friendAsks = asks(b).filter((x) => x.from !== a.id);

  a.foes = fo(a).filter((x) => x !== b.id);
  b.foes = fo(b).filter((x) => x !== a.id);
}

export function friendAsk(w: BondWorld, p: Player, targetId: string, now: number, out: Out): GameEvent[] {
  const why = friendBlock(w, p, targetId, now);
  if (why) throw new Error(why);
  const t = w.players.get(targetId) as Player;
  if (asks(p).some((a) => a.from === t.id)) {
    bind(p, t);
    out(t.id, { kind: 'friend_made', with: p.daohao });
    return [{ kind: 'friend_made', with: t.daohao }];
  }
  t.friendAsks = [...asks(t).filter((a) => a.from !== p.id && now - a.at < FRIEND_ASK_KEEP_MS), { from: p.id, at: now }];
  out(t.id, { kind: 'friend_ask', from: p.daohao });
  return [{ kind: 'friend_asked', to: t.daohao }];
}

export function friendAnswer(w: BondWorld, p: Player, fromId: string, accept: boolean, now: number, out: Out): GameEvent[] {
  const a = asks(p).find((x) => x.from === fromId && now - x.at < FRIEND_ASK_KEEP_MS);
  const from = w.players.get(fromId);
  p.friendAsks = asks(p).filter((x) => x.from !== fromId);
  if (!a || !from) throw new Error('这份请求已经过期了');
  if (!accept) return [{ kind: 'friend_declined', who: from.daohao }];
  if (!trustEnough(p, from)) throw new Error('交情已经不够了');
  if (fr(p).length >= FRIEND_MAX) throw new Error(`至交最多 ${FRIEND_MAX} 位`);
  if (fr(from).length >= FRIEND_MAX) throw new Error('他的至交已经满了');
  bind(p, from);
  out(from.id, { kind: 'friend_made', with: p.daohao });
  return [{ kind: 'friend_made', with: from.daohao }];
}

export function friendDrop(w: BondWorld, p: Player, id: string): GameEvent[] {
  if (!isFriend(p, id)) throw new Error('他不是你的至交');
  p.friends = fr(p).filter((x) => x !== id);
  const t = w.players.get(id);
  if (t) t.friends = fr(t).filter((x) => x !== p.id);
  return [{ kind: 'friend_dropped', who: t?.daohao ?? '' }];
}

export function foeMark(w: BondWorld, p: Player, id: string): GameEvent[] {
  const t = w.players.get(id);
  if (!t || t.id === p.id) throw new Error('没有这个人');
  if (isFriend(p, id)) throw new Error('他是你的至交，先断交再说');
  if (fo(p).includes(id)) throw new Error('已经是你点名的死敌了');
  if (fo(p).length >= FOE_MAX) throw new Error(`点名的死敌最多 ${FOE_MAX} 位`);
  fo(p).push(id);
  return [{ kind: 'foe_marked', who: t.daohao }];
}
export function foeUnmark(w: BondWorld, p: Player, id: string): GameEvent[] {
  if (!fo(p).includes(id)) throw new Error('他不在你点名的死敌里');
  p.foes = fo(p).filter((x) => x !== id);
  return [{ kind: 'foe_unmarked', who: w.players.get(id)?.daohao ?? '' }];
}

export interface Bond {
  id: string;
  name: string;
  npc: boolean;

  why: 'friend' | 'npc_friend' | 'npc_sworn' | 'marked' | 'grudge' | 'npc_feud';
  power: number;
}
const alive = (p: Player | undefined): p is Player => !!p && !p.needRebirth;

export function alliesOf(w: BondWorld, p: Player, now: number): Bond[] {
  const out: Bond[] = [];
  for (const id of p.friends ?? []) {
    const o = w.players.get(id);
    if (alive(o)) out.push({ id, name: o.daohao, npc: false, why: 'friend', power: powerOf(o, now).power });
  }
  if (w.ledger) {
    for (const o of w.players.values()) {
      if (!o.npc || !alive(o)) continue;
      const m = attitudeOf({ ledger: w.ledger }, p.id, o.npc, now);
      if (m === 'friend' || m === 'sworn') out.push({ id: o.id, name: o.daohao, npc: true, why: m === 'sworn' ? 'npc_sworn' : 'npc_friend', power: powerOf(o, now).power });
    }
  }
  return out;
}

export function hatersOf(w: BondWorld, p: Player, now: number): Bond[] {
  const out: Bond[] = [];
  const seen = new Set<string>();
  for (const o of w.players.values()) {
    if (o.id === p.id || !alive(o) || seen.has(o.id)) continue;
    if (o.npc) {

      if (w.ledger && NPC_BY_ID.has(o.npc) && isAvenger(p, o.npc, now) && attitudeOf({ ledger: w.ledger }, p.id, o.npc, now) === 'feud') {
        seen.add(o.id);
        out.push({ id: o.id, name: o.daohao, npc: true, why: 'npc_feud', power: powerOf(o, now).power });
      }
      continue;
    }
    const marked = (o.foes ?? []).includes(p.id);
    const grudge = o.enemies.some((e) => e.id === p.id);
    if (marked || grudge) {
      seen.add(o.id);
      out.push({ id: o.id, name: o.daohao, npc: false, why: marked ? 'marked' : 'grudge', power: powerOf(o, now).power });
    }
  }
  return out;
}

export function daring(w: BondWorld, p: Player, haters: Bond[]): Bond[] {
  return haters.filter((h) => {
    const o = w.players.get(h.id);
    return !!o && realmOf(o.level) >= realmOf(p.level);
  });
}

export interface GateVisit {
  helpers: { id: string; name: string; npc: boolean }[];

  help: number;

  foe: { id: string; name: string; npc: boolean; won: boolean; winP: number } | null;

  penalty: number;
}

export function gateVisit(w: BondWorld & { seed: number }, p: Player, now: number): GateVisit {
  const rng = new SeededRng(hashSeed(`${w.seed}:gatevisit:${p.id}:${p.level}:${p.gateFails ?? 0}:${Math.floor(now / HOUR)}`));
  const helpers: GateVisit['helpers'] = [];
  for (const a of alliesOf(w, p, now)) {
    const ch = GATE_ALLY_CHANCE[a.why as keyof typeof GATE_ALLY_CHANCE] ?? 0;
    if (rng.nextFloat() < ch) helpers.push({ id: a.id, name: a.name, npc: a.npc });
  }
  const help = Math.min(GATE_HELP_MAX, helpers.length * GATE_HELP_EACH);
  let foe: GateVisit['foe'] = null;
  const haters = daring(w, p, hatersOf(w, p, now)).filter((h) => !helpers.some((x) => x.id === h.id));

  const order = haters.map((h) => ({ h, r: rng.nextFloat() })).sort((a, b) => a.r - b.r);
  for (const { h } of order) {
    const ch = GATE_FOE_CHANCE[h.why as keyof typeof GATE_FOE_CHANCE] ?? 0;
    if (rng.nextFloat() >= ch) continue;
    const winP = duelWinProb({ power: powerOf(p, now).power, yun: 0 }, { power: h.power, yun: 0 }, helpers.length * GATE_HELPER_GUARD);
    foe = { id: h.id, name: h.name, npc: h.npc, won: rng.nextFloat() < winP, winP };
    break;
  }
  return { helpers, help, foe, penalty: foe && !foe.won ? GATE_FOE_PENALTY : 0 };
}

export function gateVisitors(w: BondWorld, p: Player, now: number): { allies: { name: string; npc: boolean; chance: number }[]; haters: { name: string; npc: boolean; chance: number }[] } {
  return {
    allies: alliesOf(w, p, now).map((a) => ({ name: a.name, npc: a.npc, chance: GATE_ALLY_CHANCE[a.why as keyof typeof GATE_ALLY_CHANCE] ?? 0 })),
    haters: daring(w, p, hatersOf(w, p, now)).map((h) => ({ name: h.name, npc: h.npc, chance: GATE_FOE_CHANCE[h.why as keyof typeof GATE_FOE_CHANCE] ?? 0 })),
  };
}

export function isAvenger(p: Player, npcId: string, now: number): boolean {
  return (p.avengers ?? []).some((a) => a.npc === npcId && now - a.saidAt >= VOW_DELAY_MS);
}

export function npcVows(w: BondWorld & { ledger: LedgerEntry[] }, now: number): { to: string; npc: string; name: string; why: { kind: string; rel: string; name: string } | null }[] {
  const said: ReturnType<typeof npcVows> = [];
  const npcs = [...w.players.values()].filter((o) => o.npc && !o.needRebirth);
  for (const p of w.players.values()) {
    if (p.npc || p.needRebirth) continue;
    const feuds = npcs.filter((o) => attitudeOf(w, p.id, o.npc as string, now) === 'feud');
    const still = new Set(feuds.map((o) => o.npc as string));
    p.avengers = (p.avengers ?? []).filter((a) => still.has(a.npc));
    for (const o of feuds) {
      if (p.avengers.length >= AVENGER_MAX) break;
      if (p.avengers.some((a) => a.npc === o.npc)) continue;
      p.avengers.push({ npc: o.npc as string, saidAt: now });
      const top = reasonsOf(w, p.id, o.npc as string, now).find((r) => r.score < 0);
      said.push({ to: p.id, npc: o.npc as string, name: o.daohao, why: top ? { kind: top.kind, rel: top.rel, name: top.npc === o.npc ? '' : (NPC_BY_ID.get(top.npc)?.name ?? '') } : null });
    }
  }
  return said;
}

export function amendsCost(npc: Player): number {
  return AMENDS_BASE * 2 ** realmOf(npc.level);
}

export function amends(w: BondWorld & { ledger: LedgerEntry[] }, p: Player, npcId: string, now: number): GameEvent[] {
  const o = w.players.get(npcId);
  if (!o?.npc || o.needRebirth) throw new Error('没有这个人');
  const mood = attitudeOf(w, p.id, o.npc, now);
  if (mood !== 'feud' && mood !== 'grudge') throw new Error('你和他之间没有要赔礼的事');
  const cost = amendsCost(o);
  if (p.lingshi < cost) throw new Error(`赔礼要 ${cost} 灵石，你身上不够`);
  p.lingshi -= cost;
  record(w, p.id, o.npc, 'amends', now);
  return [{ kind: 'amends', who: o.daohao, lingshi: cost, mood: attitudeOf(w, p.id, o.npc, now) }];
}

export function mediatorsFor(w: BondWorld & { ledger: LedgerEntry[] }, p: Player, npcId: string, now: number): { id: string; name: string; rel: string }[] {
  const out: { id: string; name: string; rel: string }[] = [];
  for (const k of kinOf(npcId)) {
    if (!k.id || k.kind === 'foe') continue;
    const m = w.players.get(k.id);
    if (!m?.npc || m.needRebirth) continue;
    const mood = attitudeOf(w, p.id, m.npc, now);
    if (mood !== 'friend' && mood !== 'sworn') continue;
    if (now - ((p.mediated ?? {})[m.id] ?? -Infinity) < MEDIATE_COOLDOWN_MS) continue;
    out.push({ id: m.id, name: m.daohao, rel: k.rel });
  }
  return out;
}

export function mediate(w: BondWorld & { ledger: LedgerEntry[] }, p: Player, npcId: string, viaId: string, now: number): GameEvent[] {
  const o = w.players.get(npcId);
  if (!o?.npc || o.needRebirth) throw new Error('没有这个人');
  const mood = attitudeOf(w, p.id, o.npc, now);
  if (mood !== 'feud' && mood !== 'grudge') throw new Error('你和他之间没有要说和的事');
  const via = mediatorsFor(w, p, npcId, now).find((m) => m.id === viaId);
  if (!via) throw new Error('这位眼下替你说不上话');
  (p.mediated ??= {})[via.id] = now;
  record(w, p.id, o.npc, 'mediate', now);
  return [{ kind: 'mediated', who: o.daohao, via: via.name, mood: attitudeOf(w, p.id, o.npc, now) }];
}
