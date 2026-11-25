import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { buildApp } from './app.ts';
import { backupIfDue } from './backup.ts';
import { RealClock, VirtualClock } from './clock.ts';
import { openDb } from './db.ts';
import { Game } from './game.ts';
import { DevIm } from './im.ts';
import { MgIm, parseMgKeys } from './qingliao.ts';
import { resolveStartup } from './startup.ts';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8787);
const TEST = process.env.TEST_MODE === '1';
const DB_PATH = process.env.DB_PATH ?? join(root, 'zuowang.db');

const st = resolveStartup(process.env);
if (!st.ok) {
  console.error(`Error: ${st.error} 不启动。`);
  process.exit(1);
}
const cfg = st.cfg;
for (const w of cfg.warnings) console.warn(`警告：${w}`);
const db = openDb(DB_PATH);
const testClock = TEST ? new VirtualClock(Number(process.env.TEST_START ?? Date.now())) : undefined;
const devIm = new DevIm(process.env.DEV_PAY_SECRET ?? 'dev-secret');
const im = cfg.mode === 'mg' ? new MgIm({ keys: parseMgKeys(cfg.mgKeysJson as string), pfCode: cfg.pfCode, dev: cfg.devLogin ? devIm : null }) : devIm;
const CORS = cfg.cors;
const game = new Game(db, testClock ?? new RealClock(), im, process.env.WORLD_SEED ? Number(process.env.WORLD_SEED) : undefined, { payOpen: process.env.PAY_OPEN === '1', npcs: process.env.NPCS !== '0' && !(TEST && process.env.NPCS !== '1') });
if (cfg.mode === 'mg') console.log(JSON.stringify({ mg: { pfCode: cfg.pfCode, kids: cfg.kids, droppedSessions: game.dropPlatformSessions(), cors: CORS } }));
const app = buildApp(game, { testClock, corsOrigins: CORS });

const staticDir = process.env.STATIC_DIR ?? join(root, 'apps/h5/dist');

if (existsSync(staticDir)) app.use('/*', serveStatic({ root: staticDir }));
app.get('*', (c) => {
  try {
    return c.html(readFileSync(join(staticDir, 'index.html'), 'utf8'));
  } catch {
    return c.text('坐忘服务端：这里只有接口（/api/*）。页面在轻聊里打开；本机开发先 npm run build。', 404);
  }
});

const BOTS = Number(process.env.BOTS ?? 0);

if (BOTS > 0 && cfg.production) console.warn('NODE_ENV=production：不放试玩散修，BOTS 这一项不管用。');
else if (BOTS > 0) game.enableBots(BOTS);
game.tick();

const backup = () => {
  try {
    const f = backupIfDue(db, DB_PATH, Date.now());
    if (f) console.log(JSON.stringify({ backup: f }));
  } catch (e) {
    console.error(JSON.stringify({ backup: 'failed', error: String(e) }));
  }
};
if (!TEST) backup();
if (!TEST) setInterval(() => {
  try {
    game.tick();
  } catch (e) {
    console.error(JSON.stringify({ scheduler: 'tick_failed', error: String(e) }));
  }
  backup();
  game.housekeep();
}, 30_000);

serve({ fetch: app.fetch, port: PORT }, (i) => console.log(`坐忘 server on :${i.port}${TEST ? ' (TEST_MODE)' : ''}`));
