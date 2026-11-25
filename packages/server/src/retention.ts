import type { DatabaseSync } from 'node:sqlite';
import { resetDay } from '@zuowang/rules';

const DAY = 86_400_000;
export interface RetentionRow { name: string; n: number; d1: number | null; d3: number | null; d7: number | null; base: [number, number, number] }

export function retention(db: DatabaseSync, now: number): RetentionRow[] {
  const players = (db.prepare("SELECT id, daohao, data FROM players WHERE id NOT LIKE 'npc_%' AND id NOT LIKE 'p_bot%'").all() as { id: string; daohao: string; data: string }[]).map((r) => {
    const d = JSON.parse(r.data) as { createdAt?: number; npc?: unknown; bot?: unknown };
    return { id: r.id, name: r.daohao, join: d.createdAt ?? 0, skip: !!d.npc || !!d.bot };
  }).filter((p) => !p.skip && p.join > 0);
  const visits = new Set((db.prepare('SELECT player_id, day FROM visits').all() as { player_id: string; day: string }[]).map((v) => `${v.player_id}|${v.day}`));
  const rumors = db.prepare("SELECT at, who, text FROM rumors WHERE kind != 'join'").all() as { at: number; who: string; text: string }[];
  const seenIn3 = (p: { name: string; join: number }) => rumors.some((r) => r.at >= p.join && r.at < p.join + 3 * DAY && (r.who === p.name || r.text.split('|').includes(p.name)));
  const came = (p: { id: string; join: number }, n: number) => visits.has(`${p.id}|${resetDay(p.join + n * DAY)}`);
  const row = (name: string, g: typeof players): RetentionRow => {
    const rate = (n: number): [number | null, number] => {
      const old = g.filter((p) => resetDay(now) > resetDay(p.join + n * DAY) || resetDay(now) === resetDay(p.join + n * DAY));
      return [old.length ? old.filter((p) => came(p, n)).length / old.length : null, old.length];
    };
    const [d1, b1] = rate(1);
    const [d3, b3] = rate(3);
    const [d7, b7] = rate(7);
    return { name, n: g.length, d1, d3, d7, base: [b1, b3, b7] };
  };
  return [row('全部真人', players), row('头三天被传闻提到过', players.filter(seenIn3)), row('头三天没被提到过', players.filter((p) => !seenIn3(p)))];
}

export function retentionText(rows: RetentionRow[]): string {
  const pc = (x: number | null, b: number) => (x === null ? '还没到日子' : `${Math.round(x * 100)}%（${b} 人里）`);
  return ['| 人群 | 人数 | 第 1 天还来 | 第 3 天还来 | 第 7 天还来 |', '|---|---|---|---|---|', ...rows.map((r) => `| ${r.name} | ${r.n} | ${pc(r.d1, r.base[0])} | ${pc(r.d3, r.base[1])} | ${pc(r.d7, r.base[2])} |`)].join('\n');
}
