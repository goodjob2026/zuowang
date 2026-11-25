export interface Rng {
  nextFloat(): number;
}

export class SeededRng implements Rng {
  private s: Uint32Array;
  constructor(seed: number) {
    let x = seed >>> 0;
    const s = new Uint32Array(4);
    for (let i = 0; i < 4; i++) {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      s[i] = (z ^ (z >>> 16)) >>> 0;
    }
    if (s.every((v) => v === 0)) s[0] = 1;
    this.s = s;
  }
  private nextU32(): number {
    const s = this.s;
    const s0 = s[0] as number;
    const s1 = s[1] as number;
    const s2 = s[2] as number;
    const s3 = s[3] as number;
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    let n2 = (s2 ^ s0) >>> 0;
    let n3 = (s3 ^ s1) >>> 0;
    const n1 = (s1 ^ n2) >>> 0;
    const n0 = (s0 ^ n3) >>> 0;
    n2 = (n2 ^ t) >>> 0;
    n3 = rotl(n3, 11);
    s[0] = n0;
    s[1] = n1;
    s[2] = n2;
    s[3] = n3;
    return result;
  }
  nextFloat(): number {
    return (this.nextU32() >>> 8) / 16777216;
  }
}
function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export class ScriptedRng implements Rng {
  private i = 0;
  private readonly floats: readonly number[];
  constructor(floats: readonly number[]) {
    if (floats.length === 0) throw new Error('ScriptedRng needs values');
    this.floats = floats;
  }
  nextFloat(): number {
    const v = this.floats[Math.min(this.i, this.floats.length - 1)] as number;
    this.i++;
    return v;
  }
}

export function chance(rng: Rng, p: number): boolean {
  return rng.nextFloat() < p;
}
export function randInt(rng: Rng, n: number): number {
  return Math.min(n - 1, Math.floor(rng.nextFloat() * n));
}
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick from empty array');
  return arr[randInt(rng, arr.length)] as T;
}
export function pickWeighted<T>(rng: Rng, arr: readonly T[], weight: (x: T) => number): T {
  const total = arr.reduce((s, x) => s + Math.max(0, weight(x)), 0);
  if (total <= 0) throw new Error('pickWeighted: zero total weight');
  let r = rng.nextFloat() * total;
  for (const x of arr) {
    r -= Math.max(0, weight(x));
    if (r < 0) return x;
  }
  return arr[arr.length - 1] as T;
}

export function gauss(rng: Rng): number {
  const u = Math.max(rng.nextFloat(), 1e-9);
  const v = rng.nextFloat();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const t = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = t;
  }
  return arr;
}

export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
