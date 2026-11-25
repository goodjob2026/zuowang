import { BOARD_SHOW, BOARD_TITLES, DAILY_RESET_HOUR, DAY, HOUR } from './config.ts';
import type { GameEvent, Rumor } from './events.ts';
import { type Player, isActive } from './player.ts';
import { weekKey } from './time.ts';

export type Board = 'xiuwei' | 'jin' | 'duobao' | 'e' | 'shan';
export const BOARDS: Board[] = ['xiuwei', 'jin', 'duobao', 'e', 'shan'];

export const BOARDS_OPEN: Board[] = ['xiuwei', 'jin', 'shan', 'e'];
export const BOARD_NAME: Record<Board, string> = { xiuwei: '历史总榜', jin: '本周周榜', duobao: '夺宝榜', e: '恶人榜', shan: '善人榜' };
export interface BoardRow {
  id: string;
  daohao: string;
  value: number;
}
export interface Boards {
  settled: string;
  last: Record<Board, BoardRow[]>;
}
export function newBoards(now: number): Boards {
  return { settled: resetWeek(now), last: { xiuwei: [], jin: [], duobao: [], e: [], shan: [] } };
}

export function resetWeek(ms: number): string {
  return weekKey(ms - DAILY_RESET_HOUR * HOUR);
}

export function weeklyTrack(p: Player, ev: GameEvent[], now: number): void {
  if (p.npc) return;
  const wk = resetWeek(now);
  if (p.week.key !== wk) p.week = { key: wk, duobao: 0, e: 0, shan: 0, jin: 0 };
  for (const e of ev) {

    if (e.kind === 'levelup' || (e.kind === 'breakthrough' && e.ok)) p.week.jin = (p.week.jin ?? 0) + 1;
    if (e.kind === 'mijing_result' && e.treasure && e.late) p.week.duobao += 1;
    if (e.kind === 'shane' && !e.passive) {
      const d = e.delta as number;
      if (d < 0) p.week.e += -d;
      else p.week.shan += d;
    }
  }
}
export function rankOf(players: Player[], board: Board, wk: string, now?: number): BoardRow[] {
  if (board === 'xiuwei') {

    return players
      .filter((p) => !p.npc && !p.needRebirth && (now === undefined || isActive(p, now)))
      .sort((a, b) => b.feisheng - a.feisheng || b.level - a.level || b.xiuwei - a.xiuwei || a.id.localeCompare(b.id))
      .slice(0, BOARD_SHOW)
      .map((p) => ({ id: p.id, daohao: p.daohao, value: p.level }));
  }
  const score = (p: Player) => p.week[board] ?? 0;
  return players
    .filter((p) => !p.npc && p.week.key === wk && score(p) > 0 && !p.needRebirth)

    .sort((a, b) => score(b) - score(a) || (board === 'jin' ? b.level - a.level || b.xiuwei - a.xiuwei : 0) || a.id.localeCompare(b.id))
    .slice(0, BOARD_SHOW)
    .map((p) => ({ id: p.id, daohao: p.daohao, value: score(p) }));
}

export function settleWeek(players: Player[], boards: Boards, wk: string, at: number, emit: (id: string, ev: GameEvent[], at: number) => void, rumors: Rumor[], open: Board[] = BOARDS_OPEN): void {
  const until = at + 7 * DAY;
  for (const p of players) p.titles = (p.titles ?? []).filter((t) => t.until > at);

  const ranked = new Map<Board, BoardRow[]>(open.map((b) => [b, rankOf(players, b, wk, at)]));
  for (const b of open) {
    const rows = ranked.get(b) as BoardRow[];
    boards.last[b] = rows;
    rows.slice(0, b === 'xiuwei' || b === 'jin' ? 1 : 3).forEach((r, i) => {
      const p = players.find((x) => x.id === r.id);
      if (!p) return;
      p.titles = [...p.titles.filter((t) => t.board !== b), { board: b, rank: i + 1, until }];
      emit(p.id, [{ kind: 'title', board: b, rank: i + 1, title: BOARD_TITLES[b][i], value: r.value }], at);
    });
    if (rows[0]) rumors.push({ at, kind: 'board', who: rows[0].daohao, text: `${b}|${BOARD_TITLES[b][0]}` });
  }
  boards.settled = resetWeek(at);
}

export function titlesOf(p: Player, now: number): string[] {
  return (p.titles ?? []).filter((t) => now < t.until).map((t) => BOARD_TITLES[t.board][t.rank - 1] as string);
}
