import { BASE_LOOT_TIER, MO_GONGFA_DAILY_SHANE, QIYU_AFTER_DAYS, QIYU_BAD_MULT, QIYU_BIG_CHANCE, QIYU_BIG_MULT, QIYU_MAX_PENDING, QIYU_NO_REPEAT_DAYS, QIYU_REVISIT_DAYS, DAY } from './config.ts';
import { QIYU, QIYU_AFTER, type QiyuAfter, type QiyuEffects, type QiyuEvent, type QiyuOutcome, item } from './content.ts';
import { hashSeed } from './rng.ts';
import type { GameEvent } from './events.ts';
import { type Player, activeGongfa, addItem, bank, campOf, grantXiuweiHours, nextUid, realmOf, setStatus } from './player.ts';
import { type Rng, pick, pickWeighted } from './rng.ts';
import { rollItem } from './mijing.ts';

export function applyShane(p: Player, delta: number, events: GameEvent[], now?: number): void {
  if (delta === 0) return;
  const before = campOf(p);
  if (now !== undefined) bank(p, now);
  p.shane += delta;
  events.push({ kind: 'shane', delta, value: p.shane });
  const after = campOf(p);
  if (after !== before) events.push({ kind: 'camp', from: before, to: after });
}

export function isJiyuan(e: { id: string }): boolean {
  return e.id.startsWith('qy_jy_');
}
export function drawQiyu(p: Player, now: number, rng: Rng, noJiyuan = false): QiyuEvent | null {
  const realm = realmOf(p.level);

  const once = (e: QiyuEvent) => isJiyuan(e) && (noJiyuan || p.qiyuSeen[e.id] !== undefined);
  const fresh = QIYU.filter((e) => e.minRealm <= realm && !once(e) && (p.qiyuSeen[e.id] === undefined || now - (p.qiyuSeen[e.id] as number) > QIYU_NO_REPEAT_DAYS * DAY));
  const pool = fresh.length ? fresh : QIYU.filter((e) => e.minRealm <= realm && !once(e));
  if (!pool.length) return null;
  return pickWeighted(rng, pool, (x) => x.weight ?? 1);
}

export function grantQiyu(p: Player, now: number, rng: Rng, events: GameEvent[], noJiyuan = false): void {
  if (p.qiyu.length >= QIYU_MAX_PENDING) return;

  const afters = p.qiyuAfter ?? [];
  const ai = afters.findIndex((a) => a.due <= now && QIYU_AFTER[a.eventId]?.[a.opt]);
  if (ai >= 0) {
    const a = afters.splice(ai, 1)[0] as NonNullable<Player['qiyuAfter']>[number];
    const f = QIYU_AFTER[a.eventId]?.[a.opt] as QiyuAfter;
    p.qiyu.push({ uid: nextUid(p), eventId: a.eventId, grantedAt: now, after: a.opt });
    events.push({ kind: 'qiyu_new', eventId: a.eventId, title: f.title, after: a.opt });
    return;
  }

  const missed = p.qiyuMissed ?? [];
  const mi = missed.findIndex((m) => m.due <= now && QIYU.some((x) => x.id === m.eventId));
  if (mi >= 0) {
    const m = missed.splice(mi, 1)[0] as { eventId: string; due: number };
    const ev0 = QIYU.find((x) => x.id === m.eventId) as QiyuEvent;
    const again = rng.nextFloat() < QIYU_BIG_CHANCE ? 'big' : 'bad';
    p.qiyuSeen[ev0.id] = now;
    p.qiyu.push({ uid: nextUid(p), eventId: ev0.id, grantedAt: now, again });
    events.push({ kind: 'qiyu_new', eventId: ev0.id, title: ev0.title, again });
    return;
  }
  const e = drawQiyu(p, now, rng, noJiyuan);
  if (!e) return;
  p.qiyuSeen[e.id] = now;
  p.qiyu.push({ uid: nextUid(p), eventId: e.id, grantedAt: now });
  events.push({ kind: 'qiyu_new', eventId: e.id, title: e.title });
}

export function chooseQiyu(p: Player, uid: string, optionIdx: number, now: number, rng: Rng): GameEvent[] {
  const i = p.qiyu.findIndex((q) => q.uid === uid);
  if (i < 0) throw new Error('no such qiyu');
  const pend = p.qiyu[i] as (typeof p.qiyu)[number];
  const e = QIYU.find((x) => x.id === pend.eventId);
  if (!e) throw new Error('qiyu content missing');

  if (pend.after) {
    const af = QIYU_AFTER[e.id]?.[pend.after];
    const ao = af?.options[Math.min(optionIdx, (af?.options.length ?? 1) - 1)];
    if (!af || !ao) throw new Error('qiyu content missing');
    p.qiyu.splice(i, 1);
    const o = pickWeighted(rng, ao.outcomes as QiyuOutcome[], (x) => x.weight);
    const res: Record<string, unknown> = { kind: 'qiyu_result', eventId: e.id, title: af.title, option: ao.label, choice: pend.after, text: o.text, after: pend.after };
    const ev2: GameEvent[] = [res as GameEvent];
    applyEffects(p, o.effects ?? {}, res, ev2, now, rng);
    return ev2;
  }
  const opt = e.options[optionIdx];
  if (!opt) throw new Error('bad option');
  if (opt.kind === 'none' && pend.again === 'bad') throw new Error('这回躲不开了');
  p.qiyu.splice(i, 1);
  const ev: GameEvent[] = [];
  if (opt.kind === 'none') {

    const blank = opt.outcomes.find((o) => !o.effects || !(o.effects.shane || o.effects.lingshi || o.effects.xiuweiHours || o.effects.item || o.effects.hurt));
    const first = !pend.again;
    if (first) (p.qiyuMissed ??= []).push({ eventId: e.id, due: now + QIYU_REVISIT_DAYS * DAY });
    ev.push({ kind: 'qiyu_result', eventId: e.id, title: e.title, option: opt.label, choice: 'none', text: blank?.text ?? '你走了过去，没有回头。', missed: first });
    return ev;
  }
  const out = pickWeighted(rng, opt.outcomes, (o) => o.weight);
  const f0 = out.effects ?? {};

  const k = pend.again === 'big' ? QIYU_BIG_MULT : pend.again === 'bad' ? QIYU_BAD_MULT : 1;
  const up = (n: number | undefined) => (n && n > 0 ? Math.max(1, Math.round(n * k)) : n);
  const f = { ...f0, lingshi: up(f0.lingshi), xiuweiHours: up(f0.xiuweiHours) };
  const res: Record<string, unknown> = { kind: 'qiyu_result', eventId: e.id, title: e.title, option: opt.label, choice: opt.kind, text: out.text, again: pend.again };
  ev.push(res as GameEvent);
  applyEffects(p, f, res, ev, now, rng);

  const main = opt.outcomes.reduce((a, b) => (b.weight > a.weight ? b : a));
  if (!p.npc && !pend.again && out === main && (opt.kind === 'shan' || opt.kind === 'e') && QIYU_AFTER[e.id]?.[opt.kind] && !(p.qiyuAfter ?? []).some((a) => a.eventId === e.id)) {
    const span = QIYU_AFTER_DAYS[1] - QIYU_AFTER_DAYS[0] + 1;
    (p.qiyuAfter ??= []).push({ eventId: e.id, opt: opt.kind, due: now + (QIYU_AFTER_DAYS[0] + (hashSeed(`${p.id}:after:${e.id}:${Math.floor(now / DAY)}`) % span)) * DAY });
  }
  return ev;
}

function applyEffects(p: Player, f: QiyuEffects, res: Record<string, unknown>, ev: GameEvent[], now: number, rng: Rng): void {
  if (f.shane) applyShane(p, f.shane, ev, now);
  if (f.lingshi) {
    const d = Math.max(-p.lingshi, f.lingshi);
    p.lingshi += d;
    res.lingshi = d;
  }
  if (f.xiuweiHours) res.xiuwei = grantXiuweiHours(p, f.xiuweiHours, now, ev);
  if (f.item) {
    const tier = Math.max(0, Math.min(5, (BASE_LOOT_TIER[realmOf(p.level)] as number) + f.item.tierOffset));
    const id = rollItem(p.level, tier, rng, f.item.type, f.item.path ? activeGongfa(p).qi : undefined);
    addItem(p, id);
    res.item = id;
  }
  if (f.hurt) setStatus(p, 'hurt', now, ev);
}

export function moGongfaTick(p: Player, events: GameEvent[], now: number): void {
  if (item(p.gongfa).mo === true) {
    const n = events.length;
    applyShane(p, MO_GONGFA_DAILY_SHANE, events, now);

    for (let i = n; i < events.length; i++) if ((events[i] as GameEvent).kind === 'shane') (events[i] as GameEvent).passive = true;
  }
}
