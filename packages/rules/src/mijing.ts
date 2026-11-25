import { BASE_LOOT_TIER, LOOT_CATEGORY, LOOT_FU, LOOT_PILL, ORANGE_KEEP, PATH_MATCH_CHANCE, SPECIAL_LOOT, THEME_CAT_MULT } from './config.ts';
import { type Item, itemsOf } from './content.ts';
import { realmOf } from './player.ts';
import { type Rng, chance, pick, pickWeighted } from './rng.ts';

export function lootTier(level: number, grade: number, rankBonus: number, rng: Rng): number {
  let t = BASE_LOOT_TIER[realmOf(level)] as number;
  if (grade === 2) t += 1;
  else if (grade === 1 && chance(rng, 0.5)) t += 1;
  t += rankBonus;
  const j = rng.nextFloat();
  if (j < 0.2) t -= 1;
  else if (j >= 0.85) t += 1;
  t = Math.max(0, Math.min(5, t));
  if (t === 5 && !chance(rng, ORANGE_KEEP)) t = 4;
  return t;
}
function nearest(cat: Parameters<typeof itemsOf>[0], tier: number, f?: (x: Item) => boolean): Item[] {
  for (let d = 0; d <= 5; d++) {
    for (const t of [tier - d, tier + d]) {
      if (t < 0 || t > 5) continue;
      const a = itemsOf(cat, t, f);
      if (a.length) return a;
    }
  }
  return [];
}

export function rollItem(level: number, tier: number, rng: Rng, forceCat?: 'cao' | 'fu' | 'dan' | 'fabao' | 'gongfa', qi?: string, boost?: string): string {
  const want = boost === 'dan' ? 'pill' : boost;
  const cat = forceCat ?? pickWeighted(rng, LOOT_CATEGORY, (c) => c.w * (c.cat === want ? THEME_CAT_MULT : 1)).cat;
  if (cat === 'special') {
    const s = pickWeighted(rng, SPECIAL_LOOT, (x) => x.w).id;
    if (s === 'bracelet') return `bracelet_${Math.max(1, Math.min(5, tier))}`;
    return s;
  }
  if (cat === 'pill' || cat === 'dan') {

    const e = pickWeighted(rng, LOOT_PILL, (x) => x.w).e;
    const eff = e === 'gate' ? (level < 12 ? 'tupo' : 'dujie') : e;
    const pool = nearest('dan', tier, (x) => x.effect === eff);
    return pick(rng, pool.length ? pool : nearest('dan', tier)).id;
  }
  if (cat === 'fu') {

    const eff = pickWeighted(rng, LOOT_FU, (x) => x.w).e;
    const pool = nearest('fu', tier, (x) => x.effect === eff);
    return pick(rng, pool.length ? pool : nearest('fu', tier)).id;
  }
  if (qi && (cat === 'gongfa' || cat === 'fabao') && rng.nextFloat() < PATH_MATCH_CHANCE) {
    const same = nearest(cat, tier, (x) => x.qi === qi);
    if (same.length) return pick(rng, same).id;
  }
  const pool = nearest(cat as 'cao' | 'fu' | 'fabao' | 'gongfa', tier);
  return pick(rng, pool).id;
}
