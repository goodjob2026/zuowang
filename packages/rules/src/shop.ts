import { BASE_LOOT_TIER, SHOP_BAND_PRICE_BASE, SHOP_GATE_PILL_MULT, SHOP_PRICE, sellPriceByTier } from './config.ts';
import { FABAO, GONGFA, type Item, STARTER_GONGFA, YAO, item } from './content.ts';
import type { GameEvent } from './events.ts';
import { type Player, addItem, realmOf, removeItem } from './player.ts';

export interface Sku {
  id: string;
  price: number;
}
function priceOf(x: Item): number | null {
  if (x.tier > 1) return null;
  const t = x.tier;
  if (x.cat === 'cao') return SHOP_PRICE.cao[t] as number;
  if (x.cat === 'fu') return SHOP_PRICE.fu[t] as number;
  if (x.cat === 'dan') {
    if (x.effect === 'tupo') return SHOP_PRICE.dan_tupo[t] as number;
    if (x.effect === 'zuo') return SHOP_PRICE.dan_zuo[t] as number;
    return null;
  }
  if (x.cat === 'fabao') return SHOP_PRICE.fabao[t] as number;
  if (x.cat === 'gongfa') return SHOP_PRICE.gongfa[t] as number;
  return null;
}

export const CATALOG: Sku[] = (() => {
  const out: Sku[] = [];
  for (const x of YAO) {
    const p = priceOf(x);
    if (p !== null) out.push({ id: x.id, price: p });
  }
  const seenKind = new Set<string>();
  for (const x of [...FABAO].sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id))) {
    if (x.tier > 1 || seenKind.has(`${x.kind}:${x.tier}`)) continue;
    seenKind.add(`${x.kind}:${x.tier}`);
    if (seenKind.size > 16) break;
    out.push({ id: x.id, price: priceOf(x) as number });
  }

  for (const tier of [0, 1]) {
    for (const focus of ['zuo', 'dou', 'jie', 'shang', 'yun']) {
      const x = [...GONGFA].filter((g) => g.tier === tier && g.focus === focus && !g.mo && g.id !== STARTER_GONGFA.id).sort((a, b) => a.id.localeCompare(b.id))[0];
      if (x) out.push({ id: x.id, price: priceOf(x) as number });
    }
  }
  out.push({ id: 'bracelet_1', price: SHOP_PRICE.bracelet_1 });
  return out;
})();
const CAT_PRICE = new Map(CATALOG.map((s) => [s.id, s.price]));

const BAND_KINDS: [string, string][] = [
  ['cao', 'heal'], ['dan', 'zuo'],
  ['fu', 'dou'], ['fu', 'yun'],
];
const BAND_CACHE = new Map<number, Sku[]>();
export function bandSkus(realm: number): Sku[] {
  const tier = BASE_LOOT_TIER[realm] as number;
  if (tier <= 1) return [];
  const hit = BAND_CACHE.get(tier);
  if (hit) return hit;
  const out: Sku[] = [];
  for (const [cat, eff] of BAND_KINDS) {
    const x = [...YAO].filter((y) => y.cat === cat && y.effect === eff && y.tier === tier).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (x) out.push({ id: x.id, price: Math.round(SHOP_BAND_PRICE_BASE * 2.2 ** tier) });
  }
  BAND_CACHE.set(tier, out);
  return out;
}

export function gateSkus(realm: number): Sku[] {
  if (realm < 3) return [];
  const tier = BASE_LOOT_TIER[realm] as number;
  const of = (t: number) => [...YAO].filter((y) => y.cat === 'dan' && y.effect === 'dujie' && y.tier === t).sort((a, b) => a.id.localeCompare(b.id));

  const picks = [of(tier)[0], of(tier - 1)[0] ?? of(tier + 1)[0]].filter((x): x is Item => !!x);
  return picks.map((x) => ({ id: x.id, price: Math.round(SHOP_BAND_PRICE_BASE * 2.2 ** x.tier * SHOP_GATE_PILL_MULT) }));
}
export function catalogFor(p: Player): Sku[] {
  return [...CATALOG, ...bandSkus(realmOf(p.level)), ...gateSkus(realmOf(p.level))];
}

export function sellPrice(id: string): number {
  const p = CAT_PRICE.get(id);
  if (p !== undefined) return Math.floor(p / 2);
  return sellPriceByTier(item(id).tier);
}
export function buy(p: Player, id: string, qty: number): GameEvent[] {
  const price = CAT_PRICE.get(id) ?? [...bandSkus(realmOf(p.level)), ...gateSkus(realmOf(p.level))].find((s) => s.id === id)?.price;
  if (price === undefined) throw new Error('not for sale');
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error('bad qty');
  if (item(id).cat === 'gongfa' && ((p.inv[id] ?? 0) > 0 || qty > 1)) throw new Error('这门功法你已有了，一门学一回就够');
  const cost = price * qty;
  if (p.lingshi < cost) throw new Error('noLingshi');
  p.lingshi -= cost;
  addItem(p, id, qty);
  return [{ kind: 'shop_buy', id, qty, cost }];
}

export function braceletInUse(p: Player): string | null {
  for (let t = 5; t >= 0; t--) if ((p.inv[`bracelet_${t}`] ?? 0) > 0) return `bracelet_${t}`;
  return null;
}

const REALM_SHORT = ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
export function whereOf(id: string): string {
  const it = item(id);
  const parts: string[] = [];
  if (CAT_PRICE.has(id)) parts.push('坊市常年有卖');
  else {
    const r = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((x) => [...bandSkus(x), ...gateSkus(x)].some((s) => s.id === id));
    if (r !== undefined) parts.push(`${REALM_SHORT[r]}以后坊市有卖`);
  }
  if (it.cat === 'gongfa' || it.cat === 'fabao') parts.push('秘境夺宝', '游历偶得', '奇遇');
  else if (it.cat === 'special') parts.push('秘境夺宝，极少见');
  else if (it.cat === 'bracelet') parts.push(id === 'bracelet_0' ? '入山时自带' : '秘境夺宝');
  else parts.push('秘境夺宝', '奇遇');
  return parts.join('、');
}

export const BUYBACK_MS = 24 * 3600_000;
export function buyback(p: Player, id: string, qty: number, cost: number, ref: number): GameEvent[] {
  if (!Number.isInteger(qty) || qty < 1 || !Number.isFinite(cost) || cost < 0) throw new Error('bad buyback');
  if (p.lingshi < cost) throw new Error('noLingshi');
  p.lingshi -= cost;
  addItem(p, id, qty);
  return [{ kind: 'shop_buyback', id, qty, cost, ref }];
}
export function sell(p: Player, id: string, qty: number): GameEvent[] {
  if (!Number.isInteger(qty) || qty < 1) throw new Error('bad qty');
  if (id === p.gongfa && (p.inv[id] ?? 0) <= qty) throw new Error('正在修炼的功法不能卖');
  if (id === braceletInUse(p) && (p.inv[id] ?? 0) <= qty) throw new Error('正在用的手镯不能卖');
  if (id === p.benming && (p.inv[id] ?? 0) <= qty) throw new Error('这是你的本命法宝，先解了本命再卖');
  if (!removeItem(p, id, qty)) throw new Error('not enough');
  const gain = sellPrice(id) * qty;
  p.lingshi += gain;
  return [{ kind: 'shop_sell', id, qty, gain }];
}
