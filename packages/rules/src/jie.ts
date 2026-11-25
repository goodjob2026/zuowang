import { GATE_VISIT_CAP, GATES, JIE3_FABAO_BONUS, JIE3_FELL_DEATH, JIE3_FROM_GATE, JIE3_GUARD_MULT, JIE3_PILL_MULT, JIE3_SAFE_DYING, JIE3_STRIKE_MAX, JIE3_WEIGHTS, JIE_DYING_MID, PILL_BONUS, SUCCESS_CAP } from './config.ts';
import { item } from './content.ts';
import type { GameEvent } from './events.ts';
import { type Band, failOdds, pillFits, preview, settleGate } from './breakthrough.ts';
import { type Player, bank, gateOf, removeItem } from './player.ts';
import { type Rng, chance } from './rng.ts';

export type JieChoice = { kind: 'endure' } | { kind: 'pill'; id: string } | { kind: 'fabao'; id: string } | { kind: 'guard' };
export type JiePlan = [JieChoice, JieChoice, JieChoice];
export interface JieStrike {
  choice: JieChoice['kind'];
  id?: string;
  base: number;
  bonus: number;
  q: number;
  spare: boolean;
}
export interface Preview3 {
  gate: number;
  kind: (typeof GATES)[number]['kind'];
  base: number;
  strikes: [JieStrike, JieStrike, JieStrike];
  total: number;
  band: Band;
  failDeath: number;
  failDying: number;

  falls: [{ death: number; dying: number }, { death: number; dying: number }, { death: number; dying: number }];
  ready: boolean;
  reason: string | null;
}
export interface JieVisit {
  helpers: { name: string }[];
  help: number;
  foe: { name: string; won: boolean } | null;
  penalty: number;
}

export function isJie3(gate: number): boolean {
  return gate >= JIE3_FROM_GATE;
}

export function canOffer(p: Player, id: string): boolean {
  let it;
  try {
    it = item(id);
  } catch {
    return false;
  }
  if (it.cat !== 'fabao') return false;

  if (p.benming === id && (p.inv[id] ?? 0) <= 1) return false;
  return (p.inv[id] ?? 0) > ((p.loadout ?? []).includes(id) ? 1 : 0);
}

function checkPlan(p: Player, gate: number, plan: JiePlan): void {
  if (!Array.isArray(plan) || plan.length !== 3) throw new Error('要给三道雷各定一个应对');
  const pills = new Set<string>();
  let fabao = 0;
  let guard = 0;
  for (const c of plan) {
    if (c.kind === 'endure') continue;
    if (c.kind === 'pill') {
      if (!pillFits(c.id, gate) || (p.inv[c.id] ?? 0) <= 0) throw new Error('没有这粒药');
      if (pills.has(c.id)) throw new Error('同一种药一场只算一粒');
      pills.add(c.id);
    } else if (c.kind === 'fabao') {
      if (!canOffer(p, c.id)) throw new Error('这件法宝祭不出去');
      if (++fabao > 1) throw new Error('一场只能祭一件法宝');
    } else if (c.kind === 'guard') {
      if (++guard > 1) throw new Error('一场只能请一回护法');
    } else throw new Error('应对不对');
  }
}

function bonusOf(c: JieChoice, visit: JieVisit | undefined): number {
  if (c.kind === 'pill') return (PILL_BONUS[item(c.id).tier] as number) * JIE3_PILL_MULT;
  if (c.kind === 'fabao') return JIE3_FABAO_BONUS[item(c.id).tier] as number;
  if (c.kind === 'guard') return (visit?.help ?? 0) * JIE3_GUARD_MULT;
  return 0;
}

export function preview3(p: Player, plan: JiePlan, now: number, visit?: JieVisit): Preview3 {
  const pv = preview(p, [], now);
  if (!isJie3(pv.gate)) throw new Error('这一关不是三道雷');
  checkPlan(p, pv.gate, plan);
  const q0 = JIE3_WEIGHTS.map((w) => Math.pow(pv.total, w));
  const guarded = plan.some((c) => c.kind === 'guard') && (visit?.helpers.length ?? 0) > 0;
  const cap = guarded ? GATE_VISIT_CAP : SUCCESS_CAP;
  let run = 1;
  const strikes = plan.map((c, i) => {
    const base = q0[i] as number;
    const rest = q0.slice(i + 1).reduce((a, b) => a * b, 1);
    const bonus = bonusOf(c, visit);

    const top = Math.min(JIE3_STRIKE_MAX, Math.max(base, cap / (run * rest)));
    let q = Math.min(top, base + bonus);
    if (i === 0 && visit?.penalty) q = Math.max(0.05, q - visit.penalty);
    const spare = c.kind !== 'endure' && c.kind !== 'guard' && q - base < 1e-9 && !(i === 0 && visit?.penalty);
    run *= q;
    return { choice: c.kind, id: 'id' in c ? c.id : undefined, base, bonus, q, spare };
  }) as [JieStrike, JieStrike, JieStrike];
  const total = Math.round(run * 1000) / 1000;
  const odds = failOdds(pv.kind, total);
  const falls = [0, 1, 2].map((i) => {
    const death = odds.failDeath * (JIE3_FELL_DEATH[i] as number);
    const dying = odds.band === 'safe' ? (JIE3_SAFE_DYING[i] as number) : (1 - death) * (odds.band === 'low' ? 1 : JIE_DYING_MID);
    return { death, dying };
  }) as Preview3['falls'];
  return { gate: pv.gate, kind: pv.kind, base: pv.total, strikes, total, ...odds, falls, ready: pv.ready, reason: pv.reason };
}

export function attempt3(p: Player, plan: JiePlan, now: number, rng: Rng, visit?: JieVisit): GameEvent[] {
  const pv = preview3(p, plan, now, visit);
  if (!pv.ready) throw new Error(pv.reason ?? 'not ready');
  bank(p, now);
  const ev: GameEvent[] = [];
  if (visit && (visit.foe || (plan.some((c) => c.kind === 'guard') && visit.helpers.length))) {
    ev.push({ kind: 'gate_visit', helpers: plan.some((c) => c.kind === 'guard') ? visit.helpers.map((h) => h.name) : [], foe: visit.foe?.name ?? null, foeWon: visit.foe?.won ?? null, from: preview3(p, plan, now).total, to: pv.total });
  }
  let passed = 0;
  for (let i = 0; i < 3; i++) {
    const s = pv.strikes[i] as JieStrike;
    const c = plan[i] as JieChoice;
    if ((c.kind === 'pill' || c.kind === 'fabao') && !s.spare && !removeItem(p, c.id)) throw new Error(`东西不够: ${c.id}`);
    const ok = chance(rng, s.q);
    ev.push({ kind: 'jie_strike', idx: i, choice: c.kind, id: s.id ?? null, q: s.q, ok, spare: s.spare, helpers: c.kind === 'guard' ? (visit?.helpers ?? []).map((h) => h.name) : undefined });
    if (!ok) break;
    passed += 1;
  }
  const fall = pv.falls[Math.min(2, passed)] as { death: number; dying: number };
  settleGate(p, { gate: pv.gate, kind: pv.kind, strikes: 3, failDeath: fall.death, failDying: fall.dying }, passed === 3, pv.total, now, rng, ev, { three: true, fell: passed === 3 ? null : passed });
  return ev;
}

export function autoPlan3(p: Player): JiePlan {
  const gate = gateOf(p.level);
  const pills = Object.keys(p.inv)
    .filter((id) => (p.inv[id] ?? 0) > 0 && pillFits(id, gate))
    .sort((a, b) => item(b).tier - item(a).tier);
  const plan: JiePlan = [{ kind: 'endure' }, { kind: 'endure' }, { kind: 'endure' }];
  [2, 1, 0].forEach((slot, k) => {
    const id = pills[k];
    if (id) plan[slot] = { kind: 'pill', id };
  });
  return plan;
}
