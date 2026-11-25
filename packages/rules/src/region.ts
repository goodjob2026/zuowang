import { addDebt, hasGrudge, noteCold, sanguAccept, sanguReady, settleHunt, yuanOf } from './yuan.ts';
import {
  SWORN_BOSS_HELP,
  AID_POWER,
  TEAM_POWER,
  BOON_CHANCE,
  CATCHUP_SHIELD_LAG,
  DUN_TO,
  SHEN_THANKS,
  SHEN_TRUST,
  BOSS_LINGSHI_SHARE,
  BOSS_REPEL_SHARE,
  BOSS_SIGNATURE_CHANCE,
  CAMP_MATCH,
  DYING_POWER,
  EARLY_BANDS,
  FAIL_ITEM_KEEP,
  FAIL_LINGSHI_KEEP,
  DAY,
  HOUR,
  SANGU_GIFT,
  HURT_POWER,
  KICKED_LINGSHI,
  KICKED_ITEM_KEEP,
  KILL_HEALTHY_CHANCE,
  LILIAN_FACTOR,
  LINGSHI_REALM_SCALE,
  MEET_PER_STAGE,
  MI_DEPTHS,
  MI_LATE,
  MIJING_GRADES,
  NPC_SHARE,
  OPT_EFFECT,
  NPC_EVENT_CHANCE,
  NPC_STAGE_REPEAT_MAX,
  OPT_FIT_CAMP,
  OPT_FIT_PASS,
  OPT_FIT_XINXING,
  PATH_MATCH_POW,
  REALM_BAND,
  REVENGE_BONUS,
  SLAY_SHANE,
  SLAIN_DROP_PLAIN,
  SPOILS_MAX,
  FIRST_TRIP_EASE,
  NPC_BETRAY_TAKE,
  NPC_GRATEFUL_GIFT,
  FIRST_TRIP_STEP_MIN,
  STAGE_DEPTH_STEP,
  MI_LOOT,
  STAGE_POWER,
  STAGE_SCRAPE_SHARE,
  THEME_LINGSHI_MULT,
  ZHENG_VS_MO_BONUS,
  realmPower,
} from './config.ts';
import { BOON_STAGES, GENERIC_STAGES, type MiRealm, NPC_EVENTS, NPC_STAGES, type OptTag, STAGE_BY_ID, type StageDef, type StageKind, findItem, item, miRealm } from './content.ts';
import { calDay, instOf, miLayerOf, realmOn } from './calendar.ts';
import { consumedIds, duelWinProb, powerOf } from './combat.ts';
import type { GameEvent } from './events.ts';
import { die } from './fate.ts';
import { lootTier, rollItem } from './mijing.ts';
import { isAvenger } from './bonds.ts';
import { type LedgerEntry, NPC_BY_ID, type NpcRepay, attitudeOf, npcRepay, npcRobOdds, record, npcEnOf } from './ledger.ts';
import { TRUST_LOSS, addTrust, checkBond, slainTrust } from './trust.ts';
import { type NemesisWorld, type Out, addEnemy, afterKill, isEnemy, isXiong, lethalBlock, pruneEnemies } from './nemesis.ts';
import { type Player, activeGongfa, addItem, bank, campOf, effectiveLoadout, grantXiuweiHours, lagRealms, nextUid, realmOf, rememberNpc, removeItem, setStatus, statusAt, titleBonusAt } from './player.ts';
import { applyShane } from './qiyu.ts';
import { SeededRng, hashSeed } from './rng.ts';

export type Stance = 'spare' | 'kill';

export type Push = 'safe' | 'bold';

export type Injury = 'none' | 'hurt' | 'dying' | 'death' | 'revive' | 'blocked' | 'dun';
export type StageOutcome = 'win' | 'scrape' | 'fail' | 'repelled';
export interface StaySnap {
  raw: number;
  yun: number;
  hu: number;

  guard?: number;
  dun: number;

  duns?: number[];
  carried: string[];
}
export interface FightRec {
  at: number;
  vs: string;
  vsName: string;
  beast: boolean;
  aggressor: boolean;
  won: boolean;
  winP: number;
  outcome: Injury;
  block: 'protect' | 'week' | 'pair' | null;
  revenge: boolean;
  bounty: number;
}

export interface StagePlan {
  ref: string;
  kind: StageKind | 'boss';
  at: number;
  choice?: number;
  done?: boolean;
  outcome?: StageOutcome;
  opt?: number;
  auto?: boolean;
  injury?: Injury;
  pvp?: { vs: string; vsName: string; won: boolean; outcome: Injury; holder: boolean };
  met?: { id: string; name: string; mood: 'friend' | 'sworn' };
  repay?: { npc: string; name: string; how: Exclude<NpcRepay, 'thanks'> | 'rob'; lingshi: number; pick: number;  item?: string;  accept?: boolean;  colder?: boolean };
  lingshi?: number;
  items?: string[];
  pWin?: number;
}
export interface StayResult {
  lingshi: number;
  lilian: number;
  items: string[];
  alone: boolean;
  treasure: boolean;
  beast: 'none' | 'won' | 'lost';
  kicked: boolean;
  left: boolean;
  reason: 'done' | 'retreat' | 'fail' | 'left' | 'kicked';
}
export interface Stay {
  id: string;
  pid: string;
  name: string;
  region: string;
  realm: number;
  layer: 0 | 1 | 2;
  inst: string;
  grade: 0 | 1 | 2;
  late: boolean;
  push: Push;
  start: number;
  end: number;

  first?: boolean;
  stance: Stance;
  theme: { camp: boolean; path: boolean };
  snap: StaySnap;

  guardN?: number;
  stages: StagePlan[];
  next: number;
  loot: string[];
  lingshi: number;
  bossWon: boolean;
  mem: { kind: 'boss_win' | 'boss_lost' | 'failed' | 'plain'; name: string } | null;
  fights: FightRec[];
  wins: number;
  losses: number;
  extra: number;
  spoils: number;
  beat: string[];
  holder: boolean;

  mate?: { pid: string; name: string; mode: 'team' | 'aid' | 'shen'; lead: boolean;  turned?: boolean;  sure?: boolean };
  held?: boolean;
  status: 'in' | 'done';
  retook: boolean;
  result: StayResult | null;
}
export interface RegionWorld extends NemesisWorld {
  seed: number;
  stays: Map<string, Stay>;
}

export function bandOf(level: number): number {
  return REALM_BAND[realmOf(level)] as number;
}

export function isEarly(level: number): boolean {
  return (EARLY_BANDS as readonly number[]).includes(bandOf(level));
}

export function todayRealm(w: { seed: number }, p: Player, now: number): MiRealm {
  return realmOn(w.seed, realmOf(p.level), calDay(now));
}

export function occupants(w: RegionWorld, inst: string, now: number): Stay[] {
  return [...w.stays.values()].filter((s) => s.inst === inst && s.status === 'in' && s.start <= now && now < s.end);
}
export function stayOf(w: RegionWorld, p: Player): Stay | null {
  return p.stay ? (w.stays.get(p.stay) ?? null) : null;
}

export function themeOf(r: MiRealm, p: Player): { camp: boolean; path: boolean } {
  return { camp: r.camp !== null && r.camp === campOf(p), path: activeGongfa(p).qi === r.qi };
}
export function themeMult(t: { camp: boolean; path: boolean }): number {
  return (t.camp ? CAMP_MATCH : 1) * (t.path ? PATH_MATCH_POW : 1);
}
const statusMult = (p: Player, t: number) => {
  const s = statusAt(p, t);
  return s === 'hurt' ? HURT_POWER : s === 'dying' ? DYING_POWER : 1;
};

function powerNow(st: Stay, p: Player, t: number, w?: RegionWorld): number {
  return st.snap.raw * statusMult(p, t) * themeMult(st.theme ?? { camp: false, path: false }) * mateMult(w, st);
}

export function nextOdds(w: RegionWorld, st: Stay, p: Player, now: number): { pWin: number; boss: boolean; lingshi: number; items: number } | null {
  if (st.status !== 'in') return null;
  const idx = st.stages.findIndex((s) => !s.done);
  if (idx < 0) return null;
  const sp = st.stages[idx] as StagePlan;
  const boss = sp.ref === 'boss';
  const pWin = duelWinProb({ power: powerNow(st, p, now, w), yun: st.snap.yun }, { power: stagePower(st.realm, boss ? 'boss' : sp.kind, idx) * easeOf(st), yun: 0 });
  return { pWin: st.first ? 1 : Math.max(0.03, Math.min(0.97, pWin)), boss, lingshi: st.lingshi, items: st.loot.length };
}

export function mateMult(w: RegionWorld | undefined, st: Stay): number {
  if (!st.mate || st.mate.turned) return 1;
  if (st.mate.mode === 'team' && w) {
    const m = w.players.get(st.mate.pid);
    const ms = m?.stay ? w.stays.get(m.stay) : undefined;
    if (ms && ms.status === 'in' && ms.inst === st.inst) return 1 + TEAM_POWER;
  }
  return 1 + AID_POWER;
}

export function stagePower(realm: number, kind: StageKind | 'boss', idx: number): number {
  const k = kind === 'boon' ? 0.5 : (STAGE_POWER[kind as keyof typeof STAGE_POWER] ?? 1);
  return realmPower(realm * 4 + 1.5) * k * (1 + STAGE_DEPTH_STEP * idx);
}

const easeOf = (st: Stay): number => (st.first ? FIRST_TRIP_EASE : 1);

export function runShape(early: boolean, depth: 0 | 1 | 2, first = false): { n: number; hours: number; boss: boolean; times: number[] } {
  if (!early) {
    const n = MI_LATE.stages;
    return { n, hours: MI_LATE.hours, boss: true, times: Array.from({ length: n }, (_, i) => (i + 1) * MI_LATE.stepHours) };
  }
  const d = MI_DEPTHS[depth];

  const hours = first ? (d.stages * FIRST_TRIP_STEP_MIN) / 60 : d.hours;
  return { n: d.stages, hours, boss: d.boss, times: Array.from({ length: d.stages }, (_, i) => ((i + 1) / d.stages) * hours) };
}

export function isFirstTrip(p: Player): boolean {
  return !p.mjFirstDone && isEarly(p.level) && Object.keys(p.mjSeen ?? {}).length === 0;
}

export function enterBlock(w: { seed: number }, p: Player, regionId: string | undefined, now: number): string | null {
  if (p.needRebirth) return '尚未转世';
  if (p.stay) return '已经在秘境里';
  if (p.youli && now < p.youli.end) return '外出游历中';
  if (regionId && regionId !== todayRealm(w, p, now).id) return '今天开的不是这处秘境';
  return null;
}

function pickLeast(pool: StageDef[], k: number, seen: Record<string, number>, rng: SeededRng, avoid: Set<string>): StageDef[] {
  const cand = pool.filter((s) => !avoid.has(s.id)).map((s) => ({ s, n: seen[s.id] ?? 0, r: rng.nextFloat() }));
  cand.sort((a, b) => a.n - b.n || a.r - b.r);
  const out = cand.slice(0, k).map((x) => x.s);
  for (const s of out) avoid.add(s.id);
  return out;
}
function minSeen(pool: StageDef[], seen: Record<string, number>): number {
  return pool.reduce((m, s) => Math.min(m, seen[s.id] ?? 0), Infinity);
}

function planStages(w: RegionWorld, p: Player, st: Stay, r: MiRealm, early: boolean, depth: 0 | 1 | 2): StagePlan[] {
  const rng = new SeededRng(hashSeed(`${w.seed}:plan:${st.id}`));
  const shape = runShape(early, depth, !!st.first);
  const pre = shape.boss ? shape.n - 1 : shape.n;
  const seen = p.mjSeen ?? {};
  const used = new Set<string>();
  const spec = r.stages.filter((s) => (s.layers ?? [0, 1, 2]).includes(st.layer));

  const picks: StageDef[] = pickLeast(spec, pre >= 3 ? 2 : 1, seen, rng, used).filter((s) => (seen[s.id] ?? 0) <= minSeen(GENERIC_STAGES, seen));
  const boons = BOON_STAGES.filter((s) => s.camp === campOf(p));

  const freshBoon = boons.some((x) => (seen[x.id] ?? 0) <= minSeen([...GENERIC_STAGES, ...NPC_STAGES], seen));
  if (st.theme.camp && freshBoon && rng.nextFloat() < BOON_CHANCE) picks.push(...pickLeast(boons, 1, seen, rng, used));
  else if (NPC_STAGES.length && rng.nextFloat() < NPC_SHARE) picks.push(...pickLeast(NPC_STAGES, 1, seen, rng, used));
  while (picks.length < pre) {
    const more = pickLeast([...spec, ...GENERIC_STAGES, ...NPC_STAGES], 1, seen, rng, used);
    if (!more.length) break;
    picks.push(...more);
  }

  if (!picks.some((s) => s.options)) {

    const withOps = [...spec, ...GENERIC_STAGES, ...NPC_STAGES].filter((s) => s.options);
    const i = Math.max(0, picks.findIndex((s) => !spec.includes(s)));
    const one = pickLeast(withOps, 1, seen, rng, used);
    if (one[0]) picks[picks.length > i ? i : picks.length - 1] = one[0];
  }

  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(rng.nextFloat() * (i + 1));
    [picks[i], picks[j]] = [picks[j] as StageDef, picks[i] as StageDef];
  }

  const here = [...w.players.values()].filter((o) => o.npc && !o.needRebirth && o.id !== p.id && o.id !== st.mate?.pid && realmOf(o.level) === st.realm).map((o) => o.npc as string);
  const evPool = here.length ? NPC_EVENTS.filter((e) => e.npc && here.includes(e.npc) && (seen[e.id] ?? 0) < NPC_STAGE_REPEAT_MAX) : [];
  if (evPool.length && picks.length) {
    const rx = new SeededRng(hashSeed(`${w.seed}:planx:${st.id}`));
    if (rx.nextFloat() < NPC_EVENT_CHANCE) {
      const one = pickLeast(evPool, 1, seen, rx, used)[0];

      const own = new Set(spec.map((s) => s.id));
      const cand = picks.slice(0, pre).map((s, i) => ({ s, i })).filter((x) => !own.has(x.s.id));
      const at = (cand.length ? cand : picks.slice(0, pre).map((s, i) => ({ s, i })))[Math.floor(rx.nextFloat() * (cand.length || Math.min(pre, picks.length)))];
      if (one && at) picks[at.i] = one;
    }
  }
  const plan: StagePlan[] = picks.slice(0, pre).map((s, i) => ({ ref: s.id, kind: s.kind, at: st.start + (shape.times[i] as number) * HOUR }));
  if (shape.boss) plan.push({ ref: 'boss', kind: 'boss', at: st.start + (shape.times[shape.n - 1] as number) * HOUR });
  return plan;
}

export function enterRegion(w: RegionWorld, p: Player, regionId: string | undefined, stance: Stance, now: number, out: Out, target?: string, depth?: 0 | 1 | 2, push: Push = 'safe', mate?: Stay['mate']): Stay {
  const why = enterBlock(w, p, regionId, now);
  if (why) throw new Error(why);
  if (stance !== 'spare' && stance !== 'kill') throw new Error('杀心不对');
  if (push !== 'safe' && push !== 'bold') throw new Error('打法不对');
  if (target) {

    const tp = w.players.get(target);
    if (!tp || !(isEnemy(p, target) || isXiong(tp, now))) throw new Error('只能追杀自己的死敌或凶名在外的人');
  }
  bank(p, now);
  if (p.protectUntil > now) p.protectUntil = now;
  pruneEnemies(p, now);
  const realm = realmOf(p.level);
  const day = calDay(now);
  const r = realmOn(w.seed, realm, day);
  const early = isEarly(p.level);
  const d: 0 | 1 | 2 = early ? (depth === 0 || depth === 2 ? depth : 1) : 2;
  const first = early && isFirstTrip(p);
  const shape = runShape(early, d, first);
  const carried = effectiveLoadout(p);
  const b = powerOf(p, now, carried);
  for (const c of consumedIds(carried)) removeItem(p, c);
  const prev = p.mjMem?.[r.id];
  const st: Stay = {
    id: `s:${nextUid(p)}`,
    pid: p.id,
    name: p.daohao,
    region: r.id,
    realm,
    layer: miLayerOf(realm),
    inst: instOf(day, realm),
    grade: d,
    late: !early,
    push,
    start: now,
    end: now + shape.hours * HOUR,
    stance,
    theme: themeOf(r, p),
    snap: { raw: b.statusMult > 0 ? b.power / b.statusMult : b.power, yun: b.yun, hu: b.hu, guard: b.guard, dun: b.dun, duns: b.duns, carried },
    stages: [],
    next: 0,
    loot: [],
    lingshi: 0,
    bossWon: false,
    mem: prev ? { kind: prev.kind, name: prev.name } : null,
    fights: [],
    wins: 0,
    losses: 0,
    extra: 0,
    spoils: 0,
    beat: [],
    holder: false,
    status: 'in',
    retook: false,
    result: null,
    ...(mate ? { mate } : {}),
    ...(first ? { first: true } : {}),
  };
  p.mjFirstDone = true;
  st.stages = planStages(w, p, st, r, early, d);
  w.stays.set(st.id, st);
  p.stay = st.id;
  if (!target) p.stance = stance;
  p.windows.push({ start: now, end: st.end, runId: st.id });
  out(p.id, { kind: 'mijing_enter', region: r.id, name: r.name, end: st.end, stance, grade: d, layer: st.layer, push });
  if (target) {
    let hunted = occupants(w, st.inst, now).find((o) => o.pid === target && o.id !== st.id);

    const tp = w.players.get(target);
    const y = tp?.npc ? yuanOf(p, tp.npc, ['debt', 'blood']) : undefined;
    if (!hunted && tp && y?.show?.day === day) {
      if (!tp.stay && realmOf(tp.level) === realm && enterBlock(w, tp, undefined, now) === null) {
        try {
          enterRegion(w, tp, r.id, (NPC_BY_ID.get(tp.npc as string)?.sha ?? 0) > 0 ? 'kill' : 'spare', now, out, undefined, early ? 1 : undefined, 'bold');
          hunted = occupants(w, st.inst, now).find((o) => o.pid === target && o.id !== st.id);
        } catch {

        }
      }
      if (!hunted) {
        y.show = undefined;
        y.next = now + DAY;
        out(p.id, { kind: 'yuan', line: y.kind, beat: 'noshow', npc: y.npc, name: y.name });
      }
    }
    if (hunted) fight(w, st, hunted, now, out);
  }
  return st;
}

export function pendingChoice(st: Stay): { idx: number; def: StageDef } | null {
  if (st.status !== 'in') return null;
  const sp = st.stages[st.next];
  if (!sp || sp.done || sp.ref === 'boss') return null;
  const def = STAGE_BY_ID.get(sp.ref);
  return def?.options ? { idx: st.next, def } : null;
}

export function chooseStage(w: RegionWorld, p: Player, option: number, now: number): void {
  const st = stayOf(w, p);
  if (!st || st.status !== 'in') throw new Error('没在秘境里');
  const pc = pendingChoice(st);
  if (!pc) throw new Error('眼下没有要拿主意的事');
  const sp = st.stages[pc.idx] as StagePlan;
  if (now >= sp.at) throw new Error('来不及了');
  if (!Number.isInteger(option) || option < 0 || option >= (pc.def.options?.length ?? 0)) throw new Error('没有这个选项');
  sp.choice = option;
}

export function autoOption(def: StageDef, push: Push, p?: Player): number {
  const ops = def.options ?? [];
  const want: OptTag[] = push === 'safe' ? ['safe'] : ['bold', 'safe'];

  if (p) {
    const cand = (['safe', 'bold'] as OptTag[]).map((t) => ({ t, i: ops.findIndex((o) => o.tag === t) })).filter((x) => x.i >= 0);
    const first = cand.find((x) => x.t === want[0]) ?? cand[0];
    const other = cand.find((x) => x !== first);
    if (first && other && optFit(first.t, p) < 0 && optFit(other.t, p) > 0) return other.i;
  }
  for (const t of want) {
    const i = ops.findIndex((o) => o.tag === t);
    if (i >= 0) return i;
  }
  return 0;
}

export function optFit(tag: OptTag, p: Player): -1 | 0 | 1 {
  const x = OPT_FIT_XINXING[tag][p.xinxing] + (tag === 'shan' || tag === 'e' ? OPT_FIT_CAMP[tag][campOf(p)] : 0);
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

function useDun(st: Stay): 'dying' | 'hurt' | 'safe' {
  st.snap.dun -= 1;
  return DUN_TO[st.snap.duns?.shift() ?? 0] as 'dying' | 'hurt' | 'safe';
}

function guarded(w: RegionWorld, st: Stay, key: string): boolean {
  const g = st.snap.guard ?? 0;
  if (g <= 0) return false;
  st.guardN = (st.guardN ?? 0) + 1;
  return new SeededRng(hashSeed(`${w.seed}:guard:${st.id}:${key}:${st.guardN}`)).nextFloat() < g;
}
function injure(w: RegionWorld, st: Stay, p: Player, at: number, level: 'scrape' | 'fail' | 'boss', deep: boolean, ev: GameEvent[], r: MiRealm): Injury {
  if (st.snap.hu > 0) {
    st.snap.hu -= 1;
    return 'blocked';
  }
  if (guarded(w, st, `stage:${level}`)) return 'blocked';
  const s0 = statusAt(p, at);
  const gentle = !st.late || at < (p.newbieUntil ?? 0);
  if (gentle || level === 'scrape') {
    if (s0 === 'ok') {
      setStatus(p, 'hurt', at, ev);
      return 'hurt';
    }
    return s0 === 'dying' ? 'dying' : 'hurt';
  }
  if (level === 'fail') {
    if (s0 === 'ok' && !deep) {
      setStatus(p, 'hurt', at, ev);
      return 'hurt';
    }
    setStatus(p, 'dying', at, ev);
    return 'dying';
  }

  if (s0 === 'ok') {
    setStatus(p, 'dying', at, ev);
    return 'dying';
  }
  if (st.snap.dun > 0) {
    const to = useDun(st);
    if (to !== 'safe') setStatus(p, to, at, ev);
    return 'dun';
  }
  const reborn = die(p, 'mijing', at, ev);
  w.rumors.push({ at, kind: 'death', who: p.daohao, text: r.name });
  return reborn ? 'death' : 'revive';
}

function stageGain(st: Stay, p: Player, r: MiRealm, rng: SeededRng, mult: number, boss: boolean): { lingshi: number; items: string[] } {
  const g = MIJING_GRADES[st.grade] as (typeof MIJING_GRADES)[number];
  const pre = st.stages.filter((s) => s.ref !== 'boss').length || 1;
  const realmScale = 1 + LINGSHI_REALM_SCALE * st.realm;
  const theme = r.loot === 'lingshi' ? THEME_LINGSHI_MULT : 1;
  const items: string[] = [];
  if (boss) {
    const lingshi = Math.round(g.lingshi * BOSS_LINGSHI_SHARE * realmScale * theme * (0.85 + 0.3 * rng.nextFloat()));
    return { lingshi, items };
  }
  const budget = st.late ? MI_LOOT.late : MI_LOOT.early[st.grade];
  const lingshi = Math.round(((g.lingshi * budget.lingshi) / pre) * realmScale * theme * mult * (0.85 + 0.3 * rng.nextFloat()));
  const expect = (budget.items / pre) * mult;
  let n = Math.floor(expect);
  if (rng.nextFloat() < expect - n) n += 1;
  for (let i = 0; i < n; i++) items.push(themedItem(p.level, lootTier(p.level, st.grade, 0, rng), rng, r));
  return { lingshi, items };
}

export function themedItem(level: number, tier: number, rng: SeededRng, r: MiRealm): string {
  return rollItem(level, tier, rng, undefined, r.qi, r.loot === 'lingshi' ? undefined : r.loot);
}

export function treasureItem(level: number, r: MiRealm, layer: number, rng: SeededRng): string {
  const t = lootTier(level, 2, 1, rng);
  if (rng.nextFloat() < BOSS_SIGNATURE_CHANCE) {
    const sig = (r.layers[layer]?.treasures ?? [])
      .map((id) => findItem(id))
      .filter((x): x is NonNullable<typeof x> => !!x && x.tier <= t)
      .sort((a, b) => b.tier - a.tier);
    if (sig.length) return (sig[0] as { id: string }).id;
  }
  return themedItem(level, t, rng, r);
}

export function resolveStage(w: RegionWorld, st: Stay, idx: number, out: Out): void {
  if (st.status !== 'in' || st.next !== idx) return;
  const sp = st.stages[idx];
  const p = w.players.get(st.pid);
  if (!sp || sp.done) return;
  if (!p) {
    st.status = 'done';
    return;
  }
  const r = miRealm(st.region);
  if (!r) {
    releaseStay(w, st, sp.at);
    return;
  }
  const at = sp.at;
  bank(p, at);
  const rng = new SeededRng(hashSeed(`${w.seed}:stage:${st.id}:${idx}`));
  const ev: GameEvent[] = [];
  sp.done = true;
  st.next = idx + 1;
  p.mjSeen ??= {};
  const markSeen = () => {
    if (sp.ref !== 'boss') p.mjSeen[sp.ref] = (p.mjSeen[sp.ref] ?? 0) + 1;
  };
  const deep = idx >= 2;
  if (sp.ref === 'boss') {
    resolveBoss(w, st, sp, p, r, rng, out, ev);
  } else {
    let def = STAGE_BY_ID.get(sp.ref);

    if (def?.npc && !(w.players.get(def.npc) && !(w.players.get(def.npc) as Player).needRebirth)) {
      const g = pickLeast(GENERIC_STAGES, 1, p.mjSeen ?? {}, rng, new Set(st.stages.map((s) => s.ref)))[0];
      if (g) {
        sp.ref = g.id;
        sp.kind = g.kind;
        delete sp.choice;
        def = g;
      }
    }

    const others = st.first ? [] : occupants(w, st.inst, at).filter((o) => o.id !== st.id && o.pid !== st.pid && o.pid !== st.mate?.pid && !o.first);
    if (def?.kind === 'boon') {

      markSeen();
      const g = stageGain(st, p, r, rng, 1, false);
      sp.outcome = 'win';
      sp.lingshi = g.lingshi;
      sp.items = g.items;
      st.lingshi += g.lingshi;
      st.loot.push(...g.items);
    } else if (!def?.options && others.length && rng.nextFloat() < (st.late ? MEET_PER_STAGE.late : MEET_PER_STAGE.early)) {

      const o = others[Math.floor(rng.nextFloat() * others.length)] as Stay;
      const po = w.players.get(o.pid);
      const mood = po ? meetMood(w, p, po, at) : null;
      if (po && mood) {

        markSeen();
        const g = stageGain(st, p, r, rng, 1, false);
        sp.outcome = 'win';
        sp.lingshi = g.lingshi;
        sp.items = g.items;
        st.lingshi += g.lingshi;
        st.loot.push(...g.items);
        sp.met = { id: po.id, name: po.daohao, mood };
        ev.push({ kind: 'npc_yield', npc: po.id, name: po.daohao, mood });
      } else {
      const before = st.fights.length;
      fight(w, st, o, at, out);
      const f = st.fights[before];
      if (f) sp.pvp = { vs: f.vs, vsName: f.vsName, won: f.won, outcome: f.outcome, holder: false };
      sp.outcome = f?.won ? 'win' : 'scrape';
      if (st.status !== 'in') return;
      if (f && !f.won && st.push === 'safe') return finishStay(w, st, at, 'retreat', out);
      }
    } else {
      markSeen();
      const opt = def?.options ? (sp.choice ?? autoOption(def, st.push, p)) : undefined;
      if (opt !== undefined) {
        sp.opt = opt;
        sp.auto = sp.choice === undefined;
      }
      const tag = opt !== undefined ? (def?.options?.[opt]?.tag ?? 'safe') : null;
      const eff = tag ? OPT_EFFECT[tag] : { pass: 0, loot: 1, shane: 0 };
      if (eff.shane) applyShane(p, eff.shane, ev, at);
      const pw = duelWinProb({ power: powerNow(st, p, at, w), yun: st.snap.yun }, { power: stagePower(st.realm, sp.kind, idx) * easeOf(st), yun: 0 });
      const pWin = st.first ? 1 : Math.max(0.03, Math.min(0.97, pw + eff.pass + (tag ? optFit(tag, p) * OPT_FIT_PASS : 0)));
      sp.pWin = pWin;
      const x = rng.nextFloat();
      let how: NpcRepay | null = null;
      const yuanEv: GameEvent[] = [];

      if (def?.npc && tag && w.ledger) {
        const oc = x < pWin ? 'win' : x < pWin + (1 - pWin) * STAGE_SCRAPE_SHARE ? 'scrape' : 'fail';
        const nd = NPC_BY_ID.get(def.npc);
        const nname = (w.players.get(def.npc) as Player).daohao;

        const accept = tag === 'shan' && oc !== 'fail' && !!nd && !st.first && sanguReady(p, def.npc);
        if (tag === 'shan' && oc !== 'fail' && nd) how = st.first ? 'thanks' : accept ? 'grateful' : npcRepay(nd, attitudeOf({ ledger: w.ledger }, p.id, def.npc, at), new SeededRng(hashSeed(`${w.seed}:repay:${st.id}:${idx}`)).nextFloat());
        if (tag === 'shan' && oc !== 'fail' && (how === 'thanks' || how === 'grateful')) record({ ledger: w.ledger }, p.id, def.npc, accept ? 'save' : 'help', at);
        if (tag === 'e') record({ ledger: w.ledger }, p.id, def.npc, 'rob', at);
        if (how && how !== 'thanks') {

          const amt = how === 'betray' ? Math.floor(st.lingshi * NPC_BETRAY_TAKE) : how === 'grateful' ? Math.round(stageGain(st, p, r, new SeededRng(hashSeed(`${w.seed}:repaygift:${st.id}:${idx}`)), NPC_GRATEFUL_GIFT * (accept ? SANGU_GIFT : 1), false).lingshi) : 0;
          st.lingshi += how === 'betray' ? -amt : amt;
          if (!accept) rememberNpc(p, def.npc, how, at);
          sp.repay = { npc: def.npc, name: nname, how, lingshi: amt, pick: hashSeed(`${w.seed}:repaypick:${st.id}:${idx}`) % 1000, ...(accept ? { accept: true } : {}) };

          const yroll = new SeededRng(hashSeed(`${w.seed}:yuan:${st.id}:${idx}`)).nextFloat();
          if (how === 'betray') {
            addEnemy(p, def.npc, at, 'fu');
            yuanEv.push(...addDebt(p, def.npc, nname, { lingshi: amt, items: [] }, 'betray', at, yroll));
          } else if (how === 'cold' && npcEnOf(def.npc) === 'ao') {
            yuanEv.push(...noteCold(p, def.npc, nname, at));
            if ((yuanOf(p, def.npc, ['sangu'])?.colds ?? 0) >= 2) sp.repay.colder = true;
          }
          else if (accept) yuanEv.push(...sanguAccept(p, def.npc, at));
        }
        ev.push({ kind: 'npc_event', npc: def.npc, name: nname, tag, outcome: oc, ...(sp.repay ? { repay: sp.repay.how, lingshi: sp.repay.lingshi, pick: sp.repay.pick, ...(sp.repay.accept ? { accept: true } : {}), ...(sp.repay.colder ? { colder: true } : {}) } : {}) }, ...yuanEv);
      }
      if (x < pWin) {
        sp.outcome = 'win';
        const g = how === 'betray' ? { lingshi: 0, items: [] as string[] } : stageGain(st, p, r, rng, eff.loot, false);
        sp.lingshi = g.lingshi;
        sp.items = g.items;
        st.lingshi += g.lingshi;
        st.loot.push(...g.items);
      } else if (x < pWin + (1 - pWin) * STAGE_SCRAPE_SHARE) {
        sp.outcome = 'scrape';
        sp.injury = injure(w, st, p, at, 'scrape', deep, ev, r);
        for (const e of ev) out(p.id, e);
        ev.length = 0;
        if (st.push === 'safe') return finishStay(w, st, at, 'retreat', out);
      } else {
        sp.outcome = 'fail';
        sp.injury = injure(w, st, p, at, 'fail', deep, ev, r);
        for (const e of ev) out(p.id, e);
        return finishStay(w, st, at, 'fail', out);
      }
    }
  }
  for (const e of ev) out(p.id, e);
  if (st.status !== 'in') return;

  if (sp.ref === 'boss' && sp.outcome === 'fail' && !sp.pvp) return finishStay(w, st, at, sp.injury === 'death' || sp.injury === 'revive' ? 'kicked' : 'fail', out);

  if (st.next >= st.stages.length) {
    if (st.late && st.holder) return;
    finishStay(w, st, at, 'done', out);
  }
}

function resolveBoss(w: RegionWorld, st: Stay, sp: StagePlan, p: Player, r: MiRealm, rng: SeededRng, out: Out, ev: GameEvent[]): void {
  const at = sp.at;
  if (st.late) {

    const holder = occupants(w, st.inst, at).find((o) => o.holder && o.id !== st.id && o.pid !== st.pid && o.pid !== st.mate?.pid);
    if (holder) {
      const before = st.fights.length;
      fight(w, st, holder, at, out);
      const f = st.fights[before];
      if (f) sp.pvp = { vs: f.vs, vsName: f.vsName, won: f.won, outcome: f.outcome, holder: true };
      sp.outcome = f?.won ? 'win' : 'fail';
      if (f?.won) st.bossWon = true;
      return;
    }
  }

  const sworn = w.ledger
    ? [...w.players.values()].find((o) => o.npc && !o.needRebirth && o.id !== st.mate?.pid && realmOf(o.level) === st.realm && attitudeOf({ ledger: w.ledger as LedgerEntry[] }, p.id, o.npc, at) === 'sworn')
    : undefined;
  if (sworn) {
    sp.met = { id: sworn.id, name: sworn.daohao, mood: 'sworn' };
    ev.push({ kind: 'npc_boss_help', npc: sworn.id, name: sworn.daohao });
  }
  const pWin = st.first ? 1 : Math.min(0.97, duelWinProb({ power: powerNow(st, p, at, w), yun: st.snap.yun }, { power: stagePower(st.realm, 'boss', st.stages.length - 1) * easeOf(st), yun: 0 }) + (sworn ? SWORN_BOSS_HELP : 0));
  sp.pWin = pWin;
  const x = rng.nextFloat();
  if (x < pWin) {
    sp.outcome = 'win';
    const g = stageGain(st, p, r, rng, 1, true);
    sp.lingshi = g.lingshi;
    st.lingshi += g.lingshi;
    if (st.mate?.mode === 'team' && !st.mate.lead) {

      sp.lingshi += g.lingshi;
      st.lingshi += g.lingshi;
      return;
    }

    const robber = mateRobs(w, st, p, at);
    if (robber) {

      let took: string | undefined;
      if (st.late) {
        const ms = robber.stay ? w.stays.get(robber.stay) : undefined;
        if (ms && ms.status === 'in') {
          ms.holder = true;
          ms.held = true;
        }
      } else {
        took = treasureItem(p.level, r, st.layer, rng);
        addItem(robber, took);
      }
      st.mate = { ...(st.mate as NonNullable<Stay['mate']>), turned: true };
      rememberNpc(p, robber.npc as string, 'rob', at);
      sp.repay = { npc: robber.npc as string, name: robber.daohao, how: 'rob', lingshi: 0, pick: hashSeed(`${w.seed}:robpick:${st.id}`) % 1000, ...(took ? { item: took } : {}) };
      ev.push({ kind: 'npc_event', npc: robber.npc, name: robber.daohao, tag: 'team', outcome: 'win', repay: 'rob', pick: sp.repay.pick, ...(took ? { item: took, itemName: item(took).name } : {}) });

      addEnemy(p, robber.id, at, 'fu');
      const owedItem = took ?? treasureItem(p.level, r, st.layer, new SeededRng(hashSeed(`${w.seed}:robowed:${st.id}`)));
      ev.push(...addDebt(p, robber.npc as string, robber.daohao, { lingshi: 0, items: [owedItem] }, 'rob', at, new SeededRng(hashSeed(`${w.seed}:yuan:${st.id}:rob`)).nextFloat()));
      return;
    }
    st.bossWon = true;
    if (st.late) {
      st.holder = true;
      st.held = true;
    }
    else {
      const t = treasureItem(p.level, r, st.layer, rng);
      sp.items = [t];
      st.loot.push(t);
    }
  } else if (x < pWin + (1 - pWin) * BOSS_REPEL_SHARE) {
    sp.outcome = 'repelled';
  } else {
    sp.outcome = 'fail';
    sp.injury = injure(w, st, p, at, st.late ? 'boss' : 'fail', true, ev, r);
  }
}

function mateRobs(w: RegionWorld, st: Stay, p: Player, at: number): Player | null {
  if (st.mate?.mode !== 'team' || !st.mate.lead || st.mate.turned || !w.ledger || st.first) return null;
  const m = w.players.get(st.mate.pid);
  if (!m?.npc || m.needRebirth) return null;
  if (st.mate.sure) return null;
  const def = NPC_BY_ID.get(m.npc);
  if (!def) return null;
  const roll = new SeededRng(hashSeed(`${w.seed}:rob:${st.id}`)).nextFloat();
  return roll < npcRobOdds(def, attitudeOf({ ledger: w.ledger }, p.id, m.npc, at)) ? m : null;
}

export function meetMood(w: RegionWorld, a: Player, b: Player, now: number): 'friend' | 'sworn' | null {
  if (!w.ledger) return null;
  for (const [npc, other] of [[a, b], [b, a]] as const) {
    if (!npc.npc) continue;
    const m = attitudeOf({ ledger: w.ledger }, other.id, npc.npc, now);
    if (m === 'friend' || m === 'sworn') return m;
  }
  return null;
}

export function fight(w: RegionWorld, A: Stay, D: Stay, now: number, out: Out): void {
  const pa = w.players.get(A.pid);
  const pd = w.players.get(D.pid);
  if (!pa || !pd) return;
  const rng = new SeededRng(hashSeed(`${w.seed}:fight:${A.id}:${D.id}:${A.fights.length}`));
  const ca = campOf(pa);
  const cd = campOf(pd);
  pruneEnemies(pa, now);
  pruneEnemies(pd, now);
  const bonusA = (ca === 'zheng' && cd === 'mo' ? ZHENG_VS_MO_BONUS : 0) + (isEnemy(pa, pd.id) ? REVENGE_BONUS : 0);
  const bonusD = (cd === 'zheng' && ca === 'mo' ? ZHENG_VS_MO_BONUS : 0) + (isEnemy(pd, pa.id) ? REVENGE_BONUS : 0);
  const pA = duelWinProb({ power: powerNow(A, pa, now, w), yun: A.snap.yun }, { power: powerNow(D, pd, now, w), yun: D.snap.yun }, bonusA - bonusD);
  const aWins = rng.nextFloat() < pA;
  const W = aWins ? A : D;
  const L = aWins ? D : A;
  const pw = aWins ? pa : pd;
  const pl = aWins ? pd : pa;
  const r = miRealm(A.region);
  const res = { ...defeat(w, W, L, pw, pl, now, aWins, out), wasHolder: D.holder };
  const rec = (vs: Stay, aggressor: boolean, won: boolean, winP: number): FightRec => ({
    at: now,
    vs: vs.pid,
    vsName: vs.name,
    beast: false,
    aggressor,
    won,
    winP,
    outcome: res.outcome,
    block: res.block,
    revenge: won && res.revenge,
    bounty: won ? res.bounty : 0,
  });
  A.fights.push(rec(D, true, aWins, pA));
  D.fights.push(rec(A, false, !aWins, 1 - pA));
  W.wins += 1;
  L.losses += 1;
  if (W.spoils < SPOILS_MAX && !W.beat.includes(L.pid)) W.spoils += 1;
  W.beat.push(L.pid);
  if (L.holder) {
    L.holder = false;
    W.holder = true;
    W.held = true;
  }
  const base = { region: A.region, name: r?.name ?? '', outcome: res.outcome, block: res.block, killer: W.stance === 'kill', holderFight: res.wasHolder, loot: res.loot };
  out(A.pid, { kind: 'mijing_fight', ...base, vs: D.name, vsId: D.pid, won: aWins, aggressor: true });
  out(D.pid, { kind: 'mijing_fight', ...base, vs: A.name, vsId: A.pid, won: !aWins, aggressor: false });

  const me = !pa.npc && pd.npc ? pa : pa.npc && !pd.npc ? pd : null;
  if (me) {
    const him = me === pa ? pd : pa;
    const won = me === pw;
    for (const e of settleHunt(me, him, won, won && res.outcome === 'death', now, rng.nextFloat())) out(me.id, e);
  }
  if (L.status === 'in' && (res.outcome === 'death' || res.outcome === 'revive' || res.outcome === 'dun' || res.outcome === 'dying')) kickOut(w, L, pl, now, out);
}

function dropFabao(pl: Player, L: Stay, pw: Player, all: boolean, rng: SeededRng): string[] {
  const seen: Record<string, number> = {};
  const worn = (L.snap.carried ?? []).filter((id) => {
    if (findItem(id)?.cat !== 'fabao') return false;
    seen[id] = (seen[id] ?? 0) + 1;
    return (seen[id] as number) <= (pl.inv[id] ?? 0);
  });

  const bm = pl.benming ? worn.indexOf(pl.benming) : -1;
  if (bm >= 0) worn.splice(bm, 1);
  const n = all ? worn.length : Math.min(SLAIN_DROP_PLAIN, worn.length);
  const lost: string[] = [];
  for (let i = 0; i < n; i++) lost.push(...worn.splice(Math.floor(rng.nextFloat() * worn.length), 1));
  for (const id of lost) {
    removeItem(pl, id);
    addItem(pw, id);
  }
  return lost;
}
function defeat(w: RegionWorld, W: Stay, L: Stay, pw: Player, pl: Player, now: number, winnerIsAggressor: boolean, out: Out): { outcome: Injury; block: FightRec['block']; revenge: boolean; bounty: number; loot: string[] } {
  const ev: GameEvent[] = [];
  const victimCamp = campOf(pl);
  let outcome: Injury = 'none';
  let block: FightRec['block'] = null;
  let revenge = false;
  let bounty = 0;
  let lethal = false;
  let loot: string[] = [];

  const newbie = now < (pl.newbieUntil ?? 0) || isEarly(pl.level) || lagRealms(pl) >= CATCHUP_SHIELD_LAG;
  const stepInjury = () => {
    if (L.snap.hu > 0) {
      L.snap.hu -= 1;
      outcome = 'blocked';
      return;
    }
    if (guarded(w, L, 'pvp')) {
      outcome = 'blocked';
      return;
    }
    if (newbie) {
      if (statusAt(pl, now) === 'ok') setStatus(pl, 'hurt', now, ev);
      outcome = 'hurt';
      return;
    }
    if (statusAt(pl, now) === 'ok') {
      setStatus(pl, 'hurt', now, ev);
      outcome = 'hurt';
    } else {
      setStatus(pl, 'dying', now, ev);
      outcome = 'dying';
      addEnemy(pl, pw.id, now, 'maim');
    }
  };
  const rng = new SeededRng(hashSeed(`${w.seed}:defeat:${W.id}:${L.id}:${W.fights.length}`));
  const healthyKill = rng.nextFloat() < (KILL_HEALTHY_CHANCE[bandOf(pl.level)] as number);

  const feud = !!pw.npc && !!w.ledger && isAvenger(pl, pw.npc, now) && attitudeOf({ ledger: w.ledger }, pl.id, pw.npc, now) === 'feud';

  const kill = (W.stance === 'kill' || feud) && !(now < (pw.newbieUntil ?? 0)) && !newbie && !(lagRealms(pw) >= CATCHUP_SHIELD_LAG);
  if (kill && statusAt(pl, now) === 'ok' && !healthyKill) {
    if (now < pl.protectUntil) stepInjury();
    else if (L.snap.hu > 0) {
      L.snap.hu -= 1;
      outcome = 'blocked';
    } else if (guarded(w, L, 'pvpkill')) outcome = 'blocked';
    else {
      setStatus(pl, 'dying', now, ev);
      outcome = 'dying';
      addEnemy(pl, pw.id, now, 'maim');
    }
  } else if (kill) {
    block = lethalBlock(pw, pl, now);
    if (block === 'protect') stepInjury();
    else if (block) {
      setStatus(pl, 'dying', now, ev);
      outcome = 'dying';
      addEnemy(pl, pw.id, now, 'maim');
    } else if (L.snap.dun > 0) {
      const to = useDun(L);
      if (to !== 'safe') setStatus(pl, to, now, ev);
      outcome = 'dun';
      addEnemy(pl, pw.id, now, 'maim');
    } else {
      lethal = true;
      const xiong = isXiong(pl, now);
      if (xiong) W.extra += 1;
      const reborn = die(pl, 'zhan', now, ev);
      if (pw.npc) {

        if (reborn) {
          rememberNpc(pl, pw.npc, 'slain', now);
          pl.slainBy = { npc: pw.npc, at: now };
        }
      }
      outcome = reborn ? 'death' : 'revive';
      if (reborn) loot = dropFabao(pl, L, pw, xiong, rng);
      const k = afterKill(w, pw, pl, now, out, { selfDefense: !winnerIsAggressor, revived: !reborn, loot });
      bounty = k.bounty;
      revenge = k.revenge;
    }
  } else stepInjury();

  const oc = outcome as Injury;

  if (!pl.npc && !pw.npc) {
    if (oc === 'death' || oc === 'revive') slainTrust(pl, pw);
    else if (oc === 'hurt' || oc === 'dying' || oc === 'dun') {
      addTrust(pl, pw.id, -(oc === 'hurt' ? TRUST_LOSS.hurt : TRUST_LOSS.maim));
      checkBond(pl, pw);
    }
  }
  if (pl.npc && w.ledger && (oc === 'hurt' || oc === 'dying' || oc === 'dun')) record({ ledger: w.ledger }, pw.id, pl.npc, oc === 'hurt' ? 'hurt' : 'maim', now);
  for (const e of ev) out(pl.id, e);
  if (winnerIsAggressor) {
    const evW: GameEvent[] = [];

    const owedBlood = !!pl.npc && hasGrudge(pw, pl.npc) && SLAY_SHANE[victimCamp] < 0;
    if (lethal && !owedBlood) applyShane(pw, SLAY_SHANE[victimCamp], evW, now);
    else if (!kill) applyShane(pw, SLAY_SHANE.spare, evW, now);
    for (const e of evW) out(pw.id, e);
  }
  return { outcome, block, revenge, bounty, loot };
}

function dropHolder(st: Stay): void {
  st.holder = false;
}
function endWindow(p: Player, st: Stay, at: number): void {
  for (const win of p.windows) if (win.runId === st.id) win.end = at;
  p.windows = p.windows.filter((x) => x.end > x.start);
}

export function finishStay(w: RegionWorld, st: Stay, at: number, reason: StayResult['reason'], out: Out): void {
  if (st.status !== 'in') return;
  const p = w.players.get(st.pid);
  st.status = 'done';
  if (!p) return;
  bank(p, at);
  const r = miRealm(st.region);
  const rng = new SeededRng(hashSeed(`${w.seed}:finish:${st.id}`));
  const ev: GameEvent[] = [];
  let items = [...st.loot];
  let lingshi = st.lingshi;
  if (reason === 'fail') {

    const keep = Math.ceil(items.length * FAIL_ITEM_KEEP);
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rng.nextFloat() * (i + 1));
      [items[i], items[j]] = [items[j] as string, items[i] as string];
    }
    items = items.slice(0, keep);
    lingshi = Math.round(lingshi * FAIL_LINGSHI_KEEP);
  } else if (reason === 'kicked') {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rng.nextFloat() * (i + 1));
      [items[i], items[j]] = [items[j] as string, items[i] as string];
    }

    items = p.needRebirth ? [] : items.slice(0, Math.ceil(items.length * KICKED_ITEM_KEEP));
    lingshi = Math.round(lingshi * KICKED_LINGSHI);
  }

  const treasure = st.late ? st.holder && reason === 'done' : st.bossWon;
  if (st.late && treasure && r) items.push(treasureItem(p.level, r, st.layer, rng));
  if (st.holder && !treasure) dropHolder(st);
  st.holder = false;
  if (reason !== 'kicked' && r) for (let i = 0; i < st.spoils + st.extra; i++) items.push(themedItem(p.level, lootTier(p.level, st.grade, 0, rng), rng, r));
  lingshi = Math.round(lingshi * (1 + titleBonusAt(p, 'duobao', at)));

  const spent = st.first ? (MI_DEPTHS[st.grade].hours * HOUR * Math.min(1, (Math.min(at, st.end) - st.start) / Math.max(1, st.end - st.start))) : Math.min(at, st.end) - st.start;
  const lilian = p.needRebirth ? 0 : grantXiuweiHours(p, (spent / HOUR) * LILIAN_FACTOR, at, ev);
  p.lingshi += lingshi;
  for (const it of items) {
    addItem(p, it);
    const x = findItem(it);
    if (x && x.tier === 5) w.rumors.push({ at, kind: 'orange', who: p.daohao, text: x.name });
  }
  endWindow(p, st, at);
  st.end = Math.min(st.end, at);
  const bossStage = st.stages.find((s) => s.ref === 'boss' && s.done);
  const beast: StayResult['beast'] = !bossStage || bossStage.pvp ? 'none' : bossStage.outcome === 'win' ? 'won' : 'lost';
  st.result = { lingshi, lilian, items, alone: !st.fights.length, treasure, beast, kicked: reason === 'kicked', left: reason === 'left', reason };

  if (st.mate?.lead && reason !== 'kicked') {
    const m = w.players.get(st.mate.pid);
    if (m?.npc && w.ledger && !st.mate.turned) record({ ledger: w.ledger }, p.id, m.npc, 'team', at);

    if (m && !m.npc && st.mate.mode === 'shen') {
      const thanks = Math.round(lingshi * SHEN_THANKS);
      m.lingshi += thanks;
      addTrust(p, m.id, SHEN_TRUST);
      addTrust(m, p.id, SHEN_TRUST);
      out(m.id, { kind: 'shen_thanks', from: p.daohao, name: r?.name ?? '', lingshi: thanks });
    }
  }
  if (p.stay === st.id) p.stay = null;

  if (r) {
    p.mjMem ??= {};
    const bossName = r.layers[st.layer]?.boss.name ?? '';
    const failed = st.stages.find((s) => s.done && (s.outcome === 'fail' || s.outcome === 'scrape'));
    p.mjMem[r.id] = bossStage && !bossStage.pvp ? { kind: bossStage.outcome === 'win' ? 'boss_win' : 'boss_lost', name: bossName } : failed ? { kind: 'failed', name: (STAGE_BY_ID.get(failed.ref)?.title ?? '') } : { kind: 'plain', name: '' };
  }
  out(p.id, {
    kind: 'mijing_result',
    region: st.region,
    name: r?.name ?? '',
    layer: st.layer,
    realm: st.realm,
    grade: st.grade,
    late: st.late,
    reason,
    alone: !st.fights.length,
    treasure,
    wins: st.wins,
    losses: st.losses,
    items,
    lingshi,
    lilian,
    beast,
    beastName: r?.layers[st.layer]?.boss.name ?? '',
    kicked: reason === 'kicked',
    dead: reason === 'kicked' && !!p.needRebirth,
    mate: st.mate?.name ?? null,
    left: reason === 'left',
    stages: st.stages.filter((s) => s.done).map((s) => ({ ref: s.ref, title: s.ref === 'boss' ? (r?.layers[st.layer]?.boss.name ?? '') : (STAGE_BY_ID.get(s.ref)?.title ?? ''), boss: s.ref === 'boss', outcome: s.outcome ?? null, opt: s.opt ?? null, injury: s.pvp ? (s.pvp.won ? null : s.pvp.outcome) : (s.injury ?? null), pvp: s.pvp ? s.pvp.vsName : null })),
  });
  for (const e of ev) out(p.id, e);
}

export function kickOut(w: RegionWorld, st: Stay, p: Player, now: number, out: Out): void {
  if (st.status !== 'in') return;
  void p;
  finishStay(w, st, now, 'kicked', out);
}

export function retakeBlock(w: RegionWorld, p: Player, now: number): string | null {
  const st = stayOf(w, p);
  if (!st || st.status !== 'in') return '没在秘境里';
  if (!st.late) return '前期各自历练，不夺别人手里的宝物';
  if (st.holder) return '宝物在你手里';
  if (!st.bossWon && !st.held) return '还没拿到过宝物';
  if (st.retook) return '这一趟已经夺过一回了';
  if (statusAt(p, now) === 'dying') return '重伤濒死，斗不动了';
  const h = occupants(w, st.inst, now).find((o) => o.holder && o.id !== st.id);
  return h ? null : '宝物已经不在这里了';
}
export function retake(w: RegionWorld, p: Player, now: number, out: Out): void {
  const why = retakeBlock(w, p, now);
  if (why) throw new Error(why);
  const st = stayOf(w, p) as Stay;
  const h = occupants(w, st.inst, now).find((o) => o.holder && o.id !== st.id) as Stay;
  st.retook = true;
  fight(w, st, h, now, out);
}

export function leaveRegion(w: RegionWorld, p: Player, now: number, out: Out): void {
  const st = stayOf(w, p);
  if (!st || st.status !== 'in') throw new Error('没在秘境里');
  finishStay(w, st, now, 'left', out);
}

export function releaseStay(w: RegionWorld, st: Stay, now: number): void {
  if (st.status !== 'in') return;
  const p = w.players.get(st.pid);
  const at = Math.min(st.end, now);
  st.status = 'done';
  if (p) {
    bank(p, at);
    endWindow(p, st, at);
    if (p.stay === st.id) p.stay = null;
  }
  st.end = at;
}

function settleOld(w: RegionWorld, st: Stay, at: number, out: Out): void {
  if (st.status !== 'in') return;
  const p = w.players.get(st.pid);
  if (!p) return releaseStay(w, st, at);
  bank(p, at);
  const g = MIJING_GRADES[st.grade ?? 1] ?? MIJING_GRADES[1];
  const frac = Math.max(0, Math.min(1, (at - st.start) / Math.max(1, st.end - st.start)));
  const lingshi = Math.round(g.lingshi * (1 + LINGSHI_REALM_SCALE * realmOf(p.level)) * 0.5 * frac);
  const ev: GameEvent[] = [];
  const lilian = p.needRebirth ? 0 : grantXiuweiHours(p, ((at - st.start) / HOUR) * LILIAN_FACTOR, at, ev);
  p.lingshi += lingshi;
  releaseStay(w, st, at);
  st.holder = false;
  st.result = { lingshi, lilian, items: [], alone: !st.fights?.length, treasure: false, beast: 'none', kicked: false, left: true, reason: 'left' };
  out(p.id, { kind: 'mijing_result', region: st.region, name: '旧秘境', layer: 0, realm: realmOf(p.level), grade: st.grade ?? 1, late: false, reason: 'left', alone: true, treasure: false, wins: st.wins ?? 0, losses: st.losses ?? 0, items: [], lingshi, lilian, beast: 'none', beastName: '', kicked: false, left: true, stages: [], old: true });
  for (const e of ev) out(p.id, e);
}

export function stayJobs(w: RegionWorld, now: number, out: (at: number) => Out): { at: number; run: () => void }[] {
  const jobs: { at: number; run: () => void }[] = [];
  for (const st of w.stays.values()) {
    if (st.status !== 'in') continue;
    if (!st.stages || !miRealm(st.region)) {

      const at = Math.min(now, st.end);
      jobs.push({ at, run: () => settleOld(w, st, at, out(at)) });
      continue;
    }
    st.stages.forEach((sp, i) => {
      if (!sp.done && sp.at <= now) jobs.push({ at: sp.at, run: () => resolveStage(w, st, i, out(sp.at)) });
    });
    if (st.end <= now) jobs.push({ at: st.end + 0.5, run: () => st.status === 'in' && st.next >= st.stages.length && finishStay(w, st, st.end, 'done', out(st.end)) });
  }
  return jobs;
}

export function whereIs(w: RegionWorld, p: Player, now: number): { kind: 'mijing'; region: string; name: string; until: number; inst: string } | { kind: 'youli'; until: number } | { kind: 'home' } {
  const st = stayOf(w, p);
  if (st && st.status === 'in' && now < st.end) {
    const r = miRealm(st.region);
    if (r) return { kind: 'mijing', region: r.id, name: r.name, until: st.end, inst: st.inst };
  }
  if (p.youli && now < p.youli.end) return { kind: 'youli', until: p.youli.end };
  return { kind: 'home' };
}

export function itemName(id: string): string {
  return findItem(id)?.name ?? item(id).name;
}
