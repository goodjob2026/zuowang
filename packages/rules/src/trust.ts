import type { Player } from './player.ts';

export const TRUST_MAX = 100;

export const TRUST_NEED = 60;

export const TRUST_DROP = 20;

export const TRUST_GAIN = { gift: 8, zhidian: 10, spare: 15, guard: 6 } as const;

export const TRUST_LOSS = { hurt: 10, rob: 15, maim: 40 } as const;

export function trustOf(p: Player, id: string): number {
  return p.trust?.[id] ?? 0;
}

export function addTrust(p: Player, id: string, delta: number): void {
  if (p.npc || p.id === id) return;
  const t = (p.trust ??= {});
  const v = Math.max(0, Math.min(TRUST_MAX, (t[id] ?? 0) + delta));
  if (v === 0) delete t[id];
  else t[id] = v;
}

export function trustEnough(a: Player, b: Player): boolean {
  return trustOf(a, b.id) >= TRUST_NEED && trustOf(b, a.id) >= TRUST_NEED;
}

export function checkBond(a: Player, b: Player): boolean {
  if (!(a.friends ?? []).includes(b.id)) return false;
  if (trustOf(a, b.id) >= TRUST_DROP && trustOf(b, a.id) >= TRUST_DROP) return false;
  a.friends = (a.friends ?? []).filter((x) => x !== b.id);
  b.friends = (b.friends ?? []).filter((x) => x !== a.id);
  return true;
}

export function slainTrust(victim: Player, killer: Player): void {
  if (victim.trust) delete victim.trust[killer.id];
  checkBond(victim, killer);
}
