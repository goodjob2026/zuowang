import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { calDay } from '@zuowang/rules';
import type { Db } from './db.ts';

export const BACKUP_KEEP = 14;

export function backupIfDue(db: Db, dbPath: string, now: number, keep = BACKUP_KEEP): string | null {
  if (!dbPath || dbPath === ':memory:') return null;
  const dir = join(dirname(dbPath), 'backups');
  const stem = basename(dbPath).replace(/\.db$/, '');
  const file = join(dir, `${stem}-${calDay(now)}.db`);
  if (existsSync(file)) return null;
  mkdirSync(dir, { recursive: true });
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);

  const mine = readdirSync(dir)
    .filter((f) => new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{4}-\\d{2}-\\d{2}\\.db$`).test(f))
    .sort();
  for (const f of mine.slice(0, Math.max(0, mine.length - keep))) unlinkSync(join(dir, f));
  return file;
}
