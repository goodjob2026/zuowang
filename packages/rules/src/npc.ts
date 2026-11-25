import { enyuanStep } from './enyuan.ts';
import { npcVows } from './bonds.ts';
import { instOf, calDay } from './calendar.ts';
import { BASE_LOOT_TIER, DAY, HOUR, LAYERS_PER_REALM } from './config.ts';
import { RENSHE } from './content.ts';
import { decideKill } from './encounter.ts';
import type { GameEvent } from './events.ts';
import { type LedgerEntry, NPCS, NPC_BY_ID, type NpcDef, attitudeOf, kinOf, record } from './ledger.ts';
import { rollItem } from './mijing.ts';
import type { Out } from './nemesis.ts';
import { type Player, addItem, bestFabao, braceletSlots, isActive, newPlayer, realmOf, statusAt } from './player.ts';
import { chooseQiyu } from './qiyu.ts';
import { pool } from './quiz.ts';
import { type RegionWorld, enterBlock, enterRegion, isEarly, occupants, todayRealm } from './region.ts';
import { type Rng, SeededRng, hashSeed } from './rng.ts';
import { collect } from './player.ts';
import { equipGongfa, useItem } from './use.ts';
import { type Item, item } from './content.ts';

export const NPC_PER_REALM = 6;

export const NPC_MIN_ALIVE = 4;

export const NPC_REPLACE_MS = 3 * DAY;

export const NPC_TAIL_MS = 14 * DAY;

export const NPC_INSIDE_MIN = 1;

export const NPC_TURN_MS = 7 * HOUR;

export interface NpcState {
  started: boolean;

  dead: Record<string, { at: number; by: string | null; realm: number }>;

  vacancy: { realm: number; at: number; from: string }[];
}
export const newNpcState = (): NpcState => ({ started: false, dead: {}, vacancy: [] });
export interface NpcWorld extends RegionWorld {
  ledger: LedgerEntry[];
  npcs: NpcState;
}

const isBot = (p: Player) => /^(p_)?bot/.test(p.id);
export const isNpc = (p: Player): boolean => !!p.npc;

export const isReal = (p: Player): boolean => !p.npc && !isBot(p);
export const npcDefOf = (p: Player): NpcDef | undefined => (p.npc ? NPC_BY_ID.get(p.npc) : undefined);

export function npcsAlive(w: NpcWorld): Player[] {
  return [...w.players.values()].filter((p) => p.npc && !p.needRebirth);
}

export function makeNpc(def: NpcDef, realm: number, now: number, rng: Rng): Player {
  const looks = pool(def.gender, def.xinxing);
  const renshe = RENSHE.find((r) => r.xinxing === def.xinxing && r.dong === def.dong && r.qing === def.qing) ?? RENSHE.find((r) => r.xinxing === def.xinxing);
  const p = newPlayer({ id: def.id, daohao: def.name, gender: def.gender, xinxing: def.xinxing, xingxiang: (looks[Math.floor(rng.nextFloat() * looks.length)] ?? looks[0])!.id, shane: def.camp === 'zheng' ? 120 : def.camp === 'mo' ? -120 : 0, now, renshe: renshe?.id });
  p.npc = def.id;
  p.npcHome = realm;
  p.level = realm * LAYERS_PER_REALM + Math.floor(rng.nextFloat() * LAYERS_PER_REALM);
  p.maxLevel = p.level;
  p.newbieUntil = 0;
  p.activeAt = now;
  const tier = BASE_LOOT_TIER[realm] as number;
  const gear = [rollItem(p.level, tier, rng, 'fabao', def.qi), rollItem(p.level, tier, rng, 'fabao', def.qi), rollItem(p.level, tier, rng, 'gongfa', def.qi), rollItem(p.level, tier, rng, 'gongfa', def.qi)];
  for (const id of gear) addItem(p, id, 1);
  outfit(p, now);
  return p;
}
const owned = (p: Player, f: (x: ReturnType<typeof item>) => boolean) =>
  Object.keys(p.inv)
    .filter((id) => (p.inv[id] ?? 0) > 0)
    .map((id) => item(id))
    .filter(f);

function outfit(p: Player, now: number): GameEvent[] {
  const ev: GameEvent[] = [];
  const mo = npcDefOf(p)?.camp === 'mo';
  const gf = owned(p, (x) => x.cat === 'gongfa' && (mo || !x.mo)).sort((a, b) => b.tier - a.tier)[0];
  if (gf && gf.id !== p.gongfa) ev.push(...equipGongfa(p, gf.id, now));
  const fab = bestFabao(p);
  const cons = owned(p, (x) => (x.cat === 'fu' || x.cat === 'cao' || x.cat === 'dan') && ['dou', 'yun', 'hu', 'dun'].includes(x.effect ?? '')).sort((a, b) => b.tier - a.tier).map((x) => x.id);
  p.loadout = [...fab, ...cons].slice(0, Math.min(braceletSlots(p), 8 + Math.max(0, fab.length - 3)));
  return ev;
}

export function npcFloor(w: NpcWorld, now: number): number {
  const real = [...w.players.values()].filter((p) => isReal(p));
  if (real.some((p) => now - p.createdAt < NPC_TAIL_MS)) return 0;
  const live = real.filter((p) => !p.needRebirth && isActive(p, now));
  if (!live.length) return 0;
  return Math.min(...live.map((p) => realmOf(p.level)));
}

export const npcHomeOf = (p: Player): number => p.npcHome ?? realmOf(p.level);

export const npcSeat = (p: Player, floor: number): number => Math.max(npcHomeOf(p), floor);

export function npcReap(w: NpcWorld, now: number): NpcDef[] {
  const gone: NpcDef[] = [];
  for (const p of w.players.values()) {
    if (!p.npc || !p.needRebirth || w.npcs.dead[p.npc]) continue;
    const def = NPC_BY_ID.get(p.npc);
    if (!def) continue;

    const killer = [...p.enemies].filter((e) => e.why === 'kill').sort((a, b) => b.at - a.at)[0];
    const by = killer && now - killer.at < DAY ? killer.id : null;
    const realm = realmOf(p.maxLevel);
    w.npcs.dead[p.npc] = { at: now, by, realm };

    w.npcs.vacancy.push({ realm: npcHomeOf(p), at: now, from: p.npc });
    if (by) record(w, by, p.npc, 'kill', now);
    w.rumors.push({ at: now, kind: 'npc_death', who: def.name, text: `${by ? (w.players.get(by)?.daohao ?? '') : ''}|${def.lastWords}` });
    p.stay = null;
    p.youli = null;
    gone.push(def);
  }
  return gone;
}

function used(w: NpcWorld): Set<string> {
  const s = new Set<string>(Object.keys(w.npcs.dead));
  for (const p of w.players.values()) if (p.npc) s.add(p.npc);
  return s;
}

function pickFor(w: NpcWorld, realm: number, from: string | null, taken: Set<string>, rng: Rng): NpcDef | null {
  const free = NPCS.filter((n) => !taken.has(n.id));
  if (!free.length) return null;
  if (from) {
    const rels = kinOf(from);
    for (const kind of ['near', 'mid'] as const) {
      const c = rels.filter((r) => r.kind === kind && r.id && !taken.has(r.id)).map((r) => NPC_BY_ID.get(r.id as string));
      const hit = c.find((n) => n && Math.abs(n.realm - realm) <= 2);
      if (hit) return hit;
    }
  }
  const score = (n: NpcDef) => Math.abs(n.realm - realm) * 10 + (n.main ? 0 : 1) + rng.nextFloat();
  return [...free].sort((a, b) => score(a) - score(b))[0] ?? null;
}

export function npcPlan(w: NpcWorld, now: number): { def: NpcDef; realm: number }[] {
  const rng = new SeededRng(hashSeed(`${w.seed}:npcplan:${Math.floor(now / HOUR)}`));
  const floor = npcFloor(w, now);
  const taken = used(w);
  const out: { def: NpcDef; realm: number }[] = [];
  const alive = npcsAlive(w);
  for (let r = floor; r < 9; r++) {

    const have = alive.filter((p) => npcSeat(p, floor) === r).length;
    const vac = w.npcs.vacancy.filter((v) => v.realm === r).sort((a, b) => a.at - b.at);

    const rush = Math.max(0, NPC_MIN_ALIVE - have);
    const due = vac.filter((v, i) => now - v.at >= NPC_REPLACE_MS || i < rush);

    let need = NPC_PER_REALM - have - (vac.length - due.length);
    const froms: (string | null)[] = due.map((v) => v.from);
    while (need > 0) {
      const from = froms.shift() ?? null;
      const def = pickFor(w, r, from, taken, rng);
      if (!def) break;
      taken.add(def.id);
      out.push({ def, realm: r });
      need -= 1;
    }
    w.npcs.vacancy = w.npcs.vacancy.filter((v) => !due.includes(v));
  }

  w.npcs.vacancy = w.npcs.vacancy.filter((v) => v.realm >= floor);
  w.npcs.started = true;
  return out;
}

export function npcAscend(w: NpcWorld, now: number): Player[] {
  const floor = npcFloor(w, now);
  const moved: Player[] = [];
  for (const p of npcsAlive(w)) {
    p.npcHome ??= realmOf(p.level);

    const seat = npcSeat(p, floor);
    if (realmOf(p.level) === seat || p.stay) continue;
    p.level = seat * LAYERS_PER_REALM + (p.level % LAYERS_PER_REALM);
    p.maxLevel = Math.max(p.maxLevel, p.level);
    p.xiuwei = 0;
    moved.push(p);
  }
  return moved;
}

export function npcTurn(w: NpcWorld, p: Player, now: number, rng: Rng, out: Out): GameEvent[] {
  const def = npcDefOf(p);
  if (!def || p.needRebirth) return [];
  const ev: GameEvent[] = [];
  ev.push(...collect(p, now));

  for (const k of [...p.pendingKills]) {
    const mood = attitudeOf(w, k.targetId, def.id, now);
    const kill = mood === 'feud' ? true : mood === 'friend' || mood === 'sworn' ? false : def.sha > 0 && rng.nextFloat() < 0.6;
    const m = new Map<string, GameEvent[]>();
    decideKill(p, k.uid, kill, w.players.get(k.targetId), now, m, w, rng);
    for (const [id, es] of m) for (const e of es) out(id, e);
  }
  while (p.qiyu.length > 0) {
    const q = p.qiyu[0] as (typeof p.qiyu)[number];

    ev.push(...chooseQiyu(p, q.uid, def.camp === 'mo' ? 1 : def.camp === 'zheng' || q.again === 'bad' ? 0 : 2, now, rng));
  }
  const st = statusAt(p, now);
  if (st !== 'ok') {

    const strong = (x: Item) => x.effect === 'fullheal' || st === 'hurt' || x.tier >= 2;
    const heal = owned(p, (x) => (x.cat === 'dan' || x.cat === 'cao') && (x.effect === 'heal' || x.effect === 'fullheal') && strong(x)).sort((a, b) => b.tier - a.tier)[0];
    if (heal) ev.push(...useItem(p, heal.id, now));
  }
  ev.push(...outfit(p, now));
  return ev;
}

export function npcKeepInside(w: NpcWorld, now: number, out: Out): Player[] {
  const floor = npcFloor(w, now);
  const day = calDay(now);
  const sent: Player[] = [];
  const alive = npcsAlive(w);
  for (let r = floor; r < 9; r++) {
    const mine = alive.filter((p) => realmOf(p.level) === r);
    if (!mine.length) continue;
    const inside = occupants(w, instOf(day, r), now).filter((s) => w.players.get(s.pid)?.npc).length;
    let lack = NPC_INSIDE_MIN - inside;
    if (lack <= 0) continue;
    const idle = mine
      .filter((p) => !p.stay && enterBlock(w, p, undefined, now) === null)
      .sort((a, b) => (statusAt(a, now) === 'ok' ? 0 : 1) - (statusAt(b, now) === 'ok' ? 0 : 1) || (a.activeAt ?? 0) - (b.activeAt ?? 0));
    for (const p of idle) {
      if (lack <= 0) break;
      const def = npcDefOf(p) as NpcDef;
      const region = todayRealm(w, p, now);
      try {
        enterRegion(w, p, region.id, def.sha > 0 ? 'kill' : 'spare', now, out, undefined, isEarly(p.level) ? 1 : undefined, 'bold');
        p.activeAt = now;
        sent.push(p);
        lack -= 1;
      } catch {

      }
    }
  }
  return sent;
}

export function npcStep(w: NpcWorld, now: number, out: Out, add: (p: Player) => void): { born: Player[]; died: NpcDef[]; changed: boolean } {
  const died = npcReap(w, now);
  let changed = died.length > 0;
  if (npcAscend(w, now).length) changed = true;
  const born: Player[] = [];
  for (const { def, realm } of npcPlan(w, now)) {
    const p = makeNpc(def, realm, now, new SeededRng(hashSeed(`${w.seed}:npc:${def.id}`)));
    w.players.set(p.id, p);
    add(p);
    born.push(p);
    changed = true;
  }
  for (const p of npcsAlive(w)) {
    if (p.stay) continue;
    const next = p.npcNext ?? 0;
    if (now < next) continue;
    const rng = new SeededRng(hashSeed(`${w.seed}:npcturn:${p.id}:${Math.floor(now / HOUR)}`));
    p.npcNext = now + NPC_TURN_MS * (0.7 + rng.nextFloat() * 0.6);
    const ev = npcTurn(w, p, now, rng, out);
    for (const e of ev) out(p.id, e);
    changed = true;
  }

  for (const v of npcVows(w, now)) {
    out(v.to, { kind: 'npc_vow', npc: v.npc, name: v.name, why: v.why });
    changed = true;
  }

  if (enyuanStep(w, now, out)) changed = true;
  if (npcKeepInside(w, now, out).length) changed = true;
  return { born, died, changed };
}
