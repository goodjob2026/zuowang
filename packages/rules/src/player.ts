import {
  ACTIVE_WINDOW_MS,
  LOADOUT_CONSUMABLE_MAX,
  HU_WEAK_FROM_REALM,
  FABAO_PER_ROLE,
  HU_WEAK_MAX_TIER,
  BRACELET_SLOTS,
  DANTIAN_CAP_MS,
  DYING_MS,
  GONGFA_SHANG,
  GONGFA_YUN,
  GONGFA_ZUO,
  HOUR,
  HURT_MS,
  HURT_RATE,
  LAYERS_PER_REALM,
  MAX_LEVEL,
  MO_GONGFA_MULT,
  MO_RATE,
  SAN_RATE,
  ZUO_PACE,
  NEW_PLAYER_DANTIAN_FULL,
  REALMS,
  SHANE_MO,
  SHANE_ZHENG,
  baseRate,
  need,
  CATCHUP_RATE,
  CATCHUP_GATE_MAX,
  CATCHUP_GATE_PER_REALM,
  CATCHUP_ZUO_MAX,
  CATCHUP_ZUO_PER_REALM,
  NEWBIE_MS,
  BOARD_BONUS,
} from './config.ts';
import { type Gender, ITEMS, type Item, STARTER_GONGFA, type Xinxing, canon, fabaoRole, findItem, item } from './content.ts';
import type { GameEvent } from './events.ts';

export type Status = 'ok' | 'hurt' | 'dying';
export type Camp = 'zheng' | 'mo' | 'san';

export interface Dantian {
  qi: number;
  sitMs: number;
  lostMs: number;
  since: number;
}
export interface Buff {
  kind: 'zuo';
  value: number;
  until: number;
}
export interface TimeWindow {
  start: number;
  end: number;
  runId: string;
}
export interface PendingQiyu {
  uid: string;
  eventId: string;
  grantedAt: number;
  again?: 'big' | 'bad';
  after?: 'shan' | 'e';
}
export interface PendingKill {
  uid: string;
  targetId: string;
  targetName: string;
  until: number;
}

export interface Player {
  id: string;
  daohao: string;
  gender: Gender;
  xinxing: Xinxing;
  xingxiang: string;
  level: number;
  xiuwei: number;
  dantian: Dantian;
  status: Status;
  statusUntil: number;
  shane: number;
  gongfa: string;
  inv: Record<string, number>;
  loadout: string[];
  lingshi: number;
  buffs: Buff[];
  windows: TimeWindow[];
  registeredRun: string | null;
  julingDay: string;
  julingCount: number;
  healDyingDay: string;
  healDyingCount: number;
  qiyu: PendingQiyu[];
  qiyuSeen: Record<string, number>;
  qiyuMissed?: { eventId: string; due: number }[];
  qiyuNoon?: string;

  qiyuAfter?: { eventId: string; opt: 'shan' | 'e'; due: number }[];
  dailyDay: string;
  pendingKills: PendingKill[];
  protectUntil: number;
  killedWeek: string;
  killedCount: number;
  deaths: number;
  feisheng: number;
  needRebirth: boolean;
  gateFails: number;
  gateFullSince: number;
  createdAt: number;
  lastSeenAt: number;

  trust?: Record<string, number>;

  friends?: string[];

  lundao?: { day: string; gave: number; got: number };

  raid?: { day: string; made: number; by: Record<string, number>; shieldUntil: number; hitDay: string; hit: number; streak: number; streakDay: string; owed: { from: string; name: string; qi: number; until: number } | null; heavyWeek: string };

  shenDay?: string;

  mateNo?: { day: string; ids: string[] };

  friendAsks?: { from: string; at: number }[];

  foes?: string[];

  avengers?: { npc: string; saidAt: number }[];

  npcMem?: { npc: string; kind: NpcMemKind; at: number }[];

  yuan?: import('./yuan.ts').Yuan[];

  yuanDay?: string;

  yuanSeen?: Record<string, number>;

  yuanTryAt?: number;

  benming?: string;

  slainBy?: { npc: string; at: number };

  mediated?: Record<string, number>;

  npc?: string;

  npcHome?: number;

  npcNext?: number;

  activeAt?: number;
  uidSeq: number;
  rike: Rike;

  qiandao?: { day: string; streak: number };
  youli: Youli | null;
  youliBack: YouliResult | null;
  youliRecent: string[];

  keeps?: string[];
  stay: string | null;
  stance: 'spare' | 'kill';
  enemies: Enemy[];
  kills: { at: number; victim: string; justified?: boolean }[];
  xiongClaimed: Record<string, number>;
  maxLevel: number;
  renshe: string;
  newbieUntil: number;
  week: { key: string; duobao: number; e: number; shan: number; jin?: number };
  titles: { board: 'xiuwei' | 'jin' | 'duobao' | 'e' | 'shan'; rank: number; until: number }[];
  giftDay: string;
  mjSeen: Record<string, number>;

  mjFirstDone?: boolean;
  mjMem: Record<string, { kind: 'boss_win' | 'boss_lost' | 'failed' | 'plain'; name: string }>;
  heirs: string[];
  lead: number;
  zhidian: { day: string; gave: number; got: number };
}

export type NpcMemKind =
  | 'betray' | 'cold' | 'grateful' | 'slain' | 'rob'
  | 'back' | 'let' | 'sent' | 'lost' | 'accept' | 'yao' | 'yao_no' | 'chutou' | 'chutou_lost' | 'tongxing'
  | 'siege_won' | 'siege_lost' | 'hid' | 'amends' | 'saved' | 'gone' | 'again' | 'took' | 'beg_no';
export interface Enemy {
  id: string;
  at: number;
  why: 'kill' | 'maim' | 'rob' | 'fu';
  times: number;
}
export type RikeId = 'collect' | 'sit6' | 'mijing' | 'qiyu' | 'shop' | 'dan' | 'youli';
export interface RikeTask {
  id: RikeId;
  done: boolean;
  prog: number;
}
export interface Rike {
  day: string;
  tasks: RikeTask[];
  bonus: boolean;
}
export interface Youli {
  start: number;
  end: number;
  hours: number;
}
export interface YouliResult {
  story: string;
  hours: number;
  at: number;
  lingshi: number;
  items: string[];
  xiuwei?: number;

  keep?: { id: string; fresh: boolean };

  meet?: { npc: string; name: string; mood: string; pick: number; effect?: 'show' | 'gift'; lingshi?: number; day?: string; regionName?: string };
}

export function fillDefaults(p: Player): Player {
  p.rike ??= { day: '', tasks: [], bonus: false };

  for (const id of Object.keys(p.inv ?? {})) {
    const to = canon(id);
    if (to === id) continue;
    p.inv[to] = (p.inv[to] ?? 0) + (p.inv[id] ?? 0);
    delete p.inv[id];
  }
  if (p.loadout?.some((id) => canon(id) !== id)) p.loadout = p.loadout.map(canon);
  p.qiyuMissed ??= [];
  p.youli ??= null;
  p.youliBack ??= null;
  p.youliRecent ??= [];
  p.stay ??= null;
  p.stance ??= 'spare';
  p.enemies ??= [];
  p.kills ??= [];
  p.xiongClaimed ??= {};
  p.maxLevel ??= p.level;
  p.renshe ??= '';
  p.newbieUntil ??= 0;
  p.week ??= { key: '', duobao: 0, e: 0, shan: 0 };
  p.titles ??= [];
  p.giftDay ??= '';
  p.mjSeen ??= {};
  p.mjMem ??= {};
  p.heirs ??= [];
  p.lead ??= 0;
  p.zhidian ??= { day: '', gave: 0, got: 0 };
  p.trust ??= {};
  p.avengers ??= [];
  p.mediated ??= {};
  p.friends ??= [];
  p.friendAsks ??= [];
  p.foes ??= [];

  p.windows = p.windows.filter((w) => w.runId.startsWith('s:'));
  p.registeredRun = null;
  return p;
}

export function realmOf(level: number): number {
  return Math.floor(level / LAYERS_PER_REALM);
}
export function layerOf(level: number): number {
  return (level % LAYERS_PER_REALM) + 1;
}
export function levelName(level: number): string {
  return `${REALMS[realmOf(level)]} · ${['一', '二', '三', '四'][level % LAYERS_PER_REALM]}层`;
}

export function gateOf(level: number): number {
  return level % LAYERS_PER_REALM === LAYERS_PER_REALM - 1 ? realmOf(level) : -1;
}
export function campOf(p: Pick<Player, 'shane'>): Camp {
  if (p.shane >= SHANE_ZHENG) return 'zheng';
  if (p.shane <= SHANE_MO) return 'mo';
  return 'san';
}
export function nextUid(p: Player): string {
  p.uidSeq += 1;
  return `${p.id}.${p.uidSeq}`;
}

export function newPlayer(a: {
  id: string;
  daohao: string;
  gender: Gender;
  xinxing: Xinxing;
  xingxiang: string;
  shane: number;
  now: number;
  renshe?: string;
  gongfa?: string;
}): Player {
  const gf = a.gongfa ?? STARTER_GONGFA.id;
  const p: Player = {
    id: a.id,
    daohao: a.daohao,
    gender: a.gender,
    xinxing: a.xinxing,
    xingxiang: a.xingxiang,
    level: 0,
    xiuwei: 0,
    dantian: { qi: 0, sitMs: 0, lostMs: 0, since: a.now },
    status: 'ok',
    statusUntil: 0,
    shane: a.shane,
    gongfa: gf,
    inv: { [gf]: 1, bracelet_0: 1 },
    loadout: [],
    lingshi: 100,
    buffs: [],
    windows: [],
    registeredRun: null,
    julingDay: '',
    julingCount: 0,
    healDyingDay: '',
    healDyingCount: 0,
    qiyu: [],
    qiyuSeen: {},
    dailyDay: '',
    pendingKills: [],
    protectUntil: 0,
    killedWeek: '',
    killedCount: 0,
    deaths: 0,
    feisheng: 0,
    needRebirth: false,
    gateFails: 0,
    gateFullSince: 0,
    createdAt: a.now,
    lastSeenAt: a.now,
    uidSeq: 0,
    rike: { day: '', tasks: [], bonus: false },
    youli: null,
    youliBack: null,
    youliRecent: [],
    stay: null,
    stance: 'spare',
    enemies: [],
    kills: [],
    xiongClaimed: {},
    maxLevel: 0,
    renshe: a.renshe ?? '',
    newbieUntil: a.now + NEWBIE_MS,
    week: { key: '', duobao: 0, e: 0, shan: 0 },
    titles: [],
    giftDay: '',
    mjSeen: {},
    mjMem: {},
    heirs: [],
    lead: 0,
    zhidian: { day: '', gave: 0, got: 0 },
  };
  if (NEW_PLAYER_DANTIAN_FULL) {

    p.dantian = { qi: baseRate(0) * (1 + gongfaZuo(p)) * (DANTIAN_CAP_MS / HOUR), sitMs: DANTIAN_CAP_MS, lostMs: 0, since: a.now };
  }
  return p;
}

export function activeGongfa(p: Player): Item {
  return item(p.gongfa);
}
export function gongfaZuo(p: Player): number {
  const g = activeGongfa(p);
  if (g.focus !== 'zuo') return 0;
  return (GONGFA_ZUO[g.tier] as number) * (g.mo ? MO_GONGFA_MULT : 1);
}
export function gongfaYun(p: Player): number {
  const g = activeGongfa(p);
  return g.focus === 'yun' ? (GONGFA_YUN[g.tier] as number) : 0;
}
export function shangMult(p: Player): number {
  const g = activeGongfa(p);
  return g.focus === 'shang' ? (GONGFA_SHANG[g.tier] as number) : 1;
}
export function braceletSlots(p: Player): number {
  let best = 0;
  for (let t = 0; t < BRACELET_SLOTS.length; t++) if ((p.inv[`bracelet_${t}`] ?? 0) > 0) best = t;
  return BRACELET_SLOTS[best] as number;
}

export function carriable(it: Item): boolean {
  return it.cat === 'fabao' || (['dan', 'cao', 'fu'].includes(it.cat) && ['dou', 'hu', 'dun', 'yun'].includes(it.effect ?? ''));
}

export function bestFabao(p: Player): string[] {
  const qi = activeGongfa(p).qi;
  const own = Object.entries(p.inv)
    .filter(([, n]) => n > 0)
    .map(([id]) => ITEMS.get(id))
    .filter((x): x is Item => !!x && x.cat === 'fabao');
  const out: string[] = [];
  for (const role of ['gong', 'shou', 'qi'] as const) {
    const mine = own.filter((x) => fabaoRole(x) === role).sort((a, b) => b.tier - a.tier || Number(b.qi === qi) - Number(a.qi === qi) || a.id.localeCompare(b.id));
    for (const x of mine.slice(0, FABAO_PER_ROLE)) out.push(x.id);
  }
  return out;
}

export function autoLoadout(p: Player): string[] {
  const own = Object.entries(p.inv)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ it: item(id), n }))
    .filter((x) => carriable(x.it));
  const best = (f: (it: Item) => boolean) => own.filter((x) => f(x.it)).sort((a, b) => b.it.tier - a.it.tier || a.it.id.localeCompare(b.it.id));
  const out: string[] = [];
  out.push(...bestFabao(p));
  for (const eff of ['hu', 'dun']) {
    const x = best((it) => it.cat !== 'fabao' && it.effect === eff && !huTooWeak(p, it.id))[0];
    if (x) out.push(x.it.id);
  }
  for (const x of best((it) => it.cat !== 'fabao' && (it.effect === 'dou' || it.effect === 'yun'))) {
    for (let k = 0; k < Math.min(x.n, 3); k++) out.push(x.it.id);
  }
  return out.slice(0, braceletSlots(p));
}
export function statusAt(p: Player, t: number): Status {
  if (p.status !== 'ok' && t < p.statusUntil) return p.status;
  return 'ok';
}

export function titleBonusAt(p: Player, board: 'duobao' | 'e' | 'shan', t: number): number {

  const live = (p.titles ?? []).filter((y) => t < y.until);
  const order = ['duobao', 'e', 'shan'];
  const best = [...live].sort((a, b) => a.rank - b.rank || order.indexOf(a.board) - order.indexOf(b.board))[0];
  if (!best || best.board !== board) return 0;
  return (BOARD_BONUS[board] as readonly number[])[best.rank - 1] ?? 0;
}
function buffAt(p: Player, t: number): number {
  let v = 0;
  for (const b of p.buffs) if (b.kind === 'zuo' && t < b.until) v = Math.max(v, b.value);
  return v;
}
function inWindow(p: Player, t: number): boolean {
  return p.windows.some((w) => t >= w.start && t < w.end);
}

export function awayAt(p: Player, t: number): boolean {
  return !!p.youli && t >= p.youli.start && t < p.youli.end;
}

export function lagRealms(p: Player): number {
  return Math.max(0, realmOf(Math.round(p.lead ?? 0)) - realmOf(p.level));
}
export function catchupZuo(p: Player): number {
  return Math.min(CATCHUP_ZUO_MAX, CATCHUP_ZUO_PER_REALM * lagRealms(p));
}
export function catchupGate(p: Player): number {
  return Math.min(CATCHUP_GATE_MAX, CATCHUP_GATE_PER_REALM * lagRealms(p));
}
export function healthyRate(p: Player, t: number): number {
  const mult = (1 + gongfaZuo(p) + buffAt(p, t) + titleBonusAt(p, 'shan', t)) * (campOf(p) === 'mo' ? MO_RATE : campOf(p) === 'san' ? SAN_RATE : 1) * ZUO_PACE * (p.level < p.maxLevel ? CATCHUP_RATE : 1) * (1 + catchupZuo(p));
  return baseRate(p.level) * mult;
}

export function rateAt(p: Player, t: number): number {
  if (inWindow(p, t) || awayAt(p, t)) return 0;
  const s = statusAt(p, t);
  if (s === 'dying') return 0;
  return healthyRate(p, t) * (s === 'hurt' ? HURT_RATE : 1);
}

export function accrue(p: Player, now: number): Dantian {
  const d = { ...p.dantian };
  if (now <= d.since) return d;
  const pts = new Set<number>([d.since, now]);
  const add = (t: number) => {
    if (t > d.since && t < now) pts.add(t);
  };
  add(p.statusUntil);
  for (const b of p.buffs) add(b.until);
  for (const w of p.windows) {
    add(w.start);
    add(w.end);
  }
  if (p.youli) {
    add(p.youli.start);
    add(p.youli.end);
  }
  const ts = [...pts].sort((a, b) => a - b);
  for (let i = 0; i + 1 < ts.length; i++) {
    const a = ts[i] as number;
    const b = ts[i + 1] as number;
    const mid = (a + b) / 2;
    const r = rateAt(p, mid);
    if (r <= 0) continue;
    const room = DANTIAN_CAP_MS - d.sitMs;
    const dt = Math.min(b - a, Math.max(0, room));
    d.qi += (r * dt) / HOUR;
    d.sitMs += dt;
    d.lostMs += b - a - dt;
  }
  d.since = now;
  return d;
}

export function bank(p: Player, now: number): void {
  p.dantian = accrue(p, now);
  p.windows = p.windows.filter((w) => w.end > now);
  p.buffs = p.buffs.filter((b) => b.until > now);
  if (p.status !== 'ok' && p.statusUntil <= now) {
    p.status = 'ok';
    p.statusUntil = 0;
  }
}

export function autoLevel(p: Player, events: GameEvent[]): void {
  while (p.level < MAX_LEVEL || gateOf(p.level) >= 0) {
    const n = need(p.level);
    if (gateOf(p.level) >= 0) {
      if (p.xiuwei > n) p.xiuwei = n;
      return;
    }
    if (p.xiuwei < n) return;
    p.xiuwei -= n;
    p.level += 1;
    if (p.level > p.maxLevel) p.maxLevel = p.level;
    events.push({ kind: 'levelup', level: p.level });
  }
}

export function isActive(p: Player, now: number): boolean {
  return now - (p.activeAt ?? p.lastSeenAt ?? p.createdAt) <= ACTIVE_WINDOW_MS;
}

export function collect(p: Player, now: number): GameEvent[] {
  p.activeAt = now;
  bank(p, now);
  const all = Math.floor(p.dantian.qi);

  const room = gateOf(p.level) >= 0 ? Math.max(0, need(p.level) - p.xiuwei) : Number.POSITIVE_INFINITY;
  const gain = Math.min(all, room);
  const ev: GameEvent[] = [{ kind: 'collect', gain, held: all - gain, sitMs: p.dantian.sitMs, lostMs: p.dantian.lostMs }];
  if (gain > 0) {
    p.xiuwei += gain;
    if (gain >= all) p.dantian = { qi: 0, sitMs: 0, lostMs: 0, since: now };
    else {
      const keep = (p.dantian.qi - gain) / p.dantian.qi;
      p.dantian = { qi: p.dantian.qi - gain, sitMs: p.dantian.sitMs * keep, lostMs: 0, since: now };
    }
  }
  autoLevel(p, ev);
  markGateFull(p, now);
  return ev;
}

export function rememberNpc(p: Player, npc: string, kind: NpcMemKind, at: number): void {
  p.npcMem = [...(p.npcMem ?? []), { npc, kind, at }].slice(-40);
}

export function markGateFull(p: Player, now: number): void {
  if (gateOf(p.level) >= 0 && p.xiuwei >= need(p.level)) {
    if (!p.gateFullSince) p.gateFullSince = now;
  } else p.gateFullSince = 0;
}

export function grantXiuweiHours(p: Player, hours: number, now: number, events: GameEvent[], healthy = true): number {
  const r = healthy ? healthyRate(p, now) : rateAt(p, now);
  const gain = Math.floor(r * hours);
  const lv = p.level;
  const before = p.xiuwei;
  p.xiuwei += gain;
  autoLevel(p, events);
  markGateFull(p, now);

  return p.level !== lv ? gain : Math.max(0, Math.min(gain, p.xiuwei - before));
}

export function setStatus(p: Player, kind: Exclude<Status, 'ok'>, now: number, events: GameEvent[]): void {
  bank(p, now);
  const cur = statusAt(p, now);
  if (cur === 'dying' && kind === 'hurt') return;
  const base = kind === 'hurt' ? HURT_MS : DYING_MS;
  p.status = kind;
  p.statusUntil = now + base * shangMult(p);
  events.push({ kind: 'status', status: kind, until: p.statusUntil, ms: p.statusUntil - now });
}
export function heal(p: Player, to: Status, now: number, events: GameEvent[]): void {
  bank(p, now);
  if (to === 'ok') {
    p.status = 'ok';
    p.statusUntil = 0;
  } else {
    p.status = to;
    p.statusUntil = now + (to === 'hurt' ? HURT_MS : DYING_MS) * shangMult(p);
  }
  events.push({ kind: 'healed', status: to });
}

export function addItem(p: Player, id0: string, n = 1): void {
  const id = canon(id0);
  if (!ITEMS.has(id)) throw new Error(`未知物品 ${id}`);
  p.inv[id] = (p.inv[id] ?? 0) + n;
}
export function removeItem(p: Player, id0: string, n = 1): boolean {
  const id = canon(id0);
  const have = p.inv[id] ?? 0;
  if (have < n) return false;
  if (have === n) {
    delete p.inv[id];
    if (p.benming === id) delete p.benming;
  } else p.inv[id] = have - n;
  return true;
}

export function benmingBlock(p: Player, id: string | null): string | null {
  if (p.stay) return '人在秘境里，出来再炼';
  if (id === null) return p.benming ? null : '眼下没有本命法宝';
  const it = findItem(id);
  if (!it || it.cat !== 'fabao') return '只有法宝能炼为本命';
  if ((p.inv[it.id] ?? 0) < 1) return '你身上没有这件法宝';
  if (p.benming === it.id) return '它已经是你的本命法宝';
  return null;
}

export function setBenming(p: Player, id: string | null): GameEvent[] {
  const why = benmingBlock(p, id);
  if (why) throw new Error(why);
  if (id === null) {
    const was = p.benming as string;
    delete p.benming;
    return [{ kind: 'benming', id: null, was }];
  }
  const was = p.benming ?? null;
  p.benming = (findItem(id) as Item).id;
  return [{ kind: 'benming', id: p.benming, was }];
}

export function huTooWeak(p: Player, id: string): boolean {
  const x = ITEMS.get(canon(id));
  return !!x && x.effect === 'hu' && x.tier <= HU_WEAK_MAX_TIER && realmOf(p.level) >= HU_WEAK_FROM_REALM;
}

export function effectiveLoadout(p: Player): string[] {
  const used: Record<string, number> = {};
  const cap = braceletSlots(p);

  let cons = 0;
  return p.loadout
    .filter((id) => {
      used[id] = (used[id] ?? 0) + 1;
      if (!ITEMS.has(id) || (used[id] as number) > (p.inv[id] ?? 0)) return false;
      if (huTooWeak(p, id)) return false;
      const cat = (ITEMS.get(id) as Item).cat;
      if (cat === 'dan' || cat === 'cao' || cat === 'fu') {
        cons += 1;
        if (cons > LOADOUT_CONSUMABLE_MAX) return false;
      }
      return true;
    })
    .slice(0, cap);
}
