import { BASE_LOOT_TIER, HOUR, LINGSHI_REALM_SCALE, REALM_BAND, YOULI_HOURS, YOULI_ITEMS, YOULI_LINGSHI_PER_HOUR, YOULI_MEET, YOULI_MEET_GIFT, YOULI_RARE_PER_HOUR, YOULI_RECENT, YOULI_REPAY_GAP_MS, YOULI_SEEN_KEEP, YOULI_XIUWEI_FACTOR } from './config.ts';
import { calDay, realmOn } from './calendar.ts';
import { type LedgerEntry, NPC_BY_ID, attitudeOf, npcEnOf } from './ledger.ts';
import { addDays } from './time.ts';
import { yuanOf } from './yuan.ts';
import { YOULI } from './content.ts';
import type { GameEvent } from './events.ts';
import { rollItem } from './mijing.ts';
import { type Player, addItem, bank, grantXiuweiHours, realmOf, statusAt } from './player.ts';
import { SeededRng, hashSeed, pick } from './rng.ts';

export function youliBlock(p: Player, hours: number, now: number): string | null {
  if (!(YOULI_HOURS as readonly number[]).includes(hours)) return '没有这个走法';
  if (p.needRebirth) return '尚未转世';
  if (p.youli) return '已在外游历';
  if (p.stay) return '人在秘境里';
  if (statusAt(p, now) === 'dying') return '重伤濒死，走不动';
  const end = now + hours * HOUR;
  if (p.windows.some((w) => w.end > now && w.start < end)) return '秘境开始前赶不回来';
  return null;
}
export function youliOptions(p: Player, now: number): { hours: number; ok: boolean; reason: string | null }[] {
  return YOULI_HOURS.map((hours) => {
    const reason = youliBlock(p, hours, now);
    return { hours, ok: reason === null, reason };
  });
}

export function startYouli(p: Player, hours: number, now: number): GameEvent[] {
  const why = youliBlock(p, hours, now);
  if (why) throw new Error(why);
  bank(p, now);
  p.youli = { start: now, end: now + hours * HOUR, hours };
  p.youliBack = null;
  return [{ kind: 'youli_start', hours, end: p.youli.end }];
}

export function recallYouli(p: Player, now: number): GameEvent[] {
  if (!p.youli || now >= p.youli.end) throw new Error('没在外游历');
  bank(p, now);
  const hours = p.youli.hours;
  p.youli = null;
  return [{ kind: 'youli_recall', hours }];
}

export function ackYouli(p: Player): GameEvent[] {
  p.youliBack = null;
  return [];
}

export function settleYouli(p: Player, now: number, ev: GameEvent[], w?: MeetWorld): void {
  const y = p.youli;
  if (!y || now < y.end) return;
  bank(p, now);
  const rng = new SeededRng(hashSeed(`${p.id}:youli:${y.start}`));
  const realm = realmOf(p.level);
  const band = REALM_BAND[realm] as number;
  const all = YOULI.filter((s) => s.band === band);

  const fresh = all.filter((s) => !p.youliRecent.includes(s.id));
  const notLately = all.filter((s) => !p.youliRecent.slice(0, YOULI_RECENT).includes(s.id));
  const story = pick(rng, fresh.length ? fresh : notLately.length ? notLately : all);
  const lingshi = Math.round(YOULI_LINGSHI_PER_HOUR * y.hours * (1 + LINGSHI_REALM_SCALE * realm) * (0.8 + 0.4 * rng.nextFloat()));
  const expect = YOULI_ITEMS[y.hours] ?? 1;
  const n = Math.floor(expect) + (rng.nextFloat() < expect % 1 ? 1 : 0);
  const tier = BASE_LOOT_TIER[realm] as number;
  const items: string[] = [];

  const gives = story.gives;
  for (let i = 0; i < n; i++) {
    const t = rng.nextFloat() < 0.7 ? 'cao' : 'fu';
    items.push(rollItem(p.level, tier, rng, i === 0 && gives ? gives : t));
  }
  if (rng.nextFloat() < YOULI_RARE_PER_HOUR * y.hours) items.push(rollItem(p.level, Math.max(0, tier - 1), rng, rng.nextFloat() < 0.5 ? 'gongfa' : 'fabao'));
  p.lingshi += lingshi;
  for (const id of items) addItem(p, id, 1);
  const sub: GameEvent[] = [];
  const xiuwei = grantXiuweiHours(p, y.hours * YOULI_XIUWEI_FACTOR, y.end, sub);

  const meet = w ? meetOnRoad(w, p, y.start, y.end) : null;
  const gift = meet?.effect === 'gift' ? (meet.lingshi ?? 0) : 0;
  p.lingshi += gift;
  if (!meet) p.youliRecent = [story.id, ...p.youliRecent.filter((id) => id !== story.id)].slice(0, YOULI_SEEN_KEEP);

  const keep = !meet && story.keep ? { id: story.id, fresh: !(p.keeps ?? []).includes(story.id) } : undefined;
  if (keep?.fresh) p.keeps = [story.id, ...(p.keeps ?? [])];
  p.youliBack = { story: story.id, hours: y.hours, at: y.end, lingshi: lingshi + gift, items, xiuwei, ...(keep ? { keep } : {}), ...(meet ? { meet } : {}) };
  p.youli = null;
  ev.push({ kind: 'youli_back', story: story.id, title: story.title, hours: y.hours, lingshi: lingshi + gift, items, xiuwei, ...(keep ? { keep: story.keep, keepNew: keep.fresh } : {}), ...(meet ? { meet } : {}) }, ...sub);
}

export interface MeetWorld {
  seed: number;
  players: Map<string, Player>;
  ledger: LedgerEntry[];
}

export function meetOnRoad(w: MeetWorld, p: Player, start: number, now: number): YouliMeet | null {
  const rng = new SeededRng(hashSeed(`${w.seed}:${p.id}:youlimeet:${start}`));
  if (rng.nextFloat() >= YOULI_MEET) return null;
  const known: { o: Player; mood: string; tied: boolean }[] = [];
  for (const o of w.players.values()) {
    if (!o.npc || o.needRebirth || !NPC_BY_ID.has(o.npc)) continue;
    const y = yuanOf(p, o.npc);
    if (y?.ask) continue;
    const mood = attitudeOf(w, p.id, o.npc, now);
    if (y || mood !== 'neutral') known.push({ o, mood, tied: !!y });
  }
  if (!known.length) return null;
  known.sort((a, b) => a.o.id.localeCompare(b.o.id));
  const tied = known.filter((k) => k.tied);
  const pool = tied.length ? tied : known;
  const { o, mood } = pool[Math.floor(rng.nextFloat() * pool.length)] as (typeof pool)[number];
  const npc = o.npc as string;
  const meet: YouliMeet = { npc, name: o.daohao, mood, pick: Math.floor(rng.nextFloat() * 1000) };
  const y = yuanOf(p, npc);
  if (y && (y.kind === 'debt' || y.kind === 'blood') && !y.show && realmOf(o.level) === realmOf(p.level)) {
    const day = addDays(calDay(now), 1);
    const r = realmOn(w.seed, realmOf(p.level), day);
    y.show = { day, region: r.id, name: r.name };
    return { ...meet, effect: 'show', day, regionName: r.name };
  }
  const seen = (p.yuanSeen ??= {});
  if (!y && npcEnOf(npc) === 'bao' && (mood === 'friend' || mood === 'sworn') && (seen[npc] === undefined || now - (seen[npc] as number) >= YOULI_REPAY_GAP_MS)) {
    seen[npc] = now;
    return { ...meet, effect: 'gift', lingshi: YOULI_MEET_GIFT * (1 + realmOf(p.level)) };
  }
  return meet;
}
export type YouliMeet = NonNullable<import('./player.ts').YouliResult['meet']>;

