import { addBlood } from './yuan.ts';
import type { LedgerEntry } from './ledger.ts';
import {
  CATCHUP_SHIELD_LAG,
  BOUNTY_KEEP_MS,
  BOUNTY_MIN,
  BOUNTY_REFUND,
  ENEMY_KEEP_MS,
  ENEMY_MAX,
  MAX_KILLED_PER_WEEK,
  PAIR_KILL_COOLDOWN_MS,
  XIONG_BOUNTY_PER,
  XIONG_CLAIM_COOLDOWN_MS,
  XIONG_KILLS,
  XIONG_MIN_REALM,
  XIONG_WINDOW_MS,
  REALM_BAND,
  EARLY_BANDS,
} from './config.ts';
import type { GameEvent, Rumor } from './events.ts';
import { type Player, nextUid, realmOf , lagRealms } from './player.ts';
import { weekKey } from './time.ts';

export interface Bounty {
  id: string;
  target: string;
  targetName: string;
  poster: string;
  posterName: string;
  amount: number;
  at: number;
  expires: number;
  status: 'open' | 'claimed' | 'expired';
  by: string | null;
}

export interface NemesisWorld {
  players: Map<string, Player>;
  bounties: Bounty[];
  rumors: Rumor[];

  ledger?: LedgerEntry[];
}
export type Out = (playerId: string, e: GameEvent) => void;

export function pruneKills(p: Player, now: number): void {
  const keep = Math.max(XIONG_WINDOW_MS, PAIR_KILL_COOLDOWN_MS);
  p.kills = p.kills.filter((k) => now - k.at < keep);
}
export function pruneEnemies(p: Player, now: number): void {
  p.enemies = p.enemies.filter((e) => now - e.at < ENEMY_KEEP_MS).slice(0, ENEMY_MAX);
}

export function isEnemy(p: Player, id: string): boolean {
  return p.enemies.some((e) => e.id === id);
}

export function xiongCount(p: Player, now: number): number {
  return p.kills.filter((k) => !k.justified && now - k.at < XIONG_WINDOW_MS).length;
}
export function isXiong(p: Player, now: number): boolean {
  return xiongCount(p, now) >= XIONG_KILLS;
}

export function xiongBounty(p: Player, now: number): number {
  const n = xiongCount(p, now);
  if (realmOf(p.level) < XIONG_MIN_REALM) return 0;
  return n >= XIONG_KILLS ? XIONG_BOUNTY_PER * (n - (XIONG_KILLS - 1)) : 0;
}

export function lethalBlock(killer: Player, victim: Player, now: number): 'protect' | 'week' | 'pair' | null {
  if (now < victim.protectUntil || now < (victim.newbieUntil ?? 0)) return 'protect';
  if ((EARLY_BANDS as readonly number[]).includes(REALM_BAND[realmOf(victim.level)] as number)) return 'protect';
  if (lagRealms(victim) >= CATCHUP_SHIELD_LAG) return 'protect';
  if (victim.killedWeek === weekKey(now) && victim.killedCount >= MAX_KILLED_PER_WEEK) return 'week';
  if (killer.kills.some((k) => k.victim === victim.id && now - k.at < PAIR_KILL_COOLDOWN_MS)) return 'pair';
  return null;
}

export function addEnemy(victim: Player, killerId: string, now: number, why: 'kill' | 'maim' | 'rob' | 'fu'): void {
  if (victim.id === killerId) return;
  const e = victim.enemies.find((x) => x.id === killerId);
  if (e) {
    e.at = now;
    e.times += 1;
    if (why === 'kill') e.why = 'kill';
    else if (why === 'maim' && (e.why === 'rob' || e.why === 'fu')) e.why = 'maim';
    victim.enemies = [e, ...victim.enemies.filter((x) => x !== e)];
  } else victim.enemies.unshift({ id: killerId, at: now, why, times: 1 });
  pruneEnemies(victim, now);
}

export function afterKill(w: NemesisWorld, killer: Player, victim: Player, now: number, out: Out, opt: { selfDefense?: boolean; revived?: boolean;  loot?: string[] } = {}): { bounty: number; revenge: boolean } {
  pruneEnemies(killer, now);
  const xb = xiongBounty(victim, now);

  const justified = isXiong(victim, now) || isEnemy(killer, victim.id) || !!opt.selfDefense;
  const wk = weekKey(now);
  if (victim.killedWeek !== wk) {
    victim.killedWeek = wk;
    victim.killedCount = 0;
  }
  victim.killedCount += 1;
  pruneKills(killer, now);
  killer.kills.push({ at: now, victim: victim.id, justified });
  addEnemy(victim, killer.id, now, 'kill');

  if (killer.npc && !victim.npc && !opt.revived) for (const e of addBlood(victim, killer.npc, killer.daohao, opt.loot ?? [], now, ((now / 1000) % 97) / 97)) out(victim.id, e);
  out(victim.id, { kind: 'slain', by: killer.daohao, byId: killer.id, at: now, revived: !!opt.revived, band: REALM_BAND[realmOf(killer.level)], loot: opt.loot ?? [] });
  const revenge = isEnemy(killer, victim.id);
  if (!revenge) w.rumors.push({ at: now, kind: 'zhan', who: killer.daohao, text: victim.daohao });
  if (revenge) {
    killer.enemies = killer.enemies.filter((e) => e.id !== victim.id);
    out(killer.id, { kind: 'revenge', target: victim.daohao });
    w.rumors.push({ at: now, kind: 'revenge', who: killer.daohao, text: victim.daohao });
  }
  let bounty = 0;
  for (const b of w.bounties) {
    if (b.status !== 'open' || b.target !== victim.id || b.poster === killer.id || now >= b.expires) continue;
    b.status = 'claimed';
    b.by = killer.id;
    bounty += b.amount;
    out(b.poster, { kind: 'bounty_claimed', target: victim.daohao, by: killer.daohao, amount: b.amount });
  }
  const last = killer.xiongClaimed[victim.id];
  if (xb > 0 && !(last !== undefined && now - last < XIONG_CLAIM_COOLDOWN_MS)) {
    bounty += xb;
    killer.xiongClaimed[victim.id] = now;
  }
  if (bounty > 0) {
    killer.lingshi += bounty;
    out(killer.id, { kind: 'bounty_won', target: victim.daohao, amount: bounty });
    w.rumors.push({ at: now, kind: 'bounty', who: killer.daohao, text: `${victim.daohao}|${bounty}` });
  }
  return { bounty, revenge };
}

export function postBounty(w: NemesisWorld, poster: Player, targetId: string, amount: number, now: number): GameEvent[] {
  const t = w.players.get(targetId);
  if (!t) throw new Error('没有这个人');
  pruneEnemies(poster, now);
  if (!isEnemy(poster, targetId)) throw new Error('只能悬赏自己的死敌');
  const a = Math.floor(amount);
  if (!(a >= BOUNTY_MIN)) throw new Error(`悬赏至少 ${BOUNTY_MIN} 灵石`);
  if (poster.lingshi < a) throw new Error('灵石不够');
  if (w.bounties.some((b) => b.status === 'open' && b.poster === poster.id && b.target === targetId)) throw new Error('已经对他挂过悬赏了');
  poster.lingshi -= a;
  w.bounties.push({ id: `b:${nextUid(poster)}`, target: targetId, targetName: t.daohao, poster: poster.id, posterName: poster.daohao, amount: a, at: now, expires: now + BOUNTY_KEEP_MS, status: 'open', by: null });
  w.rumors.push({ at: now, kind: 'bounty_post', who: poster.daohao, text: `${t.daohao}|${a}` });
  return [{ kind: 'bounty_post', target: t.daohao, amount: a }];
}

export function bountyOn(w: NemesisWorld, target: Player, now: number): { players: number; tiandao: number } {
  let players = 0;
  for (const b of w.bounties) if (b.status === 'open' && b.target === target.id && now < b.expires) players += b.amount;
  return { players, tiandao: xiongBounty(target, now) };
}

export function expireBounty(w: NemesisWorld, b: Bounty, emit: (id: string, ev: GameEvent[], at: number) => void): void {
  if (b.status !== 'open') return;
  b.status = 'expired';
  const refund = Math.floor(b.amount * BOUNTY_REFUND);
  const p = w.players.get(b.poster);
  if (p) {
    p.lingshi += refund;
    emit(p.id, [{ kind: 'bounty_expired', target: b.targetName, refund }], b.expires);
  }
}
