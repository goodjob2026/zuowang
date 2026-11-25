import { createHash } from 'node:crypto';
import { TEXTS, XINGXIANG, isoJst } from '@zuowang/rules';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Context } from 'hono';
import { type Game, GameError } from './game.ts';
import type { VirtualClock } from './clock.ts';

type Env = { Variables: { uid: string } };

export function buildApp(game: Game, opts: { testClock?: VirtualClock; corsOrigins?: string[] } = {}) {
  const app = new Hono<Env>();

  app.use('*', bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: 'tooLarge', message: '请求太大' }, 413) }));

  const origins = opts.corsOrigins ?? [];
  if (origins.length) {
    app.use('/api/*', async (c, next) => {
      const o = c.req.header('origin');
      const ok = !!o && origins.includes(o);
      if (c.req.method === 'OPTIONS') {
        if (!ok) return c.body(null, 403, { Vary: 'Origin' });
        return c.body(null, 204, { 'Access-Control-Allow-Origin': o as string, 'Access-Control-Allow-Methods': 'GET,POST,PUT', 'Access-Control-Allow-Headers': 'authorization,content-type,idempotency-key', 'Access-Control-Max-Age': '600', Vary: 'Origin' });
      }
      await next();

      c.header('Vary', 'Origin');
      if (ok) c.header('Access-Control-Allow-Origin', o as string);
    });
  }

  app.onError((err, c) => {
    if (err instanceof GameError) {
      const msg = (TEXTS.errors as Record<string, string>)[err.code] ?? err.code;
      return c.json({ error: err.code, message: msg }, err.status as 400);
    }
    console.error(JSON.stringify({ at: isoJst(Date.now()), error: String(err), stack: err instanceof Error ? err.stack : undefined }));
    return c.json({ error: 'internal', message: (TEXTS.errors as Record<string, string>).busy ?? '稍后再试' }, 500);
  });

  app.post('/api/session', async (c) => {

    const b = (await c.req.json<unknown>().catch(() => null)) as { credential?: unknown } | null;
    const cred = b && typeof b === 'object' && typeof b.credential === 'string' ? b.credential : '';
    return c.json(game.login(cred));
  });
  app.post('/api/pay/callback', async (c) => {
    const b = (await c.req.json<unknown>().catch(() => null)) as { orderId?: unknown; status?: unknown; sign?: unknown } | null;
    if (!b || typeof b !== 'object' || typeof b.orderId !== 'string' || typeof b.status !== 'string' || typeof b.sign !== 'string') throw new GameError('badRequest', 400);
    return c.json(game.payCallback({ orderId: b.orderId, status: b.status, sign: b.sign }));
  });
  app.get('/api/texts', (c) => c.json(TEXTS));
  app.get('/api/xingxiang', (c) => c.json(XINGXIANG));
  app.get('/api/rumors', (c) => c.json(game.rumors()));
  app.get('/api/health', (c) => c.json({ ok: true, now: game.clock.now() }));

  if (opts.testClock) {
    const clock = opts.testClock;
    app.post('/__test/clock', async (c) => {
      const b = await c.req.json<{ set?: number; advance?: number }>();
      if (b.set !== undefined) clock.set(b.set);
      if (b.advance !== undefined) clock.advance(b.advance);
      return c.json({ now: clock.now(), iso: isoJst(clock.now()) });
    });
    app.post('/__test/tick', (c) => c.json({ jobs: game.tick() }));
    app.post('/__test/player/:uid', async (c) => c.json(game.testPatch(c.req.param('uid'), await c.req.json())));
    app.post('/__test/yuan/:uid', async (c) => c.json(game.testYuan(c.req.param('uid'), await c.req.json())));
    app.post('/__test/inherit/:uid', (c) => c.json(game.testOpenInherit(c.req.param('uid'))));
    app.post('/__test/ledger/:uid', async (c) => {
      const b = await c.req.json<{ npc: string; kind: string; times?: number }>();
      return c.json(game.testLedger(c.req.param('uid'), b.npc, b.kind, b.times));
    });
    app.post('/__test/gate', async (c) => c.json(game.testForceGate((await c.req.json<{ outcome: string }>()).outcome)));
    app.post('/__test/raid', async (c) => c.json(game.testForceRaid((await c.req.json<{ outcome: string }>()).outcome)));
    app.post('/__test/npcen', async (c) => {
      const b = await c.req.json<{ id: string; en: string }>();
      return c.json(game.testNpcEn(b.id, b.en));
    });
    app.post('/__test/mijing/choice/:uid', (c) => c.json(game.testMijingChoice(c.req.param('uid'), c.req.query('npc') === '1')));
    app.post('/__test/pay/:orderId', (c) => {
      const im = game.im as unknown as { sign(o: string, s: string): string };
      const orderId = c.req.param('orderId');
      return c.json(game.payCallback({ orderId, status: 'paid', sign: im.sign(orderId, 'paid') }));
    });
  }

  app.use('/api/*', async (c, next) => {
    const h = c.req.header('authorization') ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const uid = token ? game.uidForToken(token) : null;
    if (!uid) throw new GameError('unauthorized', 401);
    c.set('uid', uid);
    await next();
  });

  const inflight = new Map<string, Promise<void>>();
  app.use('/api/*', async (c, next) => {
    const key = c.req.header('idempotency-key');
    if (!key || (c.req.method !== 'POST' && c.req.method !== 'PUT')) return next();
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(key)) throw new GameError('badRequest', 400);
    const uid = c.get('uid');
    const raw = await c.req.raw.clone().text();
    const hash = createHash('sha256').update(`${c.req.method} ${c.req.path} ${raw}`).digest('hex');

    const lock = `${uid}\n${key}`;
    while (inflight.has(lock)) await inflight.get(lock);
    const prev = game.idemGet(uid, key);
    if (prev) {
      if (prev.bodyHash !== hash) throw new GameError('idempotencyMismatch', 422);
      return c.body(prev.response, 200, { 'content-type': 'application/json', 'idempotent-replay': 'true' });
    }
    let release!: () => void;
    inflight.set(lock, new Promise<void>((r) => (release = r)));
    try {
      await next();
      if (c.res.status === 200) {
        const text = await c.res.clone().text();
        game.idemPut(uid, key, hash, text);
      }
    } finally {
      inflight.delete(lock);
      release();
    }
  });

  const uid = (c: Context<Env>) => c.get('uid');
  const body = async <T>(c: Context<Env>) => (await c.req.json<T>().catch(() => ({}) as T)) as T;

  app.get('/api/onboard', (c) => c.json(game.onboardState(uid(c))));
  app.post('/api/onboard/start', async (c) => c.json(game.onboardStart(uid(c), (await body<{ gender: 'm' | 'f' }>(c)).gender)));
  app.post('/api/onboard/answer', async (c) => c.json(game.onboardAnswer(uid(c), (await body<{ answers: number[] }>(c)).answers)));
  app.post('/api/onboard/retry', (c) => c.json(game.onboardRetry(uid(c))));
  app.post('/api/onboard/finish', async (c) => {
    const b = await body<{ xingxiang: string }>(c);
    return c.json(game.onboardFinish(uid(c), b.xingxiang));
  });
  app.get('/api/me', (c) => c.json(game.view(uid(c))));
  app.post('/api/me/seen', async (c) => {
    const b = await body<{ logId: number; rumorId: number }>(c);
    return c.json(game.markSeen(uid(c), b.logId, b.rumorId));
  });
  app.post('/api/collect', (c) => c.json(game.collect(uid(c))));
  app.get('/api/gate/preview', (c) => c.json(game.gatePreview(uid(c), (c.req.query('pills') ?? '').split(',').filter(Boolean))));
  app.post('/api/jie/preview', async (c) => c.json(game.jiePreview(uid(c), (await body<{ plan: any }>(c)).plan ?? null)));
  app.post('/api/jie/attempt', async (c) => c.json(game.jieAttempt(uid(c), (await body<{ plan: any }>(c)).plan)));
  app.post('/api/gate/attempt', async (c) => c.json(game.gateAttempt(uid(c), (await body<{ pills: string[] }>(c)).pills ?? [])));
  app.post('/api/gongfa/equip', async (c) => c.json(game.equip(uid(c), (await body<{ id: string }>(c)).id)));
  app.post('/api/item/use', async (c) => c.json(game.use(uid(c), (await body<{ id: string }>(c)).id)));
  app.put('/api/loadout', async (c) => c.json(game.setLoadout(uid(c), (await body<{ items: string[] }>(c)).items)));
  app.post('/api/loadout/auto', (c) => c.json(game.autoLoadout(uid(c))));
  app.post('/api/benming', async (c) => {
    const b = await body<{ id: string | null }>(c);
    return c.json(game.setBenming(uid(c), b.id === null ? null : String(b.id)));
  });
  app.post('/api/inherit/enter', async (c) => {
    const b = await body<{ id: string; answer?: number }>(c);
    return c.json(game.inheritEnter(uid(c), b.id, b.answer));
  });
  app.post('/api/mijing/enter', async (c) => {
    const b = await body<{ region?: string; stance: string; target?: string; depth?: number; push?: string }>(c);
    return c.json(game.mijingEnter(uid(c), b.region, b.stance, b.target, b.depth, b.push));
  });
  app.post('/api/team/invite', async (c) => {
    const b = await body<{ to: string; depth?: number; push?: string; stance?: string }>(c);
    return c.json(game.teamInvite(uid(c), String(b.to), b.depth, b.push, b.stance));
  });
  app.post('/api/npc/amends', async (c) => c.json(game.npcAmends(uid(c), String((await body<{ id: string }>(c)).id))));
  app.post('/api/npc/mediate', async (c) => {
    const b = await body<{ id: string; via: string }>(c);
    return c.json(game.npcMediate(uid(c), String(b.id), String(b.via)));
  });
  app.post('/api/npc/gift', async (c) => {
    const b = await body<{ to: string; id: string }>(c);
    return c.json(game.giftNpc(uid(c), String(b.to), String(b.id)));
  });
  app.post('/api/mijing/choose', async (c) => c.json(game.mijingChoose(uid(c), Number((await body<{ option: number }>(c)).option))));
  app.post('/api/zhidian', async (c) => c.json(game.zhidianTo(uid(c), String((await body<{ to: string }>(c)).to))));
  app.post('/api/mijing/leave', (c) => c.json(game.mijingLeave(uid(c))));
  app.get('/api/shop', (c) => c.json(game.shop(uid(c))));
  app.get('/api/players', (c) => c.json(game.playersList(uid(c))));

  app.get('/api/daoyou', (c) => c.json(game.daoyou(uid(c))));
  app.post('/api/lundao', async (c) => c.json(game.lundaoWith(uid(c), String((await body<{ to: string }>(c)).to))));
  app.post('/api/raid', async (c) => {
    const b = await body<{ to: string; heavy?: boolean; revenge?: boolean }>(c);
    return c.json(game.raidOn(uid(c), String(b.to), !!b.heavy, !!b.revenge));
  });
  app.get('/api/bonds', (c) => c.json(game.bonds(uid(c))));
  app.post('/api/friend/ask', async (c) => c.json(game.friendAsk(uid(c), String((await body<{ to: string }>(c)).to))));
  app.post('/api/friend/answer', async (c) => {
    const b = await body<{ from: string; accept: boolean }>(c);
    return c.json(game.friendAnswer(uid(c), String(b.from), b.accept === true));
  });
  app.post('/api/friend/drop', async (c) => c.json(game.friendDrop(uid(c), String((await body<{ id: string }>(c)).id))));
  app.post('/api/foe/mark', async (c) => c.json(game.foeMark(uid(c), String((await body<{ id: string }>(c)).id))));
  app.post('/api/foe/unmark', async (c) => c.json(game.foeUnmark(uid(c), String((await body<{ id: string }>(c)).id))));
  app.get('/api/npcs', (c) => c.json(game.npcList(uid(c))));
  app.get('/api/npc/:id', (c) => c.json(game.npcDetail(uid(c), c.req.param('id'))));
  app.post('/api/gift', async (c) => {
    const b = await body<{ to: string; item: string }>(c);
    return c.json(game.giftTo(uid(c), b.to, b.item));
  });
  app.post('/api/mijing/retake', (c) => c.json(game.mijingRetake(uid(c))));
  app.get('/api/mijing/stay/:id', (c) => c.json(game.stay(uid(c), c.req.param('id'))));
  app.post('/api/bounty', async (c) => {
    const b = await body<{ target: string; amount: number }>(c);
    return c.json(game.bountyPost(uid(c), b.target, Number(b.amount)));
  });
  app.post('/api/yuan/answer', async (c) => {
    const b = await body<{ id: string; option: number }>(c);
    return c.json(game.yuanAnswer(uid(c), b.id, b.option));
  });
  app.post('/api/qiandao', (c) => c.json(game.qiandao(uid(c))));
  app.post('/api/qiyu/choose', async (c) => {
    const b = await body<{ uid: string; option: number }>(c);
    return c.json(game.qiyu(uid(c), b.uid, b.option));
  });
  app.post('/api/decide', async (c) => {
    const b = await body<{ uid: string; kill: boolean }>(c);
    return c.json(game.decide(uid(c), b.uid, b.kill === true));
  });
  app.post('/api/shop/buy', async (c) => {
    const b = await body<{ id: string; qty: number }>(c);
    return c.json(game.buy(uid(c), b.id, b.qty));
  });
  app.post('/api/shop/sell', async (c) => {
    const b = await body<{ id: string; qty: number }>(c);
    return c.json(game.sell(uid(c), b.id, b.qty));
  });
  app.post('/api/shop/buyback', async (c) => {
    const b = await body<{ logId: number }>(c);
    return c.json(game.buyback(uid(c), Number(b.logId)));
  });
  app.post('/api/youli/start', async (c) => c.json(game.youliStart(uid(c), Number((await body<{ hours: number }>(c)).hours))));
  app.post('/api/youli/recall', (c) => c.json(game.youliRecall(uid(c))));
  app.post('/api/youli/ack', (c) => c.json(game.youliAck(uid(c))));
  app.post('/api/bingjie', (c) => c.json(game.bingjie(uid(c))));
  app.post('/api/pay/order', async (c) => c.json(game.createOrder(uid(c), (await body<{ product: string }>(c)).product)));
  app.get('/api/pay/order/:id', (c) => c.json(game.orderStatus(uid(c), c.req.param('id'))));

  return app;
}
