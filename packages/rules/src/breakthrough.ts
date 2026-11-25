import {
  GATE_VISIT_CAP,
  JIE3_FROM_GATE,
  GATES,
  GATE_FAIL_PITY,
  GATE_FAIL_PITY_MAX,
  GATE_WAIT_BONUS_MAX,
  GATE_WAIT_BONUS_PER_DAY,
  DAY,
  GONGFA_JIE_BONUS,
  JIE_CLASS_MULT,
  JIE_DEATH,
  JIE_DYING_MID,
  JIE_FAIL_LOSS,
  MAX_PILLS_PER_ATTEMPT,
  MO_JIE_PENALTY,
  PILL_BONUS,
  GATE_SURE_BELOW,
  SUCCESS_CAP,
  TUPO_FAIL_LOSS,
  need,
} from './config.ts';
import { item } from './content.ts';
import type { GameEvent } from './events.ts';
import { die } from './fate.ts';
import { type Player, activeGongfa, bank, campOf, catchupGate, gateOf, removeItem, setStatus, statusAt } from './player.ts';
import { type Rng, chance } from './rng.ts';

export type Band = 'safe' | 'mid' | 'low';
export interface Preview {
  gate: number;
  kind: (typeof GATES)[number]['kind'];
  strikes: number;
  base: number;
  pills: { id: string; bonus: number; spare?: boolean }[];
  gongfa: number;
  mo: number;
  pity: number;
  wait: number;
  lag: number;
  total: number;

  sure: boolean;
  band: Band;

  failDeath: number;
  failDying: number;
  ready: boolean;
  reason: string | null;
}

export function pillFits(id: string, gate: number): boolean {
  const it = item(id);
  if (it.cat !== 'dan') return false;
  return gate < 3 ? it.effect === 'tupo' : it.effect === 'dujie';
}

export function preview(p: Player, pills: string[], now: number): Preview {
  const gate = gateOf(p.level);
  if (gate < 0) throw new Error('不在关口');
  const g = GATES[gate] as (typeof GATES)[number];
  const list = pills.slice(0, MAX_PILLS_PER_ATTEMPT).filter((id) => pillFits(id, gate));
  const gf = activeGongfa(p);
  const gongfa = gf.focus === 'jie' ? (GONGFA_JIE_BONUS[gf.tier] as number) : 0;
  const mo = g.kind !== 'tupo' && campOf(p) === 'mo' ? MO_JIE_PENALTY : 0;
  const pity = Math.min(GATE_FAIL_PITY_MAX, (p.gateFails ?? 0) * GATE_FAIL_PITY);
  const waitedDays = p.gateFullSince ? Math.floor((now - p.gateFullSince) / DAY) : 0;
  const wait = Math.min(GATE_WAIT_BONUS_MAX, waitedDays * GATE_WAIT_BONUS_PER_DAY);
  const lag = catchupGate(p);

  const sure = gate < GATE_SURE_BELOW;
  let acc = sure ? 1 : g.base + gongfa + pity + wait + lag - mo;
  const pillB = list.map((id) => {
    const bonus = PILL_BONUS[item(id).tier] as number;
    const spare = acc >= SUCCESS_CAP - 1e-9;
    if (!spare) acc += bonus;
    return { id, bonus, spare };
  });
  const raw = acc;
  const total = sure ? 1 : Math.max(0.05, Math.min(SUCCESS_CAP, Math.round(raw * 1000) / 1000));
  const { band, failDeath, failDying } = failOdds(g.kind, total);
  let reason: string | null = null;
  if (p.xiuwei < need(p.level)) reason = 'notEnoughXiuwei';
  else if (statusAt(p, now) === 'dying') reason = 'dyingCannot';
  else if (p.stay) reason = 'inMijing';
  else if (p.youli && now < p.youli.end) reason = 'away';
  return { gate, kind: g.kind, strikes: g.strikes, base: g.base, pills: pillB, gongfa, mo, pity, wait, lag, total, sure, band, failDeath, failDying, ready: reason === null, reason };
}

export function attempt(p: Player, pills: string[], now: number, rng: Rng, visit?: { helpers: { name: string }[]; help: number; foe: { name: string; won: boolean } | null; penalty: number }): GameEvent[] {
  const pv = preview(p, pills, now);
  if (!pv.ready) throw new Error(pv.reason ?? 'not ready');
  if (pv.gate >= JIE3_FROM_GATE) throw new Error('这一劫是三道雷，要先定三道的应对');
  for (const x of pv.pills) {
    if (x.spare) continue;
    if (!removeItem(p, x.id)) throw new Error(`药不够: ${x.id}`);
  }
  bank(p, now);
  const ev: GameEvent[] = [];
  const n = need(p.level);

  let total = pv.total;
  if (visit && pv.kind !== 'tupo' && (visit.helpers.length || visit.foe)) {
    total = Math.max(0.05, Math.min(GATE_VISIT_CAP, pv.total + visit.help - visit.penalty));
    ev.push({ kind: 'gate_visit', helpers: visit.helpers.map((h) => h.name), foe: visit.foe?.name ?? null, foeWon: visit.foe?.won ?? null, from: pv.total, to: total });
  }
  settleGate(p, pv, chance(rng, total), total, now, rng, ev);
  return ev;
}

export function failOdds(kind: Preview['kind'], total: number): { band: Band; failDeath: number; failDying: number } {
  const band: Band = total >= SUCCESS_CAP - 1e-9 ? 'safe' : total >= 0.5 ? 'mid' : 'low';
  let failDeath = 0;
  let failDying = 0;
  if (kind !== 'tupo') {
    const cm = JIE_CLASS_MULT[kind];
    if (band === 'mid') {
      failDeath = Math.min(0.9, JIE_DEATH.mid * cm);
      failDying = (1 - failDeath) * JIE_DYING_MID;
    } else if (band === 'low') {
      failDeath = Math.min(0.9, JIE_DEATH.low * cm);
      failDying = 1 - failDeath;
    }
  }
  return { band, failDeath, failDying };
}

export function settleGate(p: Player, pv: Pick<Preview, 'gate' | 'kind' | 'strikes' | 'failDeath' | 'failDying'>, ok: boolean, total: number, now: number, rng: Rng, ev: GameEvent[], extra: Record<string, unknown> = {}): void {
  const n = need(p.level);
  if (ok) {
    p.xiuwei = 0;
    p.gateFails = 0;
    p.gateFullSince = 0;
    if (pv.gate === 8) {
      p.feisheng += 1;
      ev.push({ kind: 'breakthrough', gate: pv.gate, rate: total, ok: true, strikes: pv.strikes, outcome: 'feisheng', ...extra });
      ev.push({ kind: 'feisheng', count: p.feisheng });
    } else {
      p.level += 1;
      if (p.level > p.maxLevel) p.maxLevel = p.level;
      ev.push({ kind: 'breakthrough', gate: pv.gate, rate: total, ok: true, strikes: pv.strikes, outcome: 'ok', level: p.level, ...extra });
    }
    return;
  }
  p.gateFails = (p.gateFails ?? 0) + 1;
  const lossFrac = pv.kind === 'tupo' ? TUPO_FAIL_LOSS : JIE_FAIL_LOSS;
  const loss = Math.floor(n * lossFrac);
  p.xiuwei = Math.max(0, p.xiuwei - loss);
  p.gateFullSince = 0;
  let outcome: 'hurt' | 'dying' | 'death' | 'revive' = 'hurt';
  const r = rng.nextFloat();
  if (r < pv.failDeath) outcome = 'death';
  else if (r < pv.failDeath + pv.failDying) outcome = 'dying';
  const b: GameEvent = { kind: 'breakthrough', gate: pv.gate, rate: total, ok: false, strikes: pv.strikes, outcome, loss, ...extra };
  ev.push(b);
  if (outcome === 'death') {
    const reborn = die(p, 'jie', now, ev);
    if (!reborn) b.outcome = 'revive';
  } else {
    setStatus(p, outcome, now, ev);
  }
}
