import { amends, amendsCost } from './bonds.ts';
import { calDay, realmOn } from './calendar.ts';
import { duelWinProb, powerOf } from './combat.ts';
import {
  BEG_AGAIN,
  BEG_AGAIN_TAKE,
  BEG_GONE,
  BEG_MEM_MS,
  BEG_THANKS,
  DAY,
  REVENGE_BONUS,
  VOW_DELAY_MS,
  YUAN_ASK_MS,
  YUAN_DEBT_BEG_MS,
  YUAN_KEEP_MS,
  YUAN_MAX,
  YUAN_REPAY_DAILY,
  YUAN_REPAY_EVERY_MS,
  YUAN_SIEGE_AFTER_MS,
  YUAN_SIEGE_GAP_MS,
  YUAN_SIEGE_QUIET_MS,
  YUAN_SPROUT_EVERY_MS,
  YUAN_TRIES,
} from './config.ts';
import { decideKill } from './encounter.ts';
import type { GameEvent } from './events.ts';
import type { NpcState } from './npc.ts';
import { type LedgerEntry, NPC_BY_ID, attitudeOf, npcEnOf, record } from './ledger.ts';
import { type Out, addEnemy, isEnemy } from './nemesis.ts';
import { type Player, heal, isActive, nextUid, realmOf, rememberNpc, setStatus, statusAt } from './player.ts';
import { type RegionWorld, isEarly } from './region.ts';
import { SeededRng, hashSeed } from './rng.ts';
import { addDays } from './time.ts';
import { type Yuan, closeYuan, gapMs, openYuan, recover, yuanList, yuanOf } from './yuan.ts';

export type EnWorld = RegionWorld & { ledger: LedgerEntry[]; npcs?: NpcState };
const alive = (o: Player | undefined): o is Player => !!o && !o.needRebirth;
const rollOf = (w: EnWorld, key: string): SeededRng => new SeededRng(hashSeed(`${w.seed}:enyuan:${key}`));
const rumor = (w: EnWorld, now: number, who: string, text: string) => w.rumors.push({ at: now, kind: 'yuan', who, text });

function duel(w: EnWorld, p: Player, o: Player, now: number, key: string, bonus = 0): { won: boolean; winP: number } {
  const winP = duelWinProb(powerOf(p, now), powerOf(o, now), bonus);
  return { won: rollOf(w, key).nextFloat() < winP, winP };
}

const shielded = (p: Player, now: number): boolean => now < (p.newbieUntil ?? 0) || now < p.protectUntil || isEarly(p.level);

export function enyuanStep(w: EnWorld, now: number, out: Out): boolean {
  let changed = false;
  const today = calDay(now);
  for (const p of w.players.values()) {
    if (p.npc || p.needRebirth) continue;
    const active = isActive(p, now);
    if (!yuanList(p).length && !active) continue;
    for (const y of [...yuanList(p)]) {
      const o = w.players.get(y.npc);
      if (!alive(o)) {
        const dead = w.npcs?.dead?.[y.npc];
        const by = dead?.by ? (w.players.get(dead.by)?.daohao ?? null) : null;
        out(p.id, closeYuan(p, y, 'dead', now, { by, byReal: !!dead?.by && !w.players.get(dead.by)?.npc }));
        changed = true;
      } else if (y.ask && now >= y.ask.until) {
        for (const e of answerYuan(w, p, y.id, y.ask.kind === 'siege' ? 2 : 1, now, out, true)) out(p.id, e);
        changed = true;
      } else if (now >= y.until) {
        out(p.id, closeYuan(p, y, y.kind === 'debt' || y.kind === 'blood' ? 'let' : 'faded', now));
        changed = true;
      } else if (y.show && today > y.show.day) {

        if (y.kind === 'repay') out(p.id, closeYuan(p, y, 'missed', now));
        else {
          y.show = undefined;
          y.next = now;
        }
        changed = true;
      }
    }
    if (!active || p.yuanDay === today) continue;
    let fired = false;
    const due = yuanList(p)
      .filter((y) => !y.ask && !y.show && now >= y.next)
      .sort((a, b) => a.next - b.next);
    for (const y of due) {
      if (beat(w, p, y, now, out)) {
        fired = true;
        break;
      }
    }

    if (!fired && now >= (p.yuanTryAt ?? 0)) {
      p.yuanTryAt = now + YUAN_SPROUT_EVERY_MS;
      fired = sprout(w, p, now, out);
    }
    if (fired) {
      p.yuanDay = today;
      changed = true;
    }
  }
  return changed;
}

function beat(w: EnWorld, p: Player, y: Yuan, now: number, out: Out): boolean {
  const o = w.players.get(y.npc);
  if (!alive(o)) return false;
  const today = calDay(now);
  if (y.kind === 'debt' || y.kind === 'blood') {
    const rp = realmOf(p.level);
    const rn = realmOf(o.level);
    const fu = npcEnOf(y.npc) === 'fu';
    if (rn < rp) {

      if (y.kind === 'debt' && fu) {
        const got = recover(p, o, y);
        out(p.id, closeYuan(p, y, 'sent', now, got));
        return true;
      }
      y.next = now + DAY;
      return false;
    }
    if (rn > rp) {
      y.next = now + DAY;
      return false;
    }
    if (y.kind === 'debt' && now - y.at >= YUAN_DEBT_BEG_MS) {

      if (!fu) {
        out(p.id, closeYuan(p, y, 'let', now));
        return true;
      }
      y.kind = 'beg';
      y.show = undefined;
      y.until = now + YUAN_ASK_MS;
      y.ask = { kind: 'beg', at: now, until: now + YUAN_ASK_MS };
      (p.yuanSeen ??= {})[`beg:${y.npc}`] = now;
      if (statusAt(o, now) === 'ok') setStatus(o, 'hurt', now, []);
      out(p.id, { kind: 'yuan', line: 'beg', beat: 'ask', npc: y.npc, name: y.name, owed: y.owed?.lingshi ?? 0, owedItems: y.owed?.items ?? [] });
      return true;
    }
    if (p.stay) return false;
    const day = addDays(today, 1);
    const r = realmOn(w.seed, rp, day);
    y.show = { day, region: r.id, name: r.name };
    out(p.id, { kind: 'yuan', line: y.kind, beat: 'show', npc: y.npc, name: y.name, day, region: r.id, regionName: r.name, owed: y.owed?.lingshi ?? 0, owedItems: y.owed?.items ?? [] });
    return true;
  }
  if (y.kind === 'siege') {

    if (p.stay || (p.youli && now < p.youli.end)) return false;
    y.ask = { kind: 'siege', at: now, until: now + DAY };
    out(p.id, { kind: 'yuan', line: 'siege', beat: 'ask', npc: y.npc, name: y.name, round: (y.tries ?? 0) + 1, cost: amendsCost(o) });
    return true;
  }
  return false;
}

function sprout(w: EnWorld, p: Player, now: number, out: Out): boolean {
  const today = calDay(now);
  const seen = (p.yuanSeen ??= {});
  const home = !p.stay && !(p.youli && now < p.youli.end);

  if (home && !shielded(p, now)) {
    for (const a of p.avengers ?? []) {
      const o = w.players.get(a.npc);
      if (!alive(o) || yuanOf(p, a.npc) || realmOf(o.level) < realmOf(p.level)) continue;
      const wait = VOW_DELAY_MS + YUAN_SIEGE_AFTER_MS + DAY * rollOf(w, `siegewait:${p.id}:${a.npc}:${a.saidAt}`).nextFloat();
      if (now - a.saidAt < wait) continue;
      if (seen[`siege:${a.npc}`] !== undefined && now - (seen[`siege:${a.npc}`] as number) < YUAN_SIEGE_QUIET_MS) continue;
      if (attitudeOf(w, p.id, a.npc, now) !== 'feud') continue;
      const y = openYuan(p, { kind: 'siege', npc: a.npc, name: o.daohao, at: now, until: now + YUAN_KEEP_MS, next: now, tries: 0, ask: { kind: 'siege', at: now, until: now + DAY } });
      if (!y) continue;
      out(p.id, { kind: 'yuan', line: 'siege', beat: 'ask', npc: a.npc, name: o.daohao, round: 1, cost: amendsCost(o) });
      return true;
    }
  }

  for (const m of [...(p.npcMem ?? [])].reverse()) {
    if ((m.kind !== 'betray' && m.kind !== 'rob') || now - m.at > BEG_MEM_MS || npcEnOf(m.npc) !== 'fu') continue;
    const o = w.players.get(m.npc);
    if (!alive(o) || yuanOf(p, m.npc) || seen[`beg:${m.npc}`] !== undefined || statusAt(o, now) === 'ok') continue;
    const y = openYuan(p, { kind: 'beg', npc: m.npc, name: o.daohao, at: now, until: now + YUAN_ASK_MS, next: now, owed: { lingshi: 0, items: [] }, ask: { kind: 'beg', at: now, until: now + YUAN_ASK_MS } });
    if (!y) break;
    seen[`beg:${m.npc}`] = now;
    out(p.id, { kind: 'yuan', line: 'beg', beat: 'ask', npc: m.npc, name: o.daohao, owed: 0, owedItems: [] });
    return true;
  }

  if (yuanList(p).length >= YUAN_MAX) return false;
  const rng = rollOf(w, `repay:${p.id}:${today}`);
  if (rng.nextFloat() >= YUAN_REPAY_DAILY) return false;
  const cands: Player[] = [];
  for (const o of w.players.values()) {
    if (!o.npc || !alive(o) || !NPC_BY_ID.has(o.npc) || yuanOf(p, o.npc)) continue;
    if (seen[o.npc] !== undefined && now - (seen[o.npc] as number) < YUAN_REPAY_EVERY_MS) continue;
    const mood = attitudeOf(w, p.id, o.npc, now);
    if (mood === 'sworn' || (mood === 'friend' && npcEnOf(o.npc) === 'bao')) cands.push(o);
  }
  if (!cands.length) return false;
  cands.sort((a, b) => a.id.localeCompare(b.id));
  const o = cands[Math.floor(rng.nextFloat() * cands.length)] as Player;
  const npc = o.npc as string;

  if (statusAt(p, now) !== 'ok') {
    const y = openYuan(p, { kind: 'repay', form: 'yao', npc, name: o.daohao, at: now, until: now + YUAN_ASK_MS, next: now, ask: { kind: 'yao', at: now, until: now + YUAN_ASK_MS } });
    if (!y) return false;
    seen[npc] = now;
    out(p.id, { kind: 'yuan', line: 'repay', beat: 'yao', npc, name: o.daohao, status: statusAt(p, now) });
    return true;
  }

  const foes = [...w.players.values()]
    .filter((q) => q.npc && q.id !== o.id && alive(q) && realmOf(q.level) === realmOf(o.level))
    .filter((q) => isEnemy(p, q.id) || ['feud', 'grudge'].includes(attitudeOf(w, p.id, q.npc as string, now)))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (foes.length) {
    const q = foes[Math.floor(rng.nextFloat() * foes.length)] as Player;
    const { won } = duel(w, o, q, now, `chutou:${p.id}:${npc}:${q.id}:${today}`);
    seen[npc] = now;
    if (won) {
      setStatus(q, 'hurt', now, []);
      record(w, p.id, q.npc as string, 'mediate', now);
      p.avengers = (p.avengers ?? []).filter((a) => a.npc !== q.npc);
      rememberNpc(p, npc, 'chutou', now);
    } else {
      setStatus(o, 'hurt', now, []);
      rememberNpc(p, npc, 'chutou_lost', now);
    }
    rumor(w, now, o.daohao, `chutou|${p.daohao}|${q.daohao}|${won ? 1 : 0}`);
    out(p.id, { kind: 'yuan', line: 'repay', beat: 'chutou', npc, name: o.daohao, foe: q.daohao, foeNpc: q.npc, won });
    return true;
  }

  if (realmOf(o.level) !== realmOf(p.level)) return false;
  const day = addDays(today, 1);
  const r = realmOn(w.seed, realmOf(p.level), day);
  const y = openYuan(p, { kind: 'repay', form: 'tongxing', npc, name: o.daohao, at: now, until: now + 3 * DAY, next: now + 3 * DAY, show: { day, region: r.id, name: r.name } });
  if (!y) return false;
  seen[npc] = now;
  out(p.id, { kind: 'yuan', line: 'repay', beat: 'tongxing', npc, name: o.daohao, day, region: r.id, regionName: r.name });
  return true;
}

export function askOptions(w: EnWorld, p: Player, y: Yuan): { key: string; no: string | null }[] {
  const o = w.players.get(y.npc);
  if (y.ask?.kind === 'yao') return [{ key: 'take', no: null }, { key: 'decline', no: null }];
  if (y.ask?.kind === 'siege') {
    const cost = o ? amendsCost(o) : 0;
    return [{ key: 'fight', no: null }, { key: 'amends', no: p.lingshi < cost ? `赔礼要 ${cost} 灵石，你身上不够` : null }, { key: 'hide', no: null }];
  }
  if (y.ask?.kind === 'beg') return [{ key: 'save', no: null }, { key: 'ignore', no: null }, { key: 'seize', no: null }];
  return [];
}

export function answerYuan(w: EnWorld, p: Player, yuanId: string, opt: number, now: number, out: Out, auto = false): GameEvent[] {
  const y = yuanList(p).find((x) => x.id === yuanId);
  if (!y?.ask) throw new Error('没有这件事');
  const o = w.players.get(y.npc);
  if (!alive(o)) return [closeYuan(p, y, 'dead', now)];
  const ops = askOptions(w, p, y);
  const pick = ops[opt];
  if (!pick) throw new Error('没有这个选项');
  if (pick.no) throw new Error(pick.no);
  const ev: GameEvent[] = [];
  const seen = (p.yuanSeen ??= {});
  const kind = y.ask.kind;
  const base = { npc: y.npc, name: y.name, ...(auto ? { auto: true } : {}) };
  if (kind === 'yao') {
    if (pick.key === 'take') {

      heal(p, statusAt(p, now) === 'dying' ? 'hurt' : 'ok', now, ev);
      ev.push(closeYuan(p, y, 'yao', now, base));
    } else {
      if (!auto) record(w, p.id, y.npc, 'gift', now);
      ev.push(closeYuan(p, y, 'yao_no', now, base));
    }
    return ev;
  }
  if (kind === 'siege') {
    if (pick.key === 'amends') {
      ev.push(...amends(w, p, o.id, now));
      seen[`siege:${y.npc}`] = now;
      ev.push(closeYuan(p, y, 'amends', now, base));
      return ev;
    }
    if (pick.key === 'hide') {
      y.tries = (y.tries ?? 0) + 1;
      y.ask = undefined;
      rumor(w, now, o.daohao, `hide|${p.daohao}|${y.tries}`);
      if (y.tries >= YUAN_TRIES) {
        seen[`siege:${y.npc}`] = now;
        ev.push(closeYuan(p, y, 'hid', now, { ...base, round: y.tries }));
      } else {
        y.next = now + YUAN_SIEGE_GAP_MS;
        y.until = Math.max(y.until, y.next + 2 * DAY);
        ev.push({ kind: 'yuan', line: 'siege', beat: 'hide', ...base, round: y.tries });
      }
      return ev;
    }

    const { won, winP } = duel(w, p, o, now, `siege:${p.id}:${y.npc}:${y.tries ?? 0}:${y.at}`, -REVENGE_BONUS);
    seen[`siege:${y.npc}`] = now;
    if (won) {
      setStatus(o, 'hurt', now, []);
      rumor(w, now, p.daohao, `siege|${o.daohao}|1`);
      ev.push(closeYuan(p, y, 'siege_won', now, { ...base, winP }));
      return ev;
    }
    rumor(w, now, o.daohao, `siege|${p.daohao}|0`);
    ev.push(closeYuan(p, y, 'siege_lost', now, { ...base, winP }));
    if (shielded(p, now)) {
      setStatus(p, 'hurt', now, ev);
      return ev;
    }
    setStatus(p, 'hurt', now, ev);
    const uid = nextUid(o);
    o.pendingKills.push({ uid, targetId: p.id, targetName: p.daohao, until: now + DAY });
    const m = new Map<string, GameEvent[]>();
    decideKill(o, uid, true, p, now, m, w, rollOf(w, `siegekill:${p.id}:${y.npc}:${y.at}`));
    for (const [id, es] of m) for (const e of es) (id === p.id ? ev.push(e) : out(id, e));
    if (p.needRebirth) p.slainBy = { npc: y.npc, at: now };
    return ev;
  }

  if (pick.key === 'ignore') {
    ev.push(closeYuan(p, y, 'beg_no', now, base));
    return ev;
  }
  if (pick.key === 'seize') {

    const { won, winP } = duel(w, p, o, now, `seize:${p.id}:${y.npc}:${y.at}`);
    if (!won) {
      setStatus(p, 'hurt', now, ev);
      ev.push(closeYuan(p, y, 'lost', now, { ...base, winP, seize: true }));
      return ev;
    }
    const got = recover(p, o, y);
    addEnemy(p, o.id, now, 'fu');
    seen[`feud:${y.npc}`] = now;
    p.pendingKills.push({ uid: nextUid(p), targetId: o.id, targetName: o.daohao, until: now + 2 * DAY });
    ev.push(closeYuan(p, y, 'took', now, { ...base, ...got, winP }));
    return ev;
  }

  const r = rollOf(w, `beg:${p.id}:${y.npc}:${y.at}`).nextFloat();
  heal(o, 'ok', now, []);
  if (r < BEG_AGAIN) {
    const take = Math.floor(p.lingshi * BEG_AGAIN_TAKE);
    p.lingshi -= take;
    addEnemy(p, o.id, now, 'fu');
    seen[`feud:${y.npc}`] = now;
    ev.push(closeYuan(p, y, 'again', now, { ...base, lingshi: take }));
  } else if (r < BEG_AGAIN + BEG_GONE) {
    ev.push(closeYuan(p, y, 'gone', now, base));
  } else {
    const got = recover(p, o, y);
    const thanks = BEG_THANKS * (1 + realmOf(p.level));
    p.lingshi += thanks;
    record(w, p.id, y.npc, 'save', now);
    ev.push(closeYuan(p, y, 'saved', now, { ...base, ...got, thanks }));
  }
  return ev;
}
