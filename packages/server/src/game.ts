import { randomBytes } from 'node:crypto';
import {
  type GameEvent,
  PAY_PRODUCTS,
  type Player,
  type Product,
  QUIZ_RETRIES,
  ACTIVE_WINDOW_MS,
  type LedgerKind,
  record,
  VOW_DELAY_MS,
  amends,
  amendsCost,
  mediate,
  mediatorsFor,
  giftNpc,
  teamInvite,
  mateCandidates,
  LUNDAO_GIVE_PER_DAY,
  isActive,
  isFriend,
  weekKey,
  RAID_MIN_LEVEL,
  RAID_PER_DAY,
  isFoe,
  lundao,
  lundaoBlock,
  raid,
  raidBlock,
  raidOf,
  raidPreview,
  shielded,
  TRUST_GAIN,
  TRUST_NEED,
  addTrust,
  trustEnough,
  trustOf,
  FOE_MAX,
  FRIEND_MAX,
  alliesOf,
  foeMark,
  foeUnmark,
  friendAnswer,
  friendAsk,
  friendDrop,
  hatersOf,
  gateOf,
  gateVisit,
  attempt3,
  autoPlan3,
  canOffer,
  isJie3,
  type JiePlan,
  preview3,
  gateVisitors,
  ATTITUDE_NAME,
  NPC_BY_ID,
  NPC_EN,
  setBenming,
  rememberNpc,
  NPC_EVENTS,
  NPC_REPAY,
  NPC_TEAM_ROB,
  npcLine,
  answerYuan,
  QIYU_AFTER,
  todayRealm,
  DAY,
  type Yuan,
  NPCS,
  RUMOR_JOIN_PER_DAY,
  RUMOR_NPC_PER_DAY,
  resetDay,
  atJst,
  DAILY_RESET_HOUR,
  type NpcDef,
  type NpcEn,
  attitudeOf,
  calDay,
  instOf,
  kinOf,
  npcStep,
  npcsAlive,
  reasonsOf,
  RUMOR_PAGE_DAYS,
  RUMOR_SHOW_MAX,
  SeededRng,
  WENXIN,
  XINGXIANG,
  XINXING_DESC,
  XINXING_NAME,
  attempt,
  bingjie,
  buy,
  canBuy,
  catchUp,
  chooseQiyu,
  collect,
  completeRebirth,
  decideKill,
  deliver,
  drawQuestions,
  equipGongfa,
  hashSeed,
  item,
  newPlayer,
  newWorld,
  pool,
  preview,
  scoreQuiz,
  sell,
  buyback,
  BUYBACK_MS,
  braceletInUse,
  suggestDaohao,
  tickWorld,
  useItem,
  type World,
  addItem,
  bank,
  die,
  markGateFull,
  need,
  setStatus,
  type Gender,
  fillDefaults,
  rikeTrack,
  qiandao,
  resetWeek,
  startYouli,
  recallYouli,
  ackYouli,
  type Stay,
  type Bounty,
  type Stance,
  enterRegion,
  leaveRegion,
  postBounty,
  addEnemy,
  retake,
  campOf,
  weeklyTrack,
  enterInherit,
  openOne,
  realmOf,
  autoLoadout,
  catalogFor,
  gift,
  zhidian,
  zhidianBlock,
  chooseStage,
  NPC_STAGES,
  titlesOf,
  levelName,
  type Rng,
  huTooWeak,
} from '@zuowang/rules';
import type { Clock } from './clock.ts';
import { type Db, tx } from './db.ts';
import type { ImAdapter } from './im.ts';
import { itemView, playerView, pubId, rensheFull, stayView , withScene } from './views.ts';
import { notifyText } from './notify.ts';
import { BOT_PREFIX, botSeed, botTurn, isBotUid } from './bots.ts';

const SESSIONS_PER_UID = 5;

const IDEM_KEEP_MS = 2 * 86_400_000;

export function imName(s: string): string {
  const clean = String(s ?? '')
    .replace(/[\p{Cf}\p{Co}\p{Cn}]/gu, '')
    .replace(/[\p{Cc}\p{Z}\u3164\u115f\u1160\uffa0\u2800]/gu, ' ')
    .replace(/ +/g, ' ')
    .trim();
  return [...clean].slice(0, 20).join('');
}

const NPC_NAMES = new Set(NPCS.map((n) => n.name));

export class GameError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

interface Onboard {
  mode: 'new' | 'rebirth';
  gender: Gender;
  questions: string[];
  result: ReturnType<typeof scoreQuiz> | null;
  retries: number;
}

export class Game {
  readonly w: World;
  private readonly db: Db;
  readonly clock: Clock;
  readonly im: ImAdapter;
  private readonly byUid = new Map<string, Player>();
  private readonly uidOf = new Map<string, string>();

  readonly payOpen: boolean;

  constructor(db: Db, clock: Clock, im: ImAdapter, seed?: number, opts: { payOpen?: boolean; npcs?: boolean } = {}) {
    this.payOpen = opts.payOpen === true;
    this.npcsOn = opts.npcs === true;
    this.db = db;
    this.clock = clock;
    this.im = im;
    const now = clock.now();
    const meta = (k: string) => (db.prepare('SELECT value FROM meta WHERE key = ?').get(k) as { value: string } | undefined)?.value;
    const s = meta('seed');
    const worldSeed = s ? Number(s) : (seed ?? randomBytes(4).readUInt32BE(0));
    this.w = newWorld(worldSeed, now);
    const bd = meta('boards');
    if (bd) this.w.boards = JSON.parse(bd);
    const ihs = meta('inherits');
    if (ihs) this.w.inherits = JSON.parse(ihs);
    const ihn = meta('inheritNext');
    if (ihn) this.w.inheritNext = Number(ihn);
    const ihu = meta('inheritUsed');
    if (ihu) this.w.inheritUsed = JSON.parse(ihu);
    const lg = meta('ledger');
    if (lg) this.w.ledger = JSON.parse(lg);
    const ns = meta('npcs');
    if (ns) this.w.npcs = JSON.parse(ns);
    const ld = meta('leadDay');
    if (ld) this.w.leadDay = ld;
    const enc = meta('encounterDay');
    if (enc) this.w.encounterDay = enc;
    for (const r of db.prepare('SELECT id, uid, data FROM players').all() as { id: string; uid: string; data: string }[]) {
      const p = fillDefaults(JSON.parse(r.data) as Player);
      this.w.players.set(p.id, p);
      this.byUid.set(r.uid, p);
      this.uidOf.set(p.id, r.uid);
    }
    for (const r of db.prepare('SELECT data FROM stays').all() as { data: string }[]) {
      const st = JSON.parse(r.data) as Stay;
      st.spoils ??= Math.min(2, st.wins ?? 0);
      st.beat ??= [];
      st.extra ??= 0;
      this.w.stays.set(st.id, st);
    }
    for (const r of db.prepare('SELECT data FROM bounties').all() as { data: string }[]) this.w.bounties.push(JSON.parse(r.data) as Bounty);
    for (const r of db.prepare('SELECT pair, at FROM met').all() as { pair: string; at: number }[]) this.w.met[r.pair] = r.at;
    tx(db, () => {
      if (!s) this.saveMeta('seed', String(worldSeed));
      this.saveMeta('encounterDay', this.w.encounterDay);
      this.saveWorldAllBoards();
    });
  }

  private saveMeta(k: string, v: string) {
    this.db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);
  }
  private savePlayer(p: Player) {
    this.db.prepare('UPDATE players SET data = ?, daohao = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(p), p.daohao, this.clock.now(), p.id);
  }
  private saveStay(st: Stay) {
    this.db.prepare('INSERT INTO stays(id, data) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(st.id, JSON.stringify(st));
  }

  private saveStaysBounties() {
    const keepS = new Set(this.w.stays.keys());
    for (const r of this.db.prepare('SELECT id FROM stays').all() as { id: string }[]) if (!keepS.has(r.id)) this.db.prepare('DELETE FROM stays WHERE id = ?').run(r.id);
    for (const st of this.w.stays.values()) this.saveStay(st);
    this.db.exec('DELETE FROM bounties');
    const ins = this.db.prepare('INSERT INTO bounties(id, data) VALUES(?, ?)');
    for (const b of this.w.bounties) ins.run(b.id, JSON.stringify(b));
  }
  private saveWorldAllBoards() {
    this.saveMeta('boards', JSON.stringify(this.w.boards));
    this.saveMeta('inherits', JSON.stringify(this.w.inherits));
    this.saveMeta('inheritNext', String(this.w.inheritNext));
    this.saveMeta('inheritUsed', JSON.stringify(this.w.inheritUsed));
    this.saveMeta('leadDay', this.w.leadDay);
    this.saveMeta('ledger', JSON.stringify(this.w.ledger));
    this.saveMeta('npcs', JSON.stringify(this.w.npcs));
  }
  private saveWorldAll() {
    this.saveWorldAllBoards();
    for (const p of this.w.players.values()) this.savePlayer(p);
    this.saveStaysBounties();
    const ins = this.db.prepare('INSERT INTO met(pair, at) VALUES(?, ?) ON CONFLICT(pair) DO UPDATE SET at = excluded.at');
    for (const [k, v] of Object.entries(this.w.met)) ins.run(k, v);
    this.saveMeta('encounterDay', this.w.encounterDay);
  }
  private log(pid: string, at: number, self: boolean, events: GameEvent[]) {
    if (!events.length) return;
    const ins = this.db.prepare('INSERT INTO logs(player_id, at, self, data) VALUES(?, ?, ?, ?)');
    for (const e of events) ins.run(pid, at, self ? 1 : 0, JSON.stringify(e));

    if (!self && this.im.notify) {
      const uid = this.uidOf.get(pid);
      if (uid && !isBotUid(uid)) for (const e of events) {
        const t = notifyText(e);
        if (t) this.notifyQueue.push({ uid, text: t });
      }
    }
  }
  private notifyQueue: { uid: string; text: string }[] = [];

  private txn<T>(fn: () => T): T {
    this.notifyQueue = [];
    try {
      const r = tx(this.db, fn);
      const q = this.notifyQueue;
      this.notifyQueue = [];
      for (const x of q) this.im.notify?.(x.uid, x.text);
      return r;
    } catch (e) {
      this.notifyQueue = [];
      throw e;
    }
  }

  private trackRike(pid: string, ev: GameEvent[], at: number) {
    const p = this.w.players.get(pid);
    if (!p || !ev.length) return;
    weeklyTrack(p, ev, at);
    const extra = rikeTrack(p, ev, at);
    if (extra.length) this.log(pid, at, false, extra);
  }

  private npcOnly(r: { who: string; text: string }): boolean {
    const real = new Set<string>();
    for (const p of this.w.players.values()) if (!p.npc) real.add(p.daohao);
    if (real.has(r.who) || !NPC_NAMES.has(r.who)) return false;
    return !r.text.split('|').some((x) => real.has(x));
  }
  private npcRetryAt = 0;
  private npcRumorDay = '';
  private npcRumorN = 0;
  private flushRumors() {
    if (!this.w.rumors.length) return;
    const ins = this.db.prepare('INSERT INTO rumors(at, kind, who, text) VALUES(?, ?, ?, ?)');

    const mine = this.w.rumors.filter((r) => !this.npcOnly(r));
    const theirs = this.w.rumors.filter((r) => this.npcOnly(r)).sort((a, b) => Number(b.kind === 'npc_death') - Number(a.kind === 'npc_death'));
    const keep = new Set(mine);
    for (const r of theirs) {
      const day = resetDay(r.at);
      if (day !== this.npcRumorDay) {
        this.npcRumorDay = day;

        this.npcRumorN = (this.db.prepare('SELECT who, text FROM rumors WHERE at >= ?').all(atJst(day, DAILY_RESET_HOUR)) as { who: string; text: string }[]).filter((x) => this.npcOnly(x)).length;
      }
      if (this.npcRumorN >= RUMOR_NPC_PER_DAY) continue;
      this.npcRumorN += 1;
      keep.add(r);
    }
    for (const r of this.w.rumors) if (keep.has(r)) ins.run(r.at, r.kind, r.who, r.text);
    this.w.rumors.length = 0;
  }

  tick(): number {
    const n = this.txn(() => this.tickInner());
    if (this.botCount > 0) this.runBots();
    return n;
  }

  private botCount = 0;
  private readonly botNext = new Map<string, number>();

  enableBots(n: number) {
    this.botCount = n;
    tx(this.db, () => {
      const now = this.clock.now();
      const humans = [...this.byUid.entries()].filter(([u]) => !isBotUid(u)).map(([, p]) => p);
      const anchor = humans.length ? Math.min(...humans.map((p) => p.level)) : 0;
      const rng = new SeededRng(hashSeed(`${this.w.seed}:bots`));
      const taken = new Set([...this.w.players.values()].map((p) => p.daohao));
      for (let i = 0; i < n; i++) {
        const uid = `${BOT_PREFIX}${i}`;
        if (this.byUid.has(uid)) continue;
        const b = botSeed(i, rng, anchor);
        const name = suggestDaohao(rng, taken, 1, b.gender)[0] ?? `散修${i}`;
        taken.add(name);
        const id = `p_${uid}`;
        const p = newPlayer({ id, daohao: name, gender: b.gender, xinxing: b.xinxing, xingxiang: b.xingxiang, shane: b.shane, now, renshe: b.renshe });
        p.level = b.level;
        p.maxLevel = b.level;
        p.newbieUntil = 0;
        this.w.players.set(id, p);
        this.byUid.set(uid, p);
        this.uidOf.set(id, uid);
        this.db.prepare('INSERT INTO players(id, uid, daohao, data, updated_at) VALUES(?, ?, ?, ?, ?)').run(id, uid, name, JSON.stringify(p), now);
      }
    });
    const now = this.clock.now();
    const rng = new SeededRng(hashSeed(`${this.w.seed}:botclock:${now}`));
    for (const [uid] of this.byUid) if (isBotUid(uid)) this.botNext.set(uid, now + rng.nextFloat() * 3 * 3_600_000);
  }

  private runBots() {
    const now = this.clock.now();
    for (const [uid, at] of this.botNext) {
      if (at > now) continue;
      const rng = new SeededRng(hashSeed(`${uid}:turn:${now}`));
      this.botNext.set(uid, now + (5 + rng.nextFloat() * 8) * 3_600_000);
      try {
        this.act(uid, (p, t, out) => botTurn(this.w, p, t, rng, out), false);
      } catch (e) {
        console.error(JSON.stringify({ bot: uid, error: String(e) }));
      }
    }
  }

  private readonly npcsOn: boolean;
  private tickInner(): number {
    const now = this.clock.now();
    const n = tickWorld(this.w, now, (id, ev, at) => {
      if (this.w.players.get(id)?.npc) return;
      this.log(id, at, false, ev);
      this.trackRike(id, ev, at);
    });

    let npcChanged = false;
    if (this.npcsOn && now >= this.npcRetryAt) {

      try {
      const r = npcStep(
        this.w,
        now,
        (id, e) => {
          if (!this.w.players.get(id)?.npc) this.log(id, now, false, [e]);
        },
        (p) => {
          this.byUid.set(p.id, p);
          this.uidOf.set(p.id, p.id);
          this.db.prepare('INSERT INTO players(id, uid, daohao, data, updated_at) VALUES(?, ?, ?, ?, ?)').run(p.id, p.id, p.daohao, JSON.stringify(p), now);
        },
      );
      npcChanged = r.changed;
      } catch (e) {
        console.error('Error: NPC 这一步没走成，十分钟后再试', e);
        this.npcRetryAt = now + 10 * 60_000;
        npcChanged = true;
      }
    }
    if (n > 0 || npcChanged) this.saveWorldAll();
    this.flushRumors();
    return n;
  }

  login(credential: string): { token: string; onboarded: boolean } {
    const id = this.im.verifyCredential(credential);
    if (!id) throw new GameError('badCredential', 401);
    if (id.uid.startsWith('npc_') || isBotUid(id.uid)) throw new GameError('badCredential', 401);
    const nowMs = this.clock.now();

    this.db.prepare('DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at <= ?').run(nowMs);
    const token = randomBytes(24).toString('hex');

    this.db.prepare('INSERT INTO sessions(token, uid, name, created_at, expires_at) VALUES(?, ?, ?, ?, ?)').run(token, id.uid, id.name, nowMs, id.expiresAt ?? null);
    this.db.prepare('DELETE FROM sessions WHERE uid = ? AND rowid NOT IN (SELECT rowid FROM sessions WHERE uid = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)').run(id.uid, id.uid, SESSIONS_PER_UID);

    const p = this.byUid.get(id.uid);
    const nm = imName(id.name);
    if (p && nm && p.daohao !== nm) {
      p.daohao = nm;
      this.savePlayer(p);
    }
    return { token, onboarded: this.byUid.has(id.uid) };
  }

  private imNameOf(uid: string): string {
    const r = this.db.prepare('SELECT name FROM sessions WHERE uid = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(uid) as { name: string } | undefined;
    return imName(r?.name ?? '');
  }
  uidForToken(token: string): string | null {
    const r = this.db.prepare('SELECT uid, expires_at FROM sessions WHERE token = ?').get(token) as { uid: string; expires_at: number | null } | undefined;
    if (!r) return null;
    if (r.expires_at !== null && r.expires_at <= this.clock.now()) return null;
    return r.uid;
  }

  dropPlatformSessions(): number {
    return Number(this.db.prepare("DELETE FROM sessions WHERE uid LIKE 'mg\\_%' ESCAPE '\\'").run().changes);
  }
  player(uid: string): Player {
    const p = this.byUid.get(uid);
    if (!p) throw new GameError('notOnboarded', 409);
    return p;
  }

  private getOnboard(uid: string): Onboard | null {
    const r = this.db.prepare('SELECT data FROM onboarding WHERE uid = ?').get(uid) as { data: string } | undefined;
    return r ? (JSON.parse(r.data) as Onboard) : null;
  }
  private setOnboard(uid: string, o: Onboard) {
    this.db.prepare('INSERT INTO onboarding(uid, data) VALUES(?, ?) ON CONFLICT(uid) DO UPDATE SET data = excluded.data').run(uid, JSON.stringify(o));
  }
  private questionsView(o: Onboard) {
    return o.questions.map((id) => {
      const q = WENXIN.find((x) => x.id === id);
      if (!q) throw new GameError('questionMissing', 500);
      return { id: q.id, text: q.text, options: q.options.map((x) => x.label) };
    });
  }
  onboardState(uid: string) {
    const p = this.byUid.get(uid);
    const mode: Onboard['mode'] = p ? 'rebirth' : 'new';
    if (p && !p.needRebirth) return { mode: 'done' as const };
    const o = this.getOnboard(uid);
    if (!o || o.mode !== mode) return { mode, stage: 'gender' as const };
    if (!o.result) return { mode, stage: 'quiz' as const, questions: this.questionsView(o) };
    return { mode, stage: 'pick' as const, ...this.resultView(uid, o) };
  }
  private resultView(uid: string, o: Onboard) {
    const r = o.result as NonNullable<Onboard['result']>;
    const existing = this.byUid.get(uid);

    const startShane = existing ? existing.shane : r.shane;
    const startGongfa = existing ? existing.gongfa : r.gongfa;
    return {
      xinxing: r.xinxing,
      xinxingName: XINXING_NAME[r.xinxing],
      xinxingDesc: XINXING_DESC[r.xinxing],
      renshe: rensheFull(r.renshe),
      shan: r.shan,
      gang: r.gang,
      pool: pool(o.gender, r.xinxing),
      start: { camp: campOf({ shane: startShane }), campName: ({ zheng: '正道', mo: '魔道', san: '散修' } as const)[campOf({ shane: startShane })], gongfa: itemView(startGongfa), kept: !!existing },
      retriesLeft: QUIZ_RETRIES - o.retries,
    };
  }
  onboardStart(uid: string, gender: Gender) {
    if (gender !== 'm' && gender !== 'f') throw new GameError('badGender');
    const p = this.byUid.get(uid);
    if (p && !p.needRebirth) throw new GameError('alreadyOnboarded', 409);
    const prev = this.getOnboard(uid);
    const rng = new SeededRng(hashSeed(`${uid}:quiz:${this.clock.now()}`));
    const o: Onboard = { mode: p ? 'rebirth' : 'new', gender, questions: drawQuestions(rng).map((q) => q.id), result: null, retries: prev && prev.mode === (p ? 'rebirth' : 'new') ? prev.retries : 0 };
    this.setOnboard(uid, o);
    return { questions: this.questionsView(o) };
  }
  onboardAnswer(uid: string, answers: number[]) {
    const o = this.getOnboard(uid);
    if (!o) throw new GameError('noQuiz', 409);
    const qs = o.questions.map((id) => WENXIN.find((x) => x.id === id)).filter((x) => x !== undefined);
    if (!Array.isArray(answers) || answers.length !== qs.length || answers.some((a) => !Number.isInteger(a))) throw new GameError('badAnswers');
    o.result = scoreQuiz(qs, answers);
    this.setOnboard(uid, o);
    return this.resultView(uid, o);
  }
  onboardRetry(uid: string) {
    const o = this.getOnboard(uid);
    if (!o || !o.result) throw new GameError('noQuiz', 409);
    if (o.retries >= QUIZ_RETRIES) throw new GameError('noRetries', 409);
    const rng = new SeededRng(hashSeed(`${uid}:quiz:retry:${this.clock.now()}`));
    o.retries += 1;
    o.result = null;
    o.questions = drawQuestions(rng).map((q) => q.id);
    this.setOnboard(uid, o);
    return { questions: this.questionsView(o) };
  }
  onboardFinish(uid: string, xingxiang: string) {
    return tx(this.db, () => {
      this.tickInner();
      const o = this.getOnboard(uid);
      if (!o || !o.result) throw new GameError('noQuiz', 409);
      const choices = pool(o.gender, o.result.xinxing);
      if (!choices.some((x) => x.id === xingxiang)) throw new GameError('badXingxiang');
      const now = this.clock.now();
      const existing = this.byUid.get(uid);
      const name = this.imNameOf(uid) || existing?.daohao || '无名';
      if (existing) {
        completeRebirth(existing, xingxiang, o.gender, o.result.xinxing, name, o.result.renshe);
        this.savePlayer(existing);
        this.log(existing.id, now, true, [{ kind: 'rebirth', xingxiang }]);
      } else {
        const id = `p_${uid}`;
        const p = newPlayer({ id, daohao: name, gender: o.gender, xinxing: o.result.xinxing, xingxiang, shane: o.result.shane, now, renshe: o.result.renshe, gongfa: o.result.gongfa });
        this.w.players.set(id, p);
        this.byUid.set(uid, p);
        this.uidOf.set(id, uid);
        this.db.prepare('INSERT INTO players(id, uid, daohao, data, updated_at) VALUES(?, ?, ?, ?, ?)').run(id, uid, name, JSON.stringify(p), now);
        this.log(id, now, false, [{ kind: 'welcome', xinxing: o.result.xinxing }]);
        this.joinRumor(name, now);
      }
      this.db.prepare('DELETE FROM onboarding WHERE uid = ?').run(uid);
      return this.viewInner(uid);
    });
  }

  view(uid: string) {
    return this.txn(() => {
      this.tickInner();
      const p = this.player(uid);
      const cu = catchUp(p, this.clock.now(), this.w);

      this.db.prepare('INSERT OR IGNORE INTO visits(player_id, day) VALUES(?, ?)').run(p.id, resetDay(this.clock.now()));
      this.log(p.id, this.clock.now(), false, cu);
      this.trackRike(p.id, cu, this.clock.now());
      this.savePlayer(p);
      return this.viewInner(uid);
    });
  }
  private viewInner(uid: string) {
    const p = this.player(uid);
    const now = this.clock.now();
    const seen = this.db.prepare('SELECT seen_log, seen_rumor FROM players WHERE id = ?').get(p.id) as { seen_log: number; seen_rumor: number };
    const logs = (this.db.prepare('SELECT id, at, self, data FROM logs WHERE player_id = ? AND id > ? ORDER BY id LIMIT 200').all(p.id, seen.seen_log) as { id: number; at: number; self: number; data: string }[]).map((r) => ({ id: r.id, at: r.at, self: r.self === 1, data: JSON.parse(r.data) as GameEvent }));

    const fresh = this.db.prepare('SELECT id, at, kind, who, text FROM rumors WHERE id > ? ORDER BY id DESC LIMIT ?').all(seen.seen_rumor, RUMOR_SHOW_MAX * 4) as { id: number; at: number; kind: string; who: string; text: string }[];
    const rumors = [...fresh.filter((r) => !this.npcOnly(r)), ...fresh.filter((r) => this.npcOnly(r))].slice(0, RUMOR_SHOW_MAX).sort((a, b) => a.id - b.id);

    const names: Record<string, { name: string; tier: number; icon: string }> = {};
    const addName = (id: unknown) => {
      if (typeof id !== 'string' || names[id]) return;
      try {
        const it = item(id);
        names[id] = { name: it.name, tier: it.tier, icon: it.icon };
      } catch {

      }
    };
    for (const l of logs) {
      const d = l.data as Record<string, unknown>;
      for (const k of ['item', 'got', 'gave', 'id']) addName(d[k]);
      if (Array.isArray(d.items)) d.items.forEach(addName);
      if (Array.isArray(d.loot)) d.loot.forEach(addName);
    }
    return { ...playerView(p, { now, w: this.w, logs, rumors }), team: this.teamView(p, now), daoyou: { owed: !!raidOf(p, now).owed }, names, buyback: this.buybackList(p.id, now), braceletInUse: braceletInUse(p), payOpen: this.payOpen };
  }

  markSeen(uid: string, logId: number, rumorId: number) {
    const p = this.player(uid);
    p.lastSeenAt = this.clock.now();
    this.savePlayer(p);
    this.db.prepare('UPDATE players SET seen_log = MAX(seen_log, ?), seen_rumor = MAX(seen_rumor, ?) WHERE id = ?').run(Math.floor(logId) || 0, Math.floor(rumorId) || 0, p.id);
    return { ok: true };
  }

  private act(uid: string, fn: (p: Player, now: number, out: (id: string, e: GameEvent) => void) => GameEvent[], withView = true) {
    return this.txn(() => {
      this.tickInner();
      const p = this.player(uid);
      const now = this.clock.now();
      p.activeAt = now;
      const cu = catchUp(p, now, this.w);
      this.log(p.id, now, false, cu);
      this.trackRike(p.id, cu, now);
      const others = new Map<string, GameEvent[]>();
      const mine: GameEvent[] = [];
      const out = (id: string, e: GameEvent) => {
        if (id === p.id) mine.push(e);
        else others.set(id, [...(others.get(id) ?? []), e]);
      };
      let ev: GameEvent[];
      try {
        ev = [...fn(p, now, out), ...mine];
      } catch (e) {
        if (e instanceof GameError) throw e;
        throw new GameError(e instanceof Error ? e.message : String(e));
      }
      ev.push(...rikeTrack(p, ev, now));
      weeklyTrack(p, ev, now);
      this.log(p.id, now, true, ev);
      this.savePlayer(p);
      for (const [id, oev] of others) {
        const o = this.w.players.get(id);
        if (!o) continue;
        this.log(id, now, false, oev);
        weeklyTrack(o, oev, now);
        this.savePlayer(o);
      }
      this.saveStaysBounties();
      this.saveWorldAllBoards();
      this.flushRumors();

      return { events: ev.map((e) => withScene(e as Record<string, unknown>, p.id, now) as GameEvent), view: withView ? this.viewInner(uid) : null };
    });
  }
  private needAlive(p: Player) {
    if (p.needRebirth) throw new GameError('needRebirth', 409);
  }

  collect(uid: string) {
    return this.act(uid, (p, now) => (this.needAlive(p), collect(p, now)));
  }
  gatePreview(uid: string, pills: string[]) {
    const p = this.player(uid);
    const now = this.clock.now();
    const pv = preview(p, pills.filter((id) => (p.inv[id] ?? 0) > 0), now);

    return pv.kind === 'tupo' ? pv : { ...pv, visitors: gateVisitors(this.w, p, now) };
  }

  jiePreview(uid: string, plan: JiePlan | null) {
    const p = this.player(uid);
    const now = this.clock.now();
    if (!isJie3(gateOf(p.level))) throw new GameError('这一关不是三道雷');
    const use = plan ?? autoPlan3(p);
    let pv: ReturnType<typeof preview3>;
    try {
      if (!Array.isArray(use) || use.length !== 3 || use.some((c) => !c || typeof c !== 'object')) throw new Error('要给三道雷各定一个应对');
      pv = preview3(p, use, now);
    } catch (e) {
      throw new GameError(e instanceof Error ? e.message : '应对不对');
    }
    return {
      ...pv,
      plan: use,
      fabao: Object.keys(p.inv).filter((id) => canOffer(p, id)).map((id) => ({ ...itemView(id), n: (p.inv[id] ?? 0) - (p.loadout.includes(id) ? 1 : 0) })).sort((a, b) => b.tier - a.tier),
      visitors: gateVisitors(this.w, p, now),
    };
  }
  jieAttempt(uid: string, plan: JiePlan) {
    return this.act(uid, (p, now) => {
      this.needAlive(p);
      let rng: Rng = new SeededRng(hashSeed(`${p.id}:gate:${now}:${p.uidSeq}`));
      if (this.forceGate) {
        const pv = preview3(p, plan, now);

        const seq = { ok: [0, 0, 0], hurt: [0, 0.99999, 0.99999], dying: [0, 0.99999, pv.failDeath + pv.failDying / 2], death: [0, 0.99999, pv.failDeath / 2] }[this.forceGate];
        rng = { nextFloat: () => seq.shift() ?? 0.5 };
        this.forceGate = null;
      }
      if (!Array.isArray(plan) || plan.length !== 3 || plan.some((c) => !c || typeof c !== 'object')) throw new Error('要给三道雷各定一个应对');
      const visit = gateVisit(this.w, p, now);
      const asked = plan.some((c) => c.kind === 'guard');
      const ev = attempt3(p, plan, now, rng, visit);
      if (asked) {
        for (const h of visit.helpers) {
          if (h.npc) continue;
          this.log(h.id, now, false, [{ kind: 'gate_helped', who: p.daohao }]);
          addTrust(p, h.id, TRUST_GAIN.guard);
        }
      }
      if (visit.foe && !visit.foe.npc) this.log(visit.foe.id, now, false, [{ kind: 'gate_raided', who: p.daohao, won: !visit.foe.won }]);
      this.gateRumors(p, now, ev);
      return ev;
    });
  }

  private joinRumor(name: string, now: number) {
    const n = (this.db.prepare("SELECT COUNT(*) AS n FROM rumors WHERE kind = 'join' AND at >= ?").get(atJst(resetDay(now), DAILY_RESET_HOUR)) as { n: number }).n;
    if (n + this.w.rumors.filter((r) => r.kind === 'join').length >= RUMOR_JOIN_PER_DAY) return;
    this.w.rumors.push({ at: now, kind: 'join', who: name, text: '' });
    this.flushRumors();
  }
  private gateRumors(p: Player, now: number, ev: GameEvent[]) {
    for (const e of ev) {

      if (e.kind === 'breakthrough' && (e.gate as number) < 3 && e.ok && !p.npc) this.w.rumors.push({ at: now, kind: 'tupo_ok', who: p.daohao, text: String(e.gate) });
      if (e.kind === 'breakthrough' && (e.gate as number) >= 3) this.w.rumors.push({ at: now, kind: e.ok ? 'jie_ok' : 'jie_fail', who: p.daohao, text: String(e.gate) });
      if (e.kind === 'feisheng') this.w.rumors.push({ at: now, kind: 'feisheng', who: p.daohao, text: '' });
      if (e.kind === 'death' && e.revived === false) this.w.rumors.push({ at: now, kind: 'death', who: p.daohao, text: '天劫' });
    }
  }

  private forceGate: 'ok' | 'hurt' | 'dying' | 'death' | null = null;

  testMijingChoice(uid: string, npc = false) {
    const p = this.player(uid);
    const st = p.stay ? this.w.stays.get(p.stay) : undefined;
    if (!st || st.status !== 'in') return { ok: false };
    const sp = st.stages.find((x) => !x.done && x.ref !== 'boss');

    const here = new Set(npcsAlive(this.w).filter((o) => realmOf(o.level) === st.realm && o.id !== st.mate?.pid).map((o) => o.npc));
    const def = npc ? NPC_EVENTS.find((x) => here.has(x.npc)) : (NPC_STAGES.find((x) => !(p.mjSeen ?? {})[x.id]) ?? NPC_STAGES[0]);
    if (!sp || !def) return { ok: false };
    sp.ref = def.id;
    sp.kind = 'npc';
    this.saveStay(st);
    return { ok: true, stage: def.title, npc: def.npc ?? null };
  }

  testYuan(uid: string, b: { make: string; npc?: string; en?: string; lingshi?: number; item?: string; nth?: number }) {
    return this.txn(() => {
      const p = this.player(uid);
      const now = this.clock.now();
      const o = (b.npc ? this.w.players.get(b.npc) : undefined) ?? [...this.w.players.values()].filter((x) => x.npc && !x.needRebirth && realmOf(x.level) === realmOf(p.level)).sort((x, y) => x.id.localeCompare(y.id))[b.nth ?? 0];
      if (b.make === 'after') {
        const id = Object.keys(QIYU_AFTER).sort()[0] as string;
        p.qiyu.push({ uid: `t${now}`, eventId: id, grantedAt: now, after: 'shan' });
        this.savePlayer(p);
        return { ok: true, event: id };
      }
      if (!o?.npc) throw new GameError('没有同境界的山中人物');
      if (b.en) (NPC_EN as Record<string, string>)[o.npc] = b.en;
      const today = calDay(now);
      const r = todayRealm(this.w, p, now);
      const show = { day: today, region: r.id, name: r.name };
      const owed = { lingshi: b.lingshi ?? 42, items: b.item ? [b.item] : [] };
      p.yuan = (p.yuan ?? []).filter((y) => y.npc !== o.npc);
      const mk = (y: Omit<Yuan, 'id' | 'npc' | 'name' | 'at' | 'until' | 'next'> & { until?: number }) => (p.yuan ??= []).push({ id: `y:t${p.yuan.length}${now % 1000}`, npc: o.npc as string, name: o.daohao, at: now, until: now + 10 * DAY, next: now + DAY, ...y });
      if (b.make === 'debt' || b.make === 'show') {
        addEnemy(p, o.id, now, 'fu');
        rememberNpc(p, o.npc, 'betray', now);
        mk({ kind: 'debt', why: 'betray', owed, tries: 0, ...(b.make === 'show' ? { show } : {}) });
      } else if (b.make === 'blood') {
        addEnemy(p, o.id, now, 'kill');
        rememberNpc(p, o.npc, 'slain', now);
        mk({ kind: 'blood', owed: { lingshi: 0, items: owed.items }, tries: 0, show });
      } else if (b.make === 'siege') {
        record(this.w, p.id, o.npc, 'kill', now - DAY);
        p.avengers = [{ npc: o.npc, saidAt: now - 3 * DAY }];
        mk({ kind: 'siege', tries: 0, ask: { kind: 'siege', at: now, until: now + DAY } });
      } else if (b.make === 'beg') {
        rememberNpc(p, o.npc, 'betray', now - 8 * DAY);
        setStatus(o, 'hurt', now, []);
        mk({ kind: 'beg', owed, ask: { kind: 'beg', at: now, until: now + 2 * DAY } });
      } else if (b.make === 'yao') {
        record(this.w, p.id, o.npc, 'help', now - DAY);
        setStatus(p, 'hurt', now, []);
        mk({ kind: 'repay', form: 'yao', ask: { kind: 'yao', at: now, until: now + 2 * DAY } });
      } else if (b.make === 'tongxing') {
        record(this.w, p.id, o.npc, 'help', now - DAY);
        mk({ kind: 'repay', form: 'tongxing', show });
      } else if (b.make === 'sangu') {
        mk({ kind: 'sangu', colds: 2 });
      } else if (b.make === 'meet') {
        record(this.w, p.id, o.npc, 'help', now - DAY);
        p.youliBack = { story: 'yl_b0_01', hours: 2, at: now, lingshi: 20, items: [], xiuwei: 0, meet: { npc: o.npc, name: o.daohao, mood: 'friend', pick: 1, effect: 'gift', lingshi: 20 } };
      } else throw new GameError('不认得这种摆法');
      this.savePlayer(p);
      this.saveWorldAll();
      return { ok: true, npc: o.npc, name: o.daohao };
    });
  }
  testNpcEn(npcId: string, en: string) {
    if (!['fu', 'ao', 'bao', 'ping'].includes(en)) return { ok: false };
    NPC_EN[npcId] = en as NpcEn;
    const sure = { fu: { betray: 1, cold: 0, grateful: 0 }, ao: { betray: 0, cold: 1, grateful: 0 }, bao: { betray: 0, cold: 0, grateful: 1 }, ping: { betray: 0, cold: 0, grateful: 0 } }[en as NpcEn];
    (NPC_REPAY as unknown as Record<string, { betray: number; cold: number; grateful: number }>)[en] = sure;
    (NPC_TEAM_ROB as unknown as Record<string, number>)[en] = en === 'fu' ? 1 : 0;
    return { ok: true };
  }
  testForceGate(outcome: string) {
    this.forceGate = (['ok', 'hurt', 'dying', 'death'] as const).find((x) => x === outcome) ?? null;
    return { forceGate: this.forceGate };
  }
  gateAttempt(uid: string, pills: string[]) {
    return this.act(uid, (p, now) => {
      this.needAlive(p);
      let rng: Rng = new SeededRng(hashSeed(`${p.id}:gate:${now}:${p.uidSeq}`));
      if (this.forceGate) {
        const pv = preview(p, pills, now);
        const seq = { ok: [0], hurt: [0.99999, 0.99999], dying: [0.99999, pv.failDeath + pv.failDying / 2], death: [0.99999, pv.failDeath / 2] }[this.forceGate];
        rng = { nextFloat: () => seq.shift() ?? 0.5 };
        this.forceGate = null;
      }

      if (isJie3(gateOf(p.level))) throw new Error('这一劫是三道雷，要先定三道的应对');
      const isJie = gateOf(p.level) >= 3;
      const visit = isJie ? gateVisit(this.w, p, now) : undefined;
      const ev = attempt(p, pills, now, rng, visit);
      if (visit) {
        for (const h of visit.helpers) {
          if (h.npc) continue;
          this.log(h.id, now, false, [{ kind: 'gate_helped', who: p.daohao }]);
          addTrust(p, h.id, TRUST_GAIN.guard);
        }
        if (visit.foe && !visit.foe.npc) this.log(visit.foe.id, now, false, [{ kind: 'gate_raided', who: p.daohao, won: !visit.foe.won }]);
      }
      this.gateRumors(p, now, ev);
      return ev;
    });
  }
  equip(uid: string, id: string) {
    return this.act(uid, (p, now) => equipGongfa(p, id, now));
  }
  use(uid: string, id: string) {
    return this.act(uid, (p, now) => useItem(p, id, now));
  }

  setBenming(uid: string, id: string | null) {
    return this.act(uid, (p) => setBenming(p, id));
  }
  setLoadout(uid: string, items: string[]) {
    return this.act(uid, (p) => {
      if (!Array.isArray(items) || items.length > 60) throw new GameError('badLoadout');
      for (const id of items) {
        const it = item(id);
        if (!['fabao', 'dan', 'cao', 'fu'].includes(it.cat)) throw new GameError('badLoadout');
      }

      if (items.some((id) => huTooWeak(p, id) && !p.loadout.includes(id))) throw new Error('化神以后，凡品、灵品的护身符挡不住了；要玄品以上的，只在秘境里得');
      p.loadout = items;
      return [{ kind: 'loadout', n: items.length }];
    });
  }

  testOpenInherit(uid: string) {
    return tx(this.db, () => {
      const p = this.player(uid);
      const now = this.clock.now();
      const ih = openOne(this.w, now, (id, ev, at) => this.log(id, at, false, ev), realmOf(p.level));
      this.saveWorldAllBoards();
      this.flushRumors();
      return { id: ih?.id ?? null };
    });
  }

  inheritEnter(uid: string, id: string, answer?: number) {
    return this.act(uid, (p, now) => enterInherit(this.w, p, String(id), typeof answer === 'number' ? answer : undefined, now));
  }

  autoLoadout(uid: string) {
    return this.setLoadout(uid, autoLoadout(this.player(uid)));
  }

  mijingEnter(uid: string, region: string | undefined, stance: string, target?: string, depth?: number, push?: string) {
    return this.act(uid, (p, now, out) => {
      this.needAlive(p);
      const t = target ? this.byPub(String(target)) : undefined;
      const d = depth === 0 || depth === 1 || depth === 2 ? depth : undefined;
      enterRegion(this.w, p, region ? String(region) : undefined, (stance === 'kill' ? 'kill' : 'spare') as Stance, now, out, t?.id, d, push === 'bold' ? 'bold' : 'safe');
      return [];
    });
  }

  teamInvite(uid: string, to: string, depth?: number, push?: string, stance?: string) {
    return this.act(uid, (p, now, out) => {
      this.needAlive(p);
      const d = depth === 0 || depth === 1 || depth === 2 ? depth : undefined;
      return teamInvite(this.w, p, this.who(String(to)).id, { depth: d, push: push === 'bold' ? 'bold' : 'safe', stance: stance === 'kill' ? 'kill' : 'spare' }, now, out);
    });
  }

  testLedger(uid: string, npc: string, kind: string, times = 1) {
    return tx(this.db, () => {
      const p = this.player(uid);
      for (let i = 0; i < times; i++) record(this.w, p.id, String(npc), kind as LedgerKind, this.clock.now());
      this.saveWorldAll();
      return { ok: true };
    });
  }

  npcAmends(uid: string, id: string) {
    return this.act(uid, (p, now) => amends(this.w, p, this.who(String(id)).id, now));
  }

  npcMediate(uid: string, id: string, via: string) {
    return this.act(uid, (p, now) => mediate(this.w, p, this.who(String(id)).id, this.who(String(via)).id, now));
  }

  giftNpc(uid: string, to: string, id: string) {
    return this.act(uid, (p, now) => giftNpc(this.w, p, this.who(String(to)), String(id), now));
  }

  private teamView(me: Player, now: number) {
    return {

      mates: mateCandidates(this.w, me, now).slice(0, 8).map((c) => ({ ...c, id: c.kind === 'npc' ? c.id : pubId(this.w.seed, c.id) })),
    };
  }

  mijingChoose(uid: string, option: number) {
    return this.act(uid, (p, now) => (chooseStage(this.w, p, Number(option), now), []));
  }

  zhidianTo(uid: string, to: string) {
    return this.act(uid, (p, now, out) => zhidian(p, this.byPub(String(to)), now, out));
  }

  private who(id: string): Player {
    const p = NPC_BY_ID.has(id) ? this.w.players.get(id) : this.byPub(id);
    if (!p) throw new GameError('notFound', 404);
    return p;
  }
  friendAsk(uid: string, to: string) {
    return this.act(uid, (p, now, out) => friendAsk(this.w, p, this.who(String(to)).id, now, out));
  }
  friendAnswer(uid: string, from: string, accept: boolean) {
    return this.act(uid, (p, now, out) => friendAnswer(this.w, p, this.who(String(from)).id, accept === true, now, out));
  }
  friendDrop(uid: string, id: string) {
    return this.act(uid, (p) => friendDrop(this.w, p, this.who(String(id)).id));
  }
  foeMark(uid: string, id: string) {
    return this.act(uid, (p) => foeMark(this.w, p, this.who(String(id)).id));
  }
  foeUnmark(uid: string, id: string) {
    return this.act(uid, (p) => foeUnmark(this.w, p, this.who(String(id)).id));
  }

  bonds(uid: string) {
    const me = this.player(uid);
    const now = this.clock.now();
    const face = (p: Player) => ({ id: p.npc ? p.id : pubId(this.w.seed, p.id), npc: !!p.npc, daohao: p.daohao, xingxiang: p.xingxiang, realmName: levelName(p.level), realm: realmOf(p.level) });
    const get = (id: string) => this.w.players.get(id);
    const asked = (o: Player) => (o.friendAsks ?? []).some((a) => a.from === me.id);
    const trust = (o: Player) => ({ mine: trustOf(me, o.id), his: trustOf(o, me.id) });
    return {
      max: { friends: FRIEND_MAX, foes: FOE_MAX },
      need: TRUST_NEED,
      friends: (me.friends ?? []).map(get).filter((p): p is Player => !!p).map((p) => ({ ...face(p), trust: trust(p) })),
      asks: (me.friendAsks ?? []).map((a) => get(a.from)).filter((p): p is Player => !!p).map(face),
      foes: (me.foes ?? []).map(get).filter((p): p is Player => !!p).map((p) => ({ ...face(p), gone: !!p.needRebirth })),

      npcAllies: alliesOf(this.w, me, now).filter((b) => b.npc).map((b) => ({ id: b.id, name: b.name, sworn: b.why === 'npc_sworn' })),
      haters: hatersOf(this.w, me, now).map((b) => ({ id: b.npc ? b.id : pubId(this.w.seed, b.id), npc: b.npc, name: b.name, why: b.why })),
      others: [...this.w.players.values()]
        .filter((p) => p.id !== me.id && !p.npc && !p.needRebirth && !(me.friends ?? []).includes(p.id))
        .map((p) => ({ ...face(p), asked: asked(p), foe: (me.foes ?? []).includes(p.id), sameRealm: realmOf(p.level) === realmOf(me.level), trust: trust(p), can: trustEnough(me, p) }))

        .sort((a, b) => b.trust.mine + b.trust.his - (a.trust.mine + a.trust.his) || Number(b.sameRealm) - Number(a.sameRealm) || a.daohao.localeCompare(b.daohao, 'zh')),
    };
  }

  private byPub(pub: string): Player | undefined {
    return [...this.w.players.values()].find((x) => pubId(this.w.seed, x.id) === pub);
  }

  mijingRetake(uid: string) {
    return this.act(uid, (p, now, out) => (retake(this.w, p, now, out), []));
  }
  mijingLeave(uid: string) {
    return this.act(uid, (p, now, out) => (leaveRegion(this.w, p, now, out), []));
  }

  bountyPost(uid: string, target: string, amount: number) {
    return this.act(uid, (p, now) => {
      const t = this.byPub(String(target));
      if (!t) throw new GameError('没有这个人');
      return postBounty(this.w, p, t.id, Number(amount), now);
    });
  }

  stay(uid: string, id: string) {
    const p = this.player(uid);
    const st = this.w.stays.get(id);
    if (!st || st.pid !== p.id) throw new GameError('notFound', 404);
    return stayView(st);
  }

  yuanAnswer(uid: string, yid: string, option: number) {
    return this.act(uid, (p, now, out) => answerYuan(this.w, p, String(yid), Number(option), now, out));
  }

  qiandao(uid: string) {

    return this.act(uid, (p, now) => qiandao(p, now).map((e) => (typeof e.got === 'string' ? { ...e, gotName: item(e.got).name, gotCat: item(e.got).cat } : e)));
  }
  qiyu(uid: string, quid: string, option: number) {
    return this.act(uid, (p, now) => chooseQiyu(p, quid, option, now, new SeededRng(hashSeed(`${p.id}:qiyu:${quid}`))));
  }
  decide(uid: string, kuid: string, kill: boolean) {
    return this.act(uid, (p, now) => {
      const k = p.pendingKills.find((x) => x.uid === kuid);
      if (!k) throw new GameError('nothingToDecide', 409);
      const target = this.w.players.get(k.targetId);
      const out = new Map<string, GameEvent[]>();
      decideKill(p, kuid, kill, target, now, out, this.w, new SeededRng(hashSeed(`${p.id}:zhan:${kuid}`)));

      for (const [id, oev] of out) {
        const o = id === p.id ? null : this.w.players.get(id);
        if (!o) continue;
        this.log(id, now, false, oev);
        this.savePlayer(o);
      }
      return out.get(p.id) ?? [];
    });
  }

  shop(uid: string) {
    return catalogFor(this.player(uid)).map((s) => ({ ...itemView(s.id), price: s.price }));
  }

  giftTo(uid: string, to: string, id: string) {
    return this.act(uid, (p, now, out) => gift(p, this.byPub(String(to)), String(id), now, out));
  }

  npcList(uid: string) {
    const me = this.player(uid);
    const now = this.clock.now();
    const myRealm = realmOf(me.level);
    const inst = instOf(calDay(now), myRealm);
    const order = { feud: 0, sworn: 1, friend: 2, grudge: 3, neutral: 4 } as const;
    return npcsAlive(this.w)
      .map((p) => {
        const def = NPC_BY_ID.get(p.npc as string) as NpcDef;
        const mood = attitudeOf(this.w, me.id, def.id, now);
        const st = p.stay ? this.w.stays.get(p.stay) : undefined;
        return { id: def.id, name: def.name, identity: def.identity, gender: def.gender, camp: def.camp, realm: realmOf(p.level), realmName: levelName(p.level), same: realmOf(p.level) === myRealm, inside: !!st && st.status === 'in' && st.inst === inst, mood, moodName: ATTITUDE_NAME[mood] };
      })
      .filter((x) => x.same || x.mood !== 'neutral')
      .sort((a, b) => order[a.mood] - order[b.mood] || Number(b.same) - Number(a.same) || Number(b.inside) - Number(a.inside) || a.name.localeCompare(b.name, 'zh'))

      .filter((x, i, arr) => x.mood !== 'neutral' || arr.slice(0, i).filter((y) => y.mood === 'neutral').length < 12);
  }

  npcDetail(uid: string, id: string) {
    const me = this.player(uid);
    const now = this.clock.now();
    const def = NPC_BY_ID.get(String(id));
    const p = def ? this.w.players.get(def.id) : undefined;
    if (!def || !p) throw new GameError('notFound', 404);
    const dead = this.w.npcs.dead[def.id];
    const appeared = (x: string) => this.w.players.has(x);
    const mood = attitudeOf(this.w, me.id, def.id, now);
    return {
      id: def.id,
      name: def.name,
      identity: def.identity,
      bio: def.bio,
      motto: def.motto,
      gender: def.gender,
      camp: def.camp,
      realmName: dead ? null : levelName(p.level),
      alive: !dead && !p.needRebirth,
      dead: dead ? { at: dead.at, by: dead.by ? (this.w.players.get(dead.by)?.daohao ?? null) : null, byMe: dead.by === me.id, lastWords: def.lastWords } : null,
      mood,
      moodName: ATTITUDE_NAME[mood],
      line: dead ? '' : npcLine(def, mood, now),
      foe: (me.foes ?? []).includes(def.id),

      vow: (() => {
        const a = (me.avengers ?? []).find((x) => x.npc === def.id);
        return a && !dead && mood === 'feud' ? { said: a.saidAt, strikes: a.saidAt + VOW_DELAY_MS, active: now >= a.saidAt + VOW_DELAY_MS } : null;
      })(),

      amends: !dead && (mood === 'feud' || mood === 'grudge') ? { cost: amendsCost(p), mediators: mediatorsFor(this.w, me, def.id, now) } : null,
      reasons: reasonsOf(this.w, me.id, def.id, now)
        .slice(0, 6)
        .map((r) => ({ kind: r.kind, at: r.at, good: r.score > 0, who: r.npc === def.id ? null : { name: NPC_BY_ID.get(r.npc)?.name ?? '', rel: r.rel } })),

      memory: (me.npcMem ?? []).filter((m) => m.npc === def.id).slice(-4).reverse().map((m) => ({ kind: m.kind, at: m.at })),
      ta: def.gender === 'f' ? '她' : '他',
      kin: kinOf(def.id)
        .filter((k) => k.id && appeared(k.id))
        .map((k) => ({ id: k.id, name: k.name, rel: k.rel, dead: !!this.w.npcs.dead[k.id as string] })),
    };
  }

  daoyou(uid: string) {
    const me = this.player(uid);
    const now = this.clock.now();
    const r = raidOf(me, now);
    const day = resetDay(now);
    const owedFrom = r.owed ? this.w.players.get(r.owed.from) : undefined;
    const rows = [...this.w.players.values()]
      .filter((p) => p.id !== me.id && !p.needRebirth && !p.npc && isActive(p, now))
      .map((p) => {
        const same = realmOf(p.level) === realmOf(me.level);
        const revenge = !!r.owed && r.owed.from === p.id;
        const no = same ? raidBlock(me, p, now, revenge) : '要同一个大境界';
        const pv = same && me.level >= RAID_MIN_LEVEL && p.level >= RAID_MIN_LEVEL ? raidPreview(me, p, now, revenge) : null;
        return {
          id: pubId(this.w.seed, p.id),
          daohao: p.daohao,
          xingxiang: p.xingxiang,
          realmName: levelName(p.level),
          titles: titlesOf(p, now),
          same,
          friend: isFriend(me, p.id),
          foe: isFoe(me, p),
          lundaoNo: lundaoBlock(me, p, now),
          raidNo: no,
          revenge,
          pWin: pv ? pv.pWin : null,
          qi: pv ? pv.qi : null,
          stock: pv ? pv.stock : null,
          heavyOk: isFoe(me, p) && raidOf(p, now).heavyWeek !== weekKey(now),
        };
      })
      .sort((a, b) => Number(b.revenge) - Number(a.revenge) || Number(b.same) - Number(a.same) || a.daohao.localeCompare(b.daohao, 'zh'));
    return {
      now,
      rows,
      me: {
        canRaid: me.level >= RAID_MIN_LEVEL,
        lundaoLeft: Math.max(0, LUNDAO_GIVE_PER_DAY - (me.lundao?.day === day ? me.lundao.gave : 0)),
        raidLeft: Math.max(0, RAID_PER_DAY - r.made),
        shieldUntil: shielded(me, now) ? Math.max(r.shieldUntil, now + 60_000) : 0,
        owed: r.owed && owedFrom ? { id: pubId(this.w.seed, owedFrom.id), name: r.owed.name, qi: r.owed.qi, until: r.owed.until } : null,
      },
    };
  }
  lundaoWith(uid: string, to: string) {
    return this.act(uid, (p, now, out) => lundao(p, this.byPub(String(to)), now, out));
  }
  raidOn(uid: string, to: string, heavy: boolean, revenge: boolean) {
    return this.act(uid, (p, now, out) => {
      let rng: Rng = new SeededRng(hashSeed(`${p.id}:raid:${now}:${p.uidSeq}`));
      if (this.forceRaid) {

        const roll = this.forceRaid === 'win' ? 0 : 0.99999;
        rng = { nextFloat: () => roll };
        this.forceRaid = null;
      }
      return raid(this.w, p, this.byPub(String(to)), now, rng, out, { heavy, revenge });
    });
  }
  private forceRaid: 'win' | 'lose' | null = null;

  testForceRaid(outcome: string) {
    this.forceRaid = (['win', 'lose'] as const).find((x) => x === outcome) ?? null;
    return { forceRaid: this.forceRaid };
  }

  playersList(uid: string) {
    const me = this.player(uid);
    const now = this.clock.now();

    const seen = (p: Player) => {
      const d = now - (p.activeAt ?? p.lastSeenAt ?? p.createdAt);
      return d <= 86_400_000 ? 0 : d <= ACTIVE_WINDOW_MS ? 1 : 2;
    };
    return [...this.w.players.values()]
      .filter((p) => p.id !== me.id && !p.needRebirth && !p.npc)
      .map((p) => ({ id: pubId(this.w.seed, p.id), daohao: p.daohao, xingxiang: p.xingxiang, realmName: levelName(p.level), titles: [...titlesOf(p, now), ...(p.heirs ?? []).map((n) => `${n}传人`)], realm: realmOf(p.level), canZhidian: zhidianBlock(me, p, now) === null, seen: seen(p) }))
      .sort((a, b) => a.seen - b.seen || a.daohao.localeCompare(b.daohao, 'zh'));
  }
  buy(uid: string, id: string, qty: number) {
    return this.act(uid, (p) => buy(p, id, qty));
  }
  sell(uid: string, id: string, qty: number) {
    return this.act(uid, (p) => sell(p, id, qty));
  }

  private buybackList(pid: string, now: number) {
    const rows = this.db.prepare('SELECT id, at, data FROM logs WHERE player_id = ? AND at >= ? ORDER BY id DESC LIMIT 300').all(pid, now - BUYBACK_MS) as { id: number; at: number; data: string }[];
    const done = new Set<number>();
    const out: { logId: number; at: number; id: string; qty: number; cost: number }[] = [];
    for (const r of rows) {
      const d = JSON.parse(r.data) as GameEvent;
      if (d.kind === 'shop_buyback') done.add(d.ref as number);
    }
    for (const r of rows) {
      const d = JSON.parse(r.data) as GameEvent;
      if (d.kind === 'shop_sell' && !done.has(r.id) && out.length < 10) out.push({ logId: r.id, at: r.at, id: d.id as string, qty: d.qty as number, cost: d.gain as number });
    }
    return out.map((x) => ({ ...x, item: itemView(x.id) }));
  }
  buyback(uid: string, logId: number) {
    return this.act(uid, (p, now) => {
      const row = this.db.prepare('SELECT player_id, at, data FROM logs WHERE id = ?').get(logId) as { player_id: string; at: number; data: string } | undefined;
      if (!row || row.player_id !== p.id) throw new GameError('notFound', 404);
      const d = JSON.parse(row.data) as GameEvent;
      if (d.kind !== 'shop_sell') throw new GameError('notFound', 404);
      if (now - row.at > BUYBACK_MS) throw new GameError('买回期限已过');
      if (!this.buybackList(p.id, now).some((x) => x.logId === logId)) throw new GameError('已经买回过了');
      return buyback(p, d.id as string, d.qty as number, d.gain as number, logId);
    });
  }
  youliStart(uid: string, hours: number) {
    return this.act(uid, (p, now) => (this.needAlive(p), startYouli(p, Math.floor(Number(hours)), now)));
  }
  youliRecall(uid: string) {
    return this.act(uid, (p, now) => recallYouli(p, now));
  }
  youliAck(uid: string) {
    return this.act(uid, (p) => ackYouli(p));
  }
  bingjie(uid: string) {
    return this.act(uid, (p, now) => (bingjie(p, now), [{ kind: 'bingjie' }]));
  }

  rumors(limit = 80) {
    return this.db.prepare('SELECT id, at, kind, who, text FROM rumors WHERE at > ? ORDER BY id DESC LIMIT ?').all(this.clock.now() - RUMOR_PAGE_DAYS * 86_400_000, limit);
  }
  xingxiangList() {
    return XINGXIANG;
  }

  createOrder(uid: string, product: string) {
    if (!this.payOpen) throw new GameError('payClosed', 403);
    return tx(this.db, () => {
      this.tickInner();
      const p = this.player(uid);
      if (!(product in PAY_PRODUCTS)) throw new GameError('badProduct');
      const why = canBuy(p, product as Product, this.clock.now());
      if (why) throw new GameError(why, 409);
      const id = `o${this.clock.now().toString(36)}${randomBytes(6).toString('hex')}`.slice(0, 32);
      this.db.prepare('INSERT INTO orders(id, player_id, product, status, created_at) VALUES(?, ?, ?, ?, ?)').run(id, p.id, product, 'created', this.clock.now());
      const price = PAY_PRODUCTS[product as Product].priceCents;
      return { orderId: id, payParams: this.im.payParams(id, product, price) };
    });
  }

  payCallback(body: { orderId: string; status: string; sign: string }) {
    if (!this.payOpen) throw new GameError('payClosed', 403);
    if (!this.im.verifyPayCallback(body)) throw new GameError('badSign', 403);
    return tx(this.db, () => {
      const o = this.db.prepare('SELECT id, player_id, product, status FROM orders WHERE id = ?').get(body.orderId) as { id: string; player_id: string; product: Product; status: string } | undefined;
      if (!o) throw new GameError('noOrder', 404);
      if (o.status === 'delivered') return { ok: true, duplicate: true };
      if (body.status !== 'paid') {
        this.db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(body.status, o.id);
        return { ok: true };
      }
      this.tickInner();
      const p = this.w.players.get(o.player_id);
      if (!p) throw new GameError('noPlayer', 404);
      const now = this.clock.now();
      this.log(p.id, now, false, catchUp(p, now, this.w));
      const ev = deliver(p, o.product, now);
      this.log(p.id, now, true, [{ kind: 'paid', product: o.product, orderId: o.id }, ...ev]);
      this.savePlayer(p);
      this.db.prepare("UPDATE orders SET status = 'delivered', delivered_at = ? WHERE id = ?").run(now, o.id);
      return { ok: true, duplicate: false };
    });
  }
  orderStatus(uid: string, orderId: string) {
    const p = this.player(uid);
    const o = this.db.prepare('SELECT id, product, status FROM orders WHERE id = ? AND player_id = ?').get(orderId, p.id);
    if (!o) throw new GameError('noOrder', 404);
    return o;
  }

  testPatch(uid: string, patch: { level?: number; week?: { e?: number; shan?: number; jin?: number; duobao?: number }; xiuwei?: number | 'full'; shane?: number; lingshi?: number; items?: Record<string, number>; status?: 'hurt' | 'dying'; die?: boolean; killFrom?: string; maimBy?: string; trust?: Record<string, number>; tripped?: boolean; noNewbie?: boolean; qi?: number; kills?: number; slainByNpc?: string }) {
    return tx(this.db, () => {
      const p = this.player(uid);
      if (patch.tripped !== undefined) p.mjFirstDone = patch.tripped;
      const now = this.clock.now();
      bank(p, now);
      if (patch.level !== undefined) p.level = patch.level;

      if (patch.week) {
        const wk = resetWeek(now);
        if (p.week.key !== wk) p.week = { key: wk, duobao: 0, e: 0, shan: 0, jin: 0 };
        Object.assign(p.week, patch.week);
      }
      if (patch.noNewbie) p.newbieUntil = 0;
      if (patch.qi !== undefined) p.dantian.qi = patch.qi;
      if (patch.kills) for (let i = 0; i < patch.kills; i++) p.kills.push({ at: now - i * 60_000, victim: `test_victim_${i}` });
      if (patch.trust) for (const [u, n] of Object.entries(patch.trust)) (p.trust ??= {})[this.player(u).id] = n;
      if (patch.xiuwei !== undefined) p.xiuwei = patch.xiuwei === 'full' ? need(p.level) : patch.xiuwei;
      if (patch.shane !== undefined) p.shane = patch.shane;
      if (patch.lingshi !== undefined) p.lingshi = patch.lingshi;
      for (const [id, n] of Object.entries(patch.items ?? {})) addItem(p, id, n);
      if (patch.status) setStatus(p, patch.status, now, []);
      if (patch.xiuwei === 'full') markGateFull(p, now);
      if (patch.die) die(p, 'jie', now, []);
      if (patch.killFrom) {
        const winner = this.player(patch.killFrom);
        winner.pendingKills.push({ uid: `${winner.id}.t${now}`, targetId: p.id, targetName: p.daohao, until: now + 48 * 3_600_000 });
        this.savePlayer(winner);
        this.log(winner.id, now, false, [{ kind: 'encounter', type: 'fight', other: p.daohao, otherCamp: p.shane <= -100 ? 'mo' : 'san', won: true }]);
        this.log(p.id, now, false, [{ kind: 'encounter', type: 'fight', other: winner.daohao, otherCamp: 'zheng', won: false }]);
      }
      if (patch.maimBy) {

        const winner = this.player(patch.maimBy);
        setStatus(p, 'dying', now, []);
        addEnemy(p, winner.id, now, 'maim');
        this.log(p.id, now, false, [{ kind: 'mijing_fight', region: 'lanruo', name: '兰若寺', vs: winner.daohao, vsId: winner.id, won: false, aggressor: false, outcome: 'dying', block: null, killer: true }]);
      }
      if (patch.slainByNpc) {

        const def = NPC_BY_ID.get(patch.slainByNpc);
        if (def) {
          die(p, 'zhan', now, []);
          rememberNpc(p, def.id, 'slain', now);
          p.slainBy = { npc: def.id, at: now };

          this.log(p.id, now, false, [
            { kind: 'mijing_fight', region: 'lanruo', name: '兰若寺', vs: def.name, vsId: def.id, won: false, aggressor: false, outcome: 'death', block: null, killer: true, loot: [] },
            { kind: 'slain', by: def.name, byId: def.id, at: now, revived: false, loot: [] },
            { kind: 'death', cause: 'zhan', revived: false, level: p.level },
            { kind: 'mijing_result', region: 'lanruo', name: '兰若寺', reason: 'kicked', kicked: true, dead: true, left: false, alone: false, treasure: false, items: [], lingshi: 12, lilian: 34, stages: [] },
          ]);
        }
      }
      this.savePlayer(p);
      return { ok: true };
    });
  }

  private housekeptAt = 0;
  housekeep(): void {
    const now = this.clock.now();
    if (now - this.housekeptAt < 3_600_000) return;
    this.housekeptAt = now;
    this.db.prepare('DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at <= ?').run(now);
    this.db.prepare('DELETE FROM idem WHERE created_at < ?').run(now - IDEM_KEEP_MS);
  }
  idemGet(uid: string, key: string): { bodyHash: string; response: string } | null {
    const r = this.db.prepare('SELECT body_hash, response FROM idem WHERE uid = ? AND key = ?').get(uid, key) as { body_hash: string; response: string } | undefined;
    return r ? { bodyHash: r.body_hash, response: r.response } : null;
  }
  idemPut(uid: string, key: string, bodyHash: string, response: string) {
    this.db.prepare('INSERT OR IGNORE INTO idem(key, uid, body_hash, response, created_at) VALUES(?, ?, ?, ?, ?)').run(key, uid, bodyHash, response, this.clock.now());
  }
}
