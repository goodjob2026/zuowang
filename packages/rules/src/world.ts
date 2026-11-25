import { DAILY_RESET_HOUR, DAY, ENCOUNTER_HOUR } from './config.ts';
import { dailyPairs, resolvePair } from './encounter.ts';
import type { GameEvent, Rumor } from './events.ts';
import { type Bounty, expireBounty } from './nemesis.ts';
import type { LedgerEntry } from './ledger.ts';
import { type NpcState, newNpcState } from './npc.ts';
import { type Player, bank, isActive } from './player.ts';
import { type Stay, stayJobs } from './region.ts';
import { type Board, type Boards, newBoards, resetWeek, settleWeek } from './weekly.ts';
import { type Inherit, firstInheritAt, inheritJobs, pruneInherits } from './inherit.ts';
import { SeededRng, hashSeed } from './rng.ts';
import { addDays, atJst, dayKey, resetDay } from './time.ts';

export interface World {

  boardsOpen?: Board[];
  seed: number;
  players: Map<string, Player>;
  stays: Map<string, Stay>;
  bounties: Bounty[];
  met: Record<string, number>;
  rumors: Rumor[];
  encounterDay: string;
  boards: Boards;
  inherits: Inherit[];
  inheritNext: number;
  inheritUsed: string[];
  leadDay: string;
  ledger: LedgerEntry[];
  npcs: NpcState;
}
export type Emit = (playerId: string, events: GameEvent[], at: number) => void;

const STAY_KEEP_MS = 3 * DAY;
const BOUNTY_KEEP_DONE_MS = 7 * DAY;

export function newWorld(seed: number, now: number): World {

  const today = dayKey(now);
  const enc = now >= atJst(today, ENCOUNTER_HOUR) ? today : addDays(today, -1);
  return { seed, players: new Map(), stays: new Map(), bounties: [], met: {}, rumors: [], encounterDay: enc, boards: newBoards(now), inherits: [], inheritNext: firstInheritAt(now), inheritUsed: [], leadDay: '', ledger: [], npcs: newNpcState() };
}

export function leadLevel(w: World, now?: number): number {
  const all = [...w.players.values()].filter((p) => !p.needRebirth);
  const real0 = all.filter((p) => !/^(p_)?bot/.test(p.id) && !p.npc);
  const base = real0.length >= 5 ? real0 : all;
  const live = now === undefined ? base : base.filter((p) => isActive(p, now) && !(p.feisheng > 0));
  const xs = (live.length >= 3 ? live : base).map((p) => p.level).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? (xs[m] as number) : ((xs[m - 1] as number) + (xs[m] as number)) / 2;
}
function updateLead(w: World, at: number, day: string): void {
  const lead = leadLevel(w, at);
  for (const p of w.players.values()) {
    if (p.createdAt > at) continue;
    bank(p, at);
    p.lead = lead;
  }
  w.leadDay = day;
}

export function tickWorld(w: World, now: number, emit: Emit): number {
  type Job = { at: number; run: () => void };
  const jobs: Job[] = [];
  const outAt = (at: number) => (id: string, e: GameEvent) => emit(id, [e], at);

  jobs.push(...stayJobs(w, now, outAt));
  for (const b of w.bounties) {
    if (b.status === 'open' && b.expires <= now) jobs.push({ at: b.expires, run: () => expireBounty(w, b, emit) });
  }
  let d = w.encounterDay;
  let guard = 0;
  while (guard++ < 60) {
    const nd = addDays(d, 1);
    const at = atJst(nd, ENCOUNTER_HOUR);
    if (at > now) break;
    const day = nd;
    jobs.push({
      at,
      run: () => {
        if (w.encounterDay >= day) return;
        const rng = new SeededRng(hashSeed(`${w.seed}:enc:${day}`));
        const ps = [...w.players.values()].filter((p) => p.createdAt <= at).sort((a, b) => a.id.localeCompare(b.id));
        const out = new Map<string, GameEvent[]>();
        for (const [a, b] of dailyPairs(ps, w.met, at, rng)) resolvePair(a, b, at, rng, out);
        for (const [id, ev] of out) emit(id, ev, at);
        w.encounterDay = day;
      },
    });
    d = nd;
  }

  let wk = w.boards.settled;
  let g2 = 0;
  while (g2++ < 20) {
    const next = addDays(wk, 7);
    const at = atJst(next, DAILY_RESET_HOUR);
    if (at > now) break;
    const ending = wk;
    jobs.push({ at, run: () => settleWeek([...w.players.values()], w.boards, ending, at, emit, w.rumors, w.boardsOpen) });
    wk = next;
  }
  jobs.push(...inheritJobs(w, now, emit));

  const today = resetDay(now);
  if (w.leadDay !== today) {
    const at = atJst(today, DAILY_RESET_HOUR);
    jobs.push({ at: Math.min(at, now), run: () => updateLead(w, Math.min(at, now), today) });
  }
  jobs.sort((a, b) => a.at - b.at);
  for (const j of jobs) j.run();
  pruneInherits(w, now);

  for (const p of w.players.values()) {
    if (!p.stay) continue;
    const st = w.stays.get(p.stay);
    if (st && st.status === 'in') continue;
    const sid = p.stay;
    p.stay = null;
    p.windows = p.windows.filter((x) => x.runId !== sid || (st !== undefined && x.end <= now));
  }
  for (const [id, st] of w.stays) if (st.status === 'done' && now - st.end > STAY_KEEP_MS) w.stays.delete(id);
  w.bounties = w.bounties.filter((b) => b.status === 'open' || now - b.expires < BOUNTY_KEEP_DONE_MS);
  return jobs.length;
}
