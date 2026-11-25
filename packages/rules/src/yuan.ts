import { SANGU_COLDS, SANGU_KEEP_MS, YUAN_GAP_MS, YUAN_KEEP_MS, YUAN_MAX, YUAN_TRIES } from './config.ts';
import type { GameEvent } from './events.ts';
import { type NpcMemKind, type Player, addItem, nextUid, rememberNpc, removeItem } from './player.ts';
import { sellPrice } from './shop.ts';
import { resetDay } from './time.ts';

export type YuanKind = 'debt' | 'blood' | 'repay' | 'siege' | 'sangu' | 'beg';
export interface Yuan {
  id: string;
  kind: YuanKind;

  npc: string;
  name: string;
  at: number;
  until: number;

  next: number;

  why?: 'betray' | 'rob';

  owed?: { lingshi: number; items: string[] };

  show?: { day: string; region: string; name: string };

  tries?: number;

  lostDay?: string;

  colds?: number;

  form?: 'yao' | 'tongxing';

  ask?: { kind: 'yao' | 'siege' | 'beg'; at: number; until: number };
}

export const yuanList = (p: Player): Yuan[] => p.yuan ?? [];
export function yuanOf(p: Player, npc: string, kinds?: YuanKind[]): Yuan | undefined {
  return yuanList(p).find((y) => y.npc === npc && (!kinds || kinds.includes(y.kind)));
}

export function hasGrudge(p: Player, npc: string): boolean {
  return !!yuanOf(p, npc, ['debt', 'blood', 'beg']) || p.yuanSeen?.[`feud:${npc}`] !== undefined;
}

export const gapMs = (roll: number): number => YUAN_GAP_MS[0] + (YUAN_GAP_MS[1] - YUAN_GAP_MS[0]) * roll;

export function openYuan(p: Player, y: Omit<Yuan, 'id'>): Yuan | null {
  const list = (p.yuan ??= []);
  if (list.length >= YUAN_MAX) {
    const soft = list.filter((x) => (x.kind === 'sangu' || x.kind === 'repay') && !x.ask).sort((a, b) => a.at - b.at)[0];
    if (!soft || y.kind === 'sangu' || y.kind === 'repay') return null;
    list.splice(list.indexOf(soft), 1);
  }
  const made: Yuan = { id: `y:${nextUid(p)}`, ...y };
  list.push(made);
  return made;
}

export function closeYuan(p: Player, y: Yuan, how: NpcMemKind | 'dead' | 'faded' | 'missed', now: number, extra: Record<string, unknown> = {}): GameEvent {
  p.yuan = yuanList(p).filter((x) => x !== y);
  if (how !== 'dead' && how !== 'faded' && how !== 'missed') rememberNpc(p, y.npc, how, now);

  if ((y.kind === 'debt' || y.kind === 'beg') && how !== 'again' && how !== 'took') p.enemies = p.enemies.filter((e) => !(e.id === y.npc && e.why === 'fu'));
  return { kind: 'yuan_end', line: y.kind, how, npc: y.npc, name: y.name, ...(y.owed ? { owed: y.owed.lingshi, owedItems: y.owed.items } : {}), ...extra };
}

export function addDebt(p: Player, npc: string, name: string, owed: { lingshi: number; items: string[] }, why: 'betray' | 'rob', now: number, roll: number): GameEvent[] {
  const old = yuanOf(p, npc, ['debt']);
  if (old) {
    old.owed = { lingshi: (old.owed?.lingshi ?? 0) + owed.lingshi, items: [...(old.owed?.items ?? []), ...owed.items] };
    old.until = now + YUAN_KEEP_MS;
    return [];
  }
  const other = yuanOf(p, npc);
  if (other && other.kind !== 'blood') p.yuan = yuanList(p).filter((x) => x !== other);
  if (other?.kind === 'blood') {
    other.owed = { lingshi: (other.owed?.lingshi ?? 0) + owed.lingshi, items: [...(other.owed?.items ?? []), ...owed.items] };
    return [];
  }
  const y = openYuan(p, { kind: 'debt', npc, name, at: now, until: now + YUAN_KEEP_MS, next: now + gapMs(roll), why, owed, tries: 0 });
  return y ? [{ kind: 'yuan', line: 'debt', beat: 'open', npc, name, why, owed: owed.lingshi, owedItems: owed.items }] : [];
}

export function addBlood(p: Player, npc: string, name: string, items: string[], now: number, roll: number): GameEvent[] {
  const old = yuanOf(p, npc);
  const owed = { lingshi: old?.owed?.lingshi ?? 0, items: [...(old?.owed?.items ?? []), ...items] };
  if (old) p.yuan = yuanList(p).filter((x) => x !== old);
  const y = openYuan(p, { kind: 'blood', npc, name, at: now, until: now + YUAN_KEEP_MS, next: now + gapMs(roll), owed, tries: 0 });
  return y ? [{ kind: 'yuan', line: 'blood', beat: 'open', npc, name, owed: owed.lingshi, owedItems: owed.items }] : [];
}

export function noteCold(p: Player, npc: string, name: string, now: number): GameEvent[] {
  const y = yuanOf(p, npc);
  if (y && y.kind !== 'sangu') return [];
  if (y) {
    y.colds = (y.colds ?? 0) + 1;
    y.until = now + SANGU_KEEP_MS;
    return [{ kind: 'yuan', line: 'sangu', beat: 'cold', npc, name, colds: y.colds }];
  }
  const made = openYuan(p, { kind: 'sangu', npc, name, at: now, until: now + SANGU_KEEP_MS, next: now + SANGU_KEEP_MS, colds: 1 });
  return made ? [{ kind: 'yuan', line: 'sangu', beat: 'cold', npc, name, colds: 1 }] : [];
}

export function sanguReady(p: Player, npc: string): boolean {
  return (yuanOf(p, npc, ['sangu'])?.colds ?? 0) >= SANGU_COLDS;
}

export function sanguAccept(p: Player, npc: string, now: number): GameEvent[] {
  const y = yuanOf(p, npc, ['sangu']);
  return y ? [closeYuan(p, y, 'accept', now)] : [];
}

export function recover(p: Player, o: Player, y: Yuan): { lingshi: number; items: string[]; cash: number } {
  const owed = y.owed ?? { lingshi: 0, items: [] };
  const items: string[] = [];
  let cash = 0;
  for (const id of owed.items) {
    if ((o.inv[id] ?? 0) > 0) {
      removeItem(o, id);
      addItem(p, id);
      items.push(id);
    } else cash += sellPrice(id);
  }
  p.lingshi += owed.lingshi + cash;
  y.owed = { lingshi: 0, items: [] };
  return { lingshi: owed.lingshi, items, cash };
}

export function settleHunt(p: Player, o: Player, won: boolean, slain: boolean, now: number, roll: number): GameEvent[] {
  const y = o.npc ? yuanOf(p, o.npc, ['debt', 'blood']) : undefined;
  if (!y) return [];
  const again = () => {
    y.show = undefined;
    y.next = now + gapMs(roll);
  };
  if (!won) {

    const day = resetDay(now);
    if (y.lostDay === day) return [];
    y.lostDay = day;
    y.tries = (y.tries ?? 0) + 1;
    if (y.tries >= YUAN_TRIES) return [closeYuan(p, y, 'lost', now)];
    again();
    return [{ kind: 'yuan', line: y.kind, beat: 'hunt_lost', npc: y.npc, name: y.name, tries: y.tries }];
  }
  if (y.kind === 'blood' && !slain) {
    again();
    return [{ kind: 'yuan', line: 'blood', beat: 'hunt_hurt', npc: y.npc, name: y.name }];
  }
  const got = recover(p, o, y);
  return [closeYuan(p, y, 'back', now, { ...got, slain })];
}
