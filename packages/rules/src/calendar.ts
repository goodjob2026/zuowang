import { CAL_CAMP_WINDOW, CAL_EPOCH, CAL_LAYER_SHIFT } from './config.ts';
import { type Camp3, MI_REALMS, type MiRealm } from './content.ts';
import { SeededRng, hashSeed } from './rng.ts';
import { addDays, atJst, resetDay } from './time.ts';

type Cat = Camp3 | 'none';
const CATS: Cat[] = ['zheng', 'mo', 'san', 'none'];
const catOf = (r: MiRealm): Cat => r.camp ?? 'none';

export function calDay(ms: number): string {
  return resetDay(ms);
}
export function dayIndex(day: string): number {
  return Math.round((atJst(day, 12) - atJst(CAL_EPOCH, 12)) / 86_400_000);
}

export function miLayerOf(realm: number): 0 | 1 | 2 {
  return realm <= 2 ? 0 : realm <= 5 ? 1 : 2;
}
export const LAYER_NAME = ['外围', '内层', '核心'] as const;

interface Seq {
  picks: number[];
  gap: Record<Camp3, number>;
  lastUsed: number[];
  rng: SeededRng;
}
const cache = new Map<string, Seq>();

function extend(seq: Seq, upto: number): void {
  const byCat = new Map<Cat, number[]>(CATS.map((c) => [c, MI_REALMS.map((r, i) => (catOf(r) === c ? i : -1)).filter((i) => i >= 0)]));
  while (seq.picks.length <= upto) {
    const day = seq.picks.length;

    const camps: Camp3[] = ['zheng', 'mo', 'san'];
    const deadline = (c: Camp3, g: Record<Camp3, number>) => CAL_CAMP_WINDOW - 1 - g[c];
    const feasible = (g: Record<Camp3, number>) =>
      camps
        .map((c) => deadline(c, g))
        .sort((a, b) => a - b)
        .every((d, i) => d >= i);
    const after = (pick: Cat): Record<Camp3, number> => {
      const g = { ...seq.gap };
      for (const c of camps) g[c] = c === pick ? 0 : g[c] + 1;
      return g;
    };
    const options = CATS.filter((c) => (byCat.get(c)?.length ?? 0) > 0 && feasible(after(c)));

    const pool = options.length ? options : [camps.sort((a, b) => deadline(a, seq.gap) - deadline(b, seq.gap))[0] as Cat];

    const w = pool.map((c) => (c === 'none' ? 1 : 1 + seq.gap[c]));
    let r = seq.rng.nextFloat() * w.reduce((s, x) => s + x, 0);
    let cat = pool[pool.length - 1] as Cat;
    for (let i = 0; i < pool.length; i++) {
      r -= w[i] as number;
      if (r < 0) {
        cat = pool[i] as Cat;
        break;
      }
    }

    const cand = byCat.get(cat) as number[];
    const oldest = Math.min(...cand.map((i) => seq.lastUsed[i] as number));
    const ties = cand.filter((i) => seq.lastUsed[i] === oldest);
    const pick = ties[Math.floor(seq.rng.nextFloat() * ties.length)] as number;
    seq.picks.push(pick);
    seq.lastUsed[pick] = day;
    seq.gap = after(cat);
  }
}

function seqFor(seed: number, realm: number): Seq {
  const key = `${seed}:${realm}:${MI_REALMS.length}`;
  let s = cache.get(key);
  if (!s) {
    const rng = new SeededRng(hashSeed(`${seed}:cal:layer${realm}`));

    const order = (['zheng', 'mo', 'san'] as Camp3[]).sort(() => rng.nextFloat() - 0.5);
    const gap = { zheng: 0, mo: 0, san: 0 } as Record<Camp3, number>;
    order.forEach((c, i) => (gap[c] = i));
    s = { picks: [], gap, lastUsed: MI_REALMS.map(() => -1e9), rng };
    cache.set(key, s);
  }
  return s;
}

export function realmOn(seed: number, realm: number, day: string): MiRealm {
  const layer = miLayerOf(realm);
  const i = Math.max(0, dayIndex(day)) + (realm - layer * 3) * CAL_LAYER_SHIFT;
  const s = seqFor(seed, layer);
  extend(s, i);
  return MI_REALMS[s.picks[i] as number] as MiRealm;
}

export function realmNow(seed: number, realm: number, now: number): MiRealm {
  return realmOn(seed, realm, calDay(now));
}

export function upcoming(seed: number, realm: number, now: number, n = 3): { day: string; realm: MiRealm }[] {
  const d0 = calDay(now);
  return Array.from({ length: n }, (_, k) => {
    const day = addDays(d0, k);
    return { day, realm: realmOn(seed, realm, day) };
  });
}

export function instOf(day: string, realm: number): string {
  return `${day}|${realm}`;
}
