import { BASE_LOOT_TIER, DAY, HOUR, INHERIT_CONSOLE, INHERIT_EVERY_DAYS, INHERIT_HOUR, INHERIT_OPEN_MS, INHERIT_PATH_BONUS, realmPower } from './config.ts';
import { duelWinProb, powerOf } from './combat.ts';
import { INHERIT_MASTERS, type InheritMaster, WENXIN, item } from './content.ts';
import type { GameEvent, Rumor } from './events.ts';
import { rollItem } from './mijing.ts';
import { type Player, activeGongfa, addItem, realmOf, statusAt } from './player.ts';
import { SeededRng, hashSeed } from './rng.ts';
import { addDays, atJst, dayKey } from './time.ts';

export interface InheritEntrant {
  pid: string;
  name: string;
  score: number;
  at: number;
}
export interface Inherit {
  id: string;
  realm: number;
  master: string;
  gongfa: string;
  trial: 'xin' | 'dou';
  q: string | null;
  opens: number;
  closes: number;
  entrants: InheritEntrant[];
  winner: string | null;
  done: boolean;
}
export interface InheritWorld {
  seed: number;
  players: Map<string, Player>;
  rumors: Rumor[];
  inherits: Inherit[];
  inheritNext: number;
  inheritUsed: string[];
}
type Emit = (id: string, ev: GameEvent[], at: number) => void;

export const REALM_NAMES = ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];

const XIN_AIM: Record<string, { shan: number; gang: number }> = { jian: { shan: 2, gang: 2 }, ren: { shan: 2, gang: -2 }, kuang: { shan: -2, gang: 2 }, gui: { shan: -2, gang: -2 } };

export function masterOf(ih: Inherit): InheritMaster {
  return INHERIT_MASTERS.find((m) => m.id === ih.master) ?? (INHERIT_MASTERS[0] as InheritMaster);
}

export function firstInheritAt(now: number): number {
  const d = dayKey(now);
  const t = atJst(d, INHERIT_HOUR);
  return t > now ? t : atJst(addDays(d, 1), INHERIT_HOUR);
}

export function openInherit(w: InheritWorld, realm: number, now: number): Inherit | null {
  return w.inherits.find((x) => !x.done && x.realm === realm && x.opens <= now && now < x.closes) ?? null;
}

export function openOne(w: InheritWorld, at: number, emit: Emit, forceRealm?: number): Inherit | null {
  const rng = new SeededRng(hashSeed(`${w.seed}:inherit:${at}`));
  const count = new Array(9).fill(0) as number[];
  for (const p of w.players.values()) if (!p.needRebirth && p.createdAt <= at) count[realmOf(p.level)] = (count[realmOf(p.level)] as number) + 1;
  const total = count.reduce((s, n) => s + n, 0);
  if (!total) return null;
  let r = rng.nextFloat() * total;
  let realm = 0;
  if (forceRealm !== undefined) r = -1;
  for (let i = 0; forceRealm === undefined && i < 9; i++) {
    r -= count[i] as number;
    if (r < 0) {
      realm = i;
      break;
    }
  }
  if (forceRealm !== undefined) realm = forceRealm;

  const used = new Set(w.inheritUsed ?? []);
  for (const x of w.inherits) if (!x.done || x.winner) used.add(x.master);
  const left = INHERIT_MASTERS.filter((m) => !used.has(m.id));
  if (!left.length) return null;
  const master = left[Math.floor(rng.nextFloat() * left.length)] as InheritMaster;
  const tier = Math.min(5, (BASE_LOOT_TIER[realm] as number) + 1);
  let gongfa = rollItem(realm * 4, tier, rng, 'gongfa', master.qi);
  if (item(gongfa).qi !== master.qi) gongfa = rollItem(realm * 4, tier, new SeededRng(hashSeed(`${w.seed}:inherit2:${at}`)), 'gongfa', master.qi);
  const trial: Inherit['trial'] = rng.nextFloat() < 0.5 ? 'xin' : 'dou';
  const ih: Inherit = {
    id: `ih:${at}`,
    realm,
    master: master.id,
    gongfa,
    trial,
    q: trial === 'xin' ? (WENXIN[Math.floor(rng.nextFloat() * WENXIN.length)] as { id: string }).id : null,
    opens: at,
    closes: at + INHERIT_OPEN_MS,
    entrants: [],
    winner: null,
    done: false,
  };
  w.inherits.push(ih);
  w.rumors.push({ at, kind: 'inherit_open', who: master.name, text: `${REALM_NAMES[realm]}|${master.cave}` });
  for (const p of w.players.values()) {
    if (p.needRebirth || realmOf(p.level) !== realm) continue;
    emit(p.id, [{ kind: 'inherit_open', id: ih.id, master: master.name, cave: master.cave, realm: REALM_NAMES[realm], closes: ih.closes }], at);
  }
  return ih;
}

export function inheritBlock(w: InheritWorld, p: Player, id: string, now: number): string | null {
  const ih = w.inherits.find((x) => x.id === id);
  if (!ih || ih.done || now < ih.opens || now >= ih.closes) return '洞府已经关了';
  if (p.needRebirth) return '尚未转世';
  if (realmOf(p.level) !== ih.realm) return `只有${REALM_NAMES[ih.realm]}的道友能进`;
  if (ih.entrants.some((e) => e.pid === p.id)) return '已经拜见过了，等洞府关门';
  if (p.stay) return '人在秘境里，出来再说';
  if (p.youli && now < p.youli.end) return '外出游历中，回来再说';
  if (statusAt(p, now) === 'dying') return '伤势垂危，此时去不得';
  return null;
}

export function enterInherit(w: InheritWorld, p: Player, id: string, answer: number | undefined, now: number): GameEvent[] {
  const why = inheritBlock(w, p, id, now);
  if (why) throw new Error(why);
  const ih = w.inherits.find((x) => x.id === id) as Inherit;
  const m = masterOf(ih);
  const rng = new SeededRng(hashSeed(`${w.seed}:ih-enter:${ih.id}:${p.id}`));
  let score = 0;
  let feel: string;
  let won: boolean | null = null;
  if (ih.trial === 'xin') {
    const q = WENXIN.find((x) => x.id === ih.q);
    const o = q?.options[answer ?? -1];
    if (!q || !o) throw new Error('还没作答');
    const aim = XIN_AIM[m.xinxing] ?? { shan: 0, gang: 0 };
    score = 8 - (Math.abs(o.shan - aim.shan) + Math.abs(o.gang - aim.gang));
    feel = score >= 6 ? '前辈的残念沉默了一会儿，像是笑了一下。' : score >= 3 ? '残念没有说话，看不出满不满意。' : '残念轻轻叹了口气。';
  } else {
    const me = powerOf(p, now);
    const wp = duelWinProb({ power: me.power, yun: me.yun }, { power: realmPower(ih.realm * 4 + 2), yun: 0 });
    won = rng.nextFloat() < wp;
    score = 6 * wp + (won ? 2 : 0);
    feel = won ? '傀儡退了一步，让开了路。' : '傀儡一掌把你推出门外。你没受伤，只是脸上挂不住。';
  }
  const path = activeGongfa(p).qi === m.qi;
  if (path) score += INHERIT_PATH_BONUS;
  score += rng.nextFloat() * 0.5;
  ih.entrants.push({ pid: p.id, name: p.daohao, score, at: now });
  return [{ kind: 'inherit_enter', id: ih.id, master: m.name, cave: m.cave, feel, path, won, closes: ih.closes }];
}

export function closeInherit(w: InheritWorld, ih: Inherit, emit: Emit): void {
  if (ih.done) return;
  ih.done = true;
  const m = masterOf(ih);
  const at = ih.closes;
  const live = ih.entrants.filter((e) => w.players.has(e.pid));
  if (!live.length) return;
  const best = [...live].sort((a, b) => b.score - a.score || a.at - b.at)[0] as InheritEntrant;
  ih.winner = best.pid;
  const gf = item(ih.gongfa);
  for (const e of live) {
    const p = w.players.get(e.pid) as Player;
    if (e.pid === best.pid) {
      addItem(p, ih.gongfa, 1);
      p.heirs ??= [];
      if (!p.heirs.includes(m.name)) p.heirs.push(m.name);
      emit(p.id, [{ kind: 'inherit_won', id: ih.id, master: m.name, cave: m.cave, item: ih.gongfa }], at);
    } else {
      const gain = Math.round(INHERIT_CONSOLE * (1 + ih.realm));
      p.lingshi += gain;
      emit(p.id, [{ kind: 'inherit_lost', id: ih.id, master: m.name, cave: m.cave, winner: best.name, lingshi: gain }], at);
    }
  }
  w.inheritUsed ??= [];
  if (!w.inheritUsed.includes(m.id)) w.inheritUsed.push(m.id);
  w.rumors.push({ at, kind: 'inherit_won', who: best.name, text: `${m.name}|${gf.name}|${REALM_NAMES[ih.realm]}` });
}

export function inheritJobs(w: InheritWorld, now: number, emit: Emit): { at: number; run: () => void }[] {
  const jobs: { at: number; run: () => void }[] = [];
  for (const ih of w.inherits) if (!ih.done && ih.closes <= now) jobs.push({ at: ih.closes, run: () => closeInherit(w, ih, emit) });
  let g = 0;
  while (w.inheritNext <= now && g++ < 40) {
    const at = w.inheritNext;
    w.inheritNext = at + INHERIT_EVERY_DAYS * DAY;
    jobs.push({
      at,
      run: () => {
        const ih = openOne(w, at, emit);
        if (ih && ih.closes <= now) closeInherit(w, ih, emit);
      },
    });
  }
  return jobs;
}

export function pruneInherits(w: InheritWorld, now: number): void {
  w.inherits = w.inherits.filter((x) => !x.done || now - x.closes < 7 * DAY);
}
export const INHERIT_HOURS = INHERIT_OPEN_MS / HOUR;
