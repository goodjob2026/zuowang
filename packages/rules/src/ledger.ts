import npcRaw from '../content/npc.json' with { type: 'json' };
import npcLinesRaw from '../content/npclines.json' with { type: 'json' };
import npcSayRaw from '../content/npcsay.json' with { type: 'json' };
import npcEnRaw from '../content/npcen.json' with { type: 'json' };
import npcScenesRaw from '../content/npcscenes.json' with { type: 'json' };
import { DAY, NPC_REPAY, NPC_REPAY_FRIEND, NPC_REPAY_THIN, NPC_TEAM_ROB } from './config.ts';

export type RelKind = 'near' | 'mid' | 'far' | 'foe';
export interface NpcRel {
  id: string | null;
  name: string;
  rel: string;
  kind: RelKind;
}
export interface NpcDef {
  id: string;
  name: string;
  book: string;
  main: boolean;
  realm: number;
  camp: 'zheng' | 'mo' | 'san';
  qi: string;
  xinxing: 'jian' | 'ren' | 'kuang' | 'gui';
  dong: number;
  qing: number;
  sha: number;
  gender: 'm' | 'f';
  identity: string;
  bio: string;
  motto: string;
  lastWords: string;
  relations: NpcRel[];
}
export const NPCS: NpcDef[] = npcRaw as NpcDef[];
export const NPC_BY_ID = new Map(NPCS.map((n) => [n.id, n]));

const INVERSE: Record<string, (g: 'm' | 'f') => string> = {
  师父: () => '徒弟', 徒弟: () => '师父', 父亲: (g) => (g === 'f' ? '女儿' : '儿子'), 母亲: (g) => (g === 'f' ? '女儿' : '儿子'), 儿子: (g) => (g === 'f' ? '母亲' : '父亲'), 女儿: (g) => (g === 'f' ? '母亲' : '父亲'),
  丈夫: () => '妻子', 妻子: () => '丈夫', 主人: () => '仆从', 仆从: () => '主人', 坐骑: () => '主人',
  兄: (g) => (g === 'f' ? '妹' : '弟'), 弟: (g) => (g === 'f' ? '姐' : '兄'), 姐: (g) => (g === 'f' ? '妹' : '弟'), 妹: (g) => (g === 'f' ? '姐' : '兄'),
  师兄: (g) => (g === 'f' ? '师妹' : '师弟'), 师弟: (g) => (g === 'f' ? '师姐' : '师兄'), 师姐: (g) => (g === 'f' ? '师妹' : '师弟'), 师妹: (g) => (g === 'f' ? '师姐' : '师兄'),
};
const KIN = new Map<string, NpcRel[]>(NPCS.map((n) => [n.id, n.relations.filter((r) => r.id && r.id !== n.id).map((r) => ({ ...r }))]));
for (const n of NPCS) {
  for (const r of n.relations) {
    if (!r.id || r.id === n.id) continue;
    const back = KIN.get(r.id);
    if (!back || back.some((x) => x.id === n.id)) continue;

    back.push({ id: n.id, name: n.name, rel: INVERSE[r.rel]?.(n.gender) ?? r.rel, kind: r.kind });
  }
}

const CLOSE: Record<RelKind, number> = { near: 3, mid: 2, far: 1, foe: 0 };
for (const [id, rels] of KIN) {
  for (const r of rels) {
    const back = KIN.get(r.id as string)?.find((x) => x.id === id);
    if (!back || r.kind === 'foe' || back.kind === 'foe') continue;
    if (CLOSE[back.kind] > CLOSE[r.kind]) r.kind = back.kind;
  }
}

export function kinOf(npcId: string): NpcRel[] {
  return KIN.get(npcId) ?? [];
}

export type LedgerKind = 'kill' | 'maim' | 'hurt' | 'rob' | 'spare' | 'help' | 'save' | 'gift' | 'amends' | 'mediate' | 'team';
export interface LedgerEntry {
  at: number;
  who: string;
  npc: string;
  kind: LedgerKind;
}
export interface LedgerWorld {
  ledger: LedgerEntry[];
}

export const LEDGER_WEIGHT: Record<LedgerKind, number> = { kill: -120, maim: -50, hurt: -15, rob: -30, spare: 10, help: 25, save: 60, gift: 12, amends: 60, mediate: 60, team: 15 };

export const REL_FACTOR: Record<RelKind, number> = { near: 1, mid: 0.5, far: 0.15, foe: -0.5 };

const KIN_KINDS: LedgerKind[] = ['kill', 'maim', 'save', 'help'];

export const REL_SECOND = 0.5;

export const GRUDGE_FADE_FROM = 30 * DAY;
export const GRUDGE_FADE_TO = 60 * DAY;
export const ATTITUDE_FEUD = -80;
export const ATTITUDE_GRUDGE = -25;
export const ATTITUDE_FRIEND = 25;
export const ATTITUDE_SWORN = 80;
export type Attitude = 'feud' | 'grudge' | 'neutral' | 'friend' | 'sworn';
export const ATTITUDE_NAME: Record<Attitude, string> = { feud: '死仇', grudge: '结怨', neutral: '陌路', friend: '有交情', sworn: '过命' };

export function record(w: LedgerWorld, who: string, npc: string, kind: LedgerKind, now: number): void {
  if (!NPC_BY_ID.has(npc) || who === npc) return;
  w.ledger.push({ at: now, who, npc, kind });
}

function fade(e: LedgerEntry, now: number): number {
  const wt = LEDGER_WEIGHT[e.kind];
  if (wt >= 0) return 1;
  const slow = e.kind === 'kill' ? 2 : 1;
  const age = now - e.at;
  if (age <= GRUDGE_FADE_FROM * slow) return 1;
  if (age >= GRUDGE_FADE_TO * slow) return 0;
  return 1 - (age - GRUDGE_FADE_FROM * slow) / ((GRUDGE_FADE_TO - GRUDGE_FADE_FROM) * slow);
}

export interface Reason {
  at: number;
  kind: LedgerKind;
  npc: string;
  rel: string;
  score: number;
}

export function reasonsOf(w: LedgerWorld, who: string, npcId: string, now: number): Reason[] {
  const def = NPC_BY_ID.get(npcId);
  if (!def) return [];
  const mine = w.ledger.filter((e) => e.who === who);
  if (!mine.length) return [];
  const out: Reason[] = [];
  const push = (e: LedgerEntry, rel: string, factor: number) => {
    const score = LEDGER_WEIGHT[e.kind] * fade(e, now) * factor;
    if (Math.abs(score) >= 0.5) out.push({ at: e.at, kind: e.kind, npc: e.npc, rel, score });
  };
  for (const e of mine) if (e.npc === npcId) push(e, '', 1);
  const first = new Set<string>([npcId]);
  const kin = kinOf(npcId);
  for (const r of kin) {
    if (!r.id || first.has(r.id)) continue;
    first.add(r.id);
    for (const e of mine) if (e.npc === r.id && KIN_KINDS.includes(e.kind)) push(e, r.rel, REL_FACTOR[r.kind]);
  }

  for (const r of kin) {
    if (!r.id || (r.kind !== 'near' && r.kind !== 'mid')) continue;
    for (const r2 of kinOf(r.id)) {
      if (!r2.id || r2.kind !== 'near' || first.has(r2.id)) continue;
      for (const e of mine) if (e.npc === r2.id && e.kind === 'kill') push(e, `${r.rel}的${r2.rel}`, REL_FACTOR[r.kind] * REL_SECOND);
    }
  }
  return out.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
}
export function attitudeScore(w: LedgerWorld, who: string, npcId: string, now: number): number {
  return reasonsOf(w, who, npcId, now).reduce((s, r) => s + r.score, 0);
}
export function attitudeOf(w: LedgerWorld, who: string, npcId: string, now: number): Attitude {
  const s = attitudeScore(w, who, npcId, now);
  return s <= ATTITUDE_FEUD ? 'feud' : s <= ATTITUDE_GRUDGE ? 'grudge' : s >= ATTITUDE_SWORN ? 'sworn' : s >= ATTITUDE_FRIEND ? 'friend' : 'neutral';
}
export type NpcRepay = 'thanks' | 'betray' | 'cold' | 'grateful';

export type NpcSceneKind =
  | 'betray' | 'cold' | 'grateful' | 'slay' | 'rob'

  | 'caught' | 'beg' | 'again' | 'yao' | 'chutou' | 'tongxing' | 'colder' | 'accept'
  | 'hunt_lost' | 'hunt_hurt' | 'sent' | 'chutou_lost' | 'tongxing_miss' | 'siege1' | 'siege2' | 'siege3' | 'siege_won' | 'siege_lost' | 'hide' | 'hid' | 'saved' | 'gone' | 'seize_won' | 'seize_lost';
export const NPC_SCENES = npcScenesRaw as Record<string, Partial<Record<NpcSceneKind, string[]>>>;

export type NpcEn = 'fu' | 'ao' | 'bao' | 'ping';
export const NPC_EN = npcEnRaw as Record<string, NpcEn>;
export const npcEnOf = (id: string): NpcEn => NPC_EN[id] ?? 'ping';

export function npcRepayOdds(def: Pick<NpcDef, 'id' | 'qing'>, mood: Attitude): { betray: number; cold: number; grateful: number } {
  const en = npcEnOf(def.id);
  const o = NPC_REPAY[en];

  const known = mood === 'sworn' ? 0 : mood === 'friend' ? NPC_REPAY_FRIEND : 1;
  return { betray: (o.betray + (en === 'fu' && def.qing < 0 ? NPC_REPAY_THIN : 0)) * known, cold: o.cold * known, grateful: o.grateful };
}

export function npcRobOdds(def: Pick<NpcDef, 'id' | 'qing'>, mood: Attitude): number {
  if (mood === 'sworn') return 0;
  const en = npcEnOf(def.id);
  return NPC_TEAM_ROB[en] + (en === 'fu' && def.qing < 0 ? NPC_REPAY_THIN : 0);
}

export function npcRepay(def: Pick<NpcDef, 'id' | 'qing'>, mood: Attitude, roll: number): NpcRepay {
  const o = npcRepayOdds(def, mood);
  if (roll < o.betray) return 'betray';
  if (roll < o.betray + o.cold) return 'cold';
  if (roll > 1 - o.grateful) return 'grateful';
  return 'thanks';
}

export function pruneLedger(w: LedgerWorld, now: number): void {
  w.ledger = w.ledger.filter((e) => fade(e, now) > 0);
}

export const NPC_SAY = npcSayRaw as Record<string, Record<Attitude, string[]>>;
export const NPC_LINES = npcLinesRaw as Record<string, Record<Attitude, string[]>>;

export function npcDecline(def: { id: string; xinxing: string }, now = 0): string {
  const pool = (NPC_LINES[def.xinxing] as Record<string, string[]> | undefined)?.decline ?? [];
  if (!pool.length) return '今日不便，改日再说。';
  let h = Math.floor(now / DAY);
  for (const c of def.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[h % pool.length] as string;
}
export function npcLine(def: { id: string; xinxing: string }, mood: Attitude, now = 0): string {
  const pool = NPC_SAY[def.id]?.[mood] ?? NPC_LINES[def.xinxing]?.[mood] ?? [];
  if (!pool.length) return '';
  let h = 0;
  for (const c of def.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[(h + Math.floor(now / DAY)) % pool.length] as string;
}
