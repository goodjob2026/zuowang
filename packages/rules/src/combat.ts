import {
  CONSUMABLE_DECAY,
  DOU_FU,
  HU_BLOCKS,
  DYING_POWER,
  FABAO_BONUS,
  FABAO_GUARD,
  FABAO_GUARD_MAX,
  FABAO_YUN,
  FABAO_DECAY,
  FABAO_MATCH,
  GONGFA_DOU,
  HURT_POWER,
  LUCK_SIGMA,
  MO_GONGFA_MULT,
  YUN_ITEM,
  YUN_WEIGHT,
  realmPower,
} from './config.ts';
import { type Item, fabaoRole, item } from './content.ts';
import { type Player, activeGongfa, effectiveLoadout, gongfaYun, statusAt, titleBonusAt } from './player.ts';
import { type Rng, gauss, normCdf } from './rng.ts';

export interface Kit {
  fabao: Item[];
  consum: Item[];
}
export function kitOf(ids: string[]): Kit {
  const its = ids.map(item);
  return { fabao: its.filter((x) => x.cat === 'fabao'), consum: its.filter((x) => x.cat === 'dan' || x.cat === 'cao' || x.cat === 'fu') };
}

export function consumedIds(ids: string[]): string[] {
  return ids.filter((id) => {
    const c = item(id).cat;
    return c === 'dan' || c === 'cao' || c === 'fu';
  });
}
function decaySum(vals: number[], decay: number): number {
  return vals.sort((a, b) => b - a).reduce((s, v, i) => s + v * decay ** i, 0);
}

export function fabaoBonus(k: Kit, qi?: string): number {

  return decaySum(k.fabao.filter((x) => fabaoRole(x) === 'gong').map((x) => (FABAO_BONUS[x.tier] as number) * (qi && x.qi === qi ? FABAO_MATCH : 1)), FABAO_DECAY);
}

export function fabaoGuard(k: Kit, qi?: string): number {
  return Math.min(FABAO_GUARD_MAX, decaySum(k.fabao.filter((x) => fabaoRole(x) === 'shou').map((x) => (FABAO_GUARD[x.tier] as number) * (qi && x.qi === qi ? FABAO_MATCH : 1)), FABAO_DECAY));
}

export function fabaoYun(k: Kit, qi?: string): number {
  return decaySum(k.fabao.filter((x) => fabaoRole(x) === 'qi').map((x) => (FABAO_YUN[x.tier] as number) * (qi && x.qi === qi ? FABAO_MATCH : 1)), FABAO_DECAY);
}
export function consumDou(k: Kit): number {
  const vals = k.consum
    .filter((x) => x.effect === 'dou')
    .map((x) => DOU_FU[x.tier] as number);
  return decaySum(vals, CONSUMABLE_DECAY);
}
export function gongfaDou(p: Player): number {
  const g = activeGongfa(p);
  return g.focus === 'dou' ? (GONGFA_DOU[g.tier] as number) * (g.mo ? MO_GONGFA_MULT : 1) : 0;
}
export interface PowerBreakdown {
  base: number;
  fabao: number;
  gongfa: number;
  consum: number;
  statusMult: number;
  power: number;
  yun: number;
  hu: number;

  guard: number;
  dun: number;

  duns: number[];
}
export function powerOf(p: Player, at: number, ids: string[] = effectiveLoadout(p)): PowerBreakdown {
  const k = kitOf(ids);
  const base = realmPower(p.level);
  const fab = fabaoBonus(k, activeGongfa(p).qi);
  const gf = gongfaDou(p);
  const cd = consumDou(k);
  const s = statusAt(p, at);
  const statusMult = s === 'hurt' ? HURT_POWER : s === 'dying' ? DYING_POWER : 1;
  const yunItems = decaySum(k.consum.filter((x) => x.effect === 'yun').map((x) => YUN_ITEM[x.tier] as number), CONSUMABLE_DECAY);
  return {
    base,
    fabao: fab,
    gongfa: gf,
    consum: cd,
    statusMult,
    power: base * (1 + fab + gf + cd + titleBonusAt(p, 'e', at)) * statusMult,
    yun: gongfaYun(p) + yunItems + fabaoYun(k, activeGongfa(p).qi),
    guard: fabaoGuard(k, activeGongfa(p).qi),
    hu: k.consum.filter((x) => x.effect === 'hu').reduce((s, x) => s + (HU_BLOCKS[x.tier] as number), 0),
    dun: k.consum.filter((x) => x.effect === 'dun').length,
    duns: k.consum.filter((x) => x.effect === 'dun').map((x) => x.tier).sort((a, b) => b - a),
  };
}
export function battleScore(power: number, yun: number, rng: Rng): number {
  return Math.log(power) + gauss(rng) * LUCK_SIGMA + yun * YUN_WEIGHT;
}

export function duelWinProb(a: { power: number; yun: number }, b: { power: number; yun: number }, bonus = 0): number {
  const x = (Math.log(a.power) - Math.log(b.power) + (a.yun - b.yun) * YUN_WEIGHT) / (LUCK_SIGMA * Math.SQRT2);
  return Math.max(0.03, Math.min(0.97, normCdf(x) + bonus));
}
