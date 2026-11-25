import { BASE_LOOT_TIER, LINGSHI_REALM_SCALE, RIKE_BONUS_HOURS, RIKE_COUNT, RIKE_LINGSHI, RIKE_POOL, RIKE_SHOP_MIN, RIKE_SIT_MS } from './config.ts';
import { type Item, item } from './content.ts';
import type { GameEvent } from './events.ts';
import { type Player, type RikeId, type RikeTask, addItem, grantXiuweiHours, realmOf, statusAt } from './player.ts';
import { rollItem } from './mijing.ts';
import { SeededRng, hashSeed, pickWeighted } from './rng.ts';

export const RIKE_NAME: Record<RikeId, string> = {
  collect: '收一次灵气',
  sit6: '打坐满三个时辰',
  mijing: '进秘境走一趟（到点出来才算）',
  qiyu: '了结一桩奇遇',
  shop: '去坊市买一件东西',
  dan: '吃一粒打坐用的丹药或草药',
  youli: '出门游历一趟（回来才算）',
};

const isZuo = (x: Item) => (x.cat === 'dan' || x.cat === 'cao') && x.effect === 'zuo';
function ownsZuo(p: Player): boolean {
  return Object.entries(p.inv).some(([id, n]) => n > 0 && isZuo(item(id)));
}

export function rikeLingshi(p: Player): number {
  return Math.round(RIKE_LINGSHI * (1 + LINGSHI_REALM_SCALE * realmOf(p.level)));
}

export function rollRike(p: Player, day: string, now: number): void {
  const rng = new SeededRng(hashSeed(`${p.id}:rike:${day}`));
  const dying = statusAt(p, now) === 'dying';
  const can = (id: RikeId): boolean => {
    if (id === 'qiyu') return p.qiyu.length > 0;
    if (id === 'dan') return ownsZuo(p);
    if (id === 'shop') return p.lingshi >= RIKE_SHOP_MIN;
    if (id === 'mijing' || id === 'youli' || id === 'sit6' || id === 'collect') return !dying;
    return true;
  };
  let pool = RIKE_POOL.filter((x) => can(x.id));
  const tasks: RikeTask[] = [];
  while (tasks.length < RIKE_COUNT && pool.length) {
    const x = pickWeighted(rng, pool, (y) => y.w);
    tasks.push({ id: x.id, done: false, prog: 0 });

    const twin = x.id === 'sit6' ? 'collect' : x.id === 'collect' ? 'sit6' : null;
    pool = pool.filter((y) => y.id !== x.id && y.id !== twin);
  }
  p.rike = { day, tasks, bonus: false };
}

function bonusItem(p: Player, rng: SeededRng): string {
  const tier = BASE_LOOT_TIER[realmOf(p.level)] as number;
  return rollItem(p.level, tier, rng, rng.nextFloat() < 0.7 ? 'cao' : 'fu');
}

export function rikeTrack(p: Player, ev: GameEvent[], now: number): GameEvent[] {
  const out: GameEvent[] = [];
  if (!p.rike?.tasks.length) return out;
  for (const t of p.rike.tasks) {
    if (t.done) continue;
    let hit = false;
    for (const e of ev) {
      if (t.id === 'collect') hit ||= e.kind === 'collect' && (e.gain as number) > 0;
      else if (t.id === 'sit6') {
        if (e.kind === 'collect') t.prog += e.sitMs as number;
        hit ||= t.prog >= RIKE_SIT_MS;
      } else if (t.id === 'mijing') hit ||= e.kind === 'mijing_result' && !e.left;
      else if (t.id === 'qiyu') hit ||= e.kind === 'qiyu_result';
      else if (t.id === 'shop') hit ||= e.kind === 'shop_buy';
      else if (t.id === 'dan') hit ||= e.kind === 'buff';
      else if (t.id === 'youli') hit ||= e.kind === 'youli_back';
    }
    if (!hit) continue;
    t.done = true;
    const ls = rikeLingshi(p);
    p.lingshi += ls;
    out.push({ kind: 'rike_done', id: t.id, lingshi: ls });
  }
  if (!p.rike.bonus && p.rike.tasks.every((t) => t.done)) {
    p.rike.bonus = true;
    const sub: GameEvent[] = [];
    const xiuwei = grantXiuweiHours(p, RIKE_BONUS_HOURS, now, sub);
    const got = bonusItem(p, new SeededRng(hashSeed(`${p.id}:rike:${p.rike.day}:bonus`)));
    addItem(p, got, 1);
    out.push({ kind: 'rike_all', xiuwei, got }, ...sub);
  }
  return out;
}
