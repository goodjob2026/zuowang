import {
  type GameEvent,
  type Item,
  type Player,
  type Rng,
  type Stance,
  type World,
  RENSHE,
  XINGXIANG,
  attempt3,
  autoPlan3,
  isJie3,
  preview3,
  attempt,
  braceletSlots,
  chooseQiyu,
  collect,
  completeRebirth,
  decideKill,
  duelWinProb,
  enterBlock,
  enterRegion,
  equipGongfa,
  gateOf,
  isXiong,
  item,
  need,
  pick,
  pool,
  postBounty,
  powerOf,
  preview,
  todayRealm,
  instOf,
  calDay,
  stagePower,
  themeOf,
  themeMult,
  pendingChoice,
  chooseStage,
  autoOption,
  openInherit,
  realmOf,
  inheritBlock,
  enterInherit,
  WENXIN,
  startYouli,
  statusAt,
  stayOf,
  useItem,
  whereIs,
  youliBlock,
  bestFabao,
} from '@zuowang/rules';

export const BOT_PREFIX = 'bot';
export function isBotUid(uid: string): boolean {
  return uid.startsWith(BOT_PREFIX);
}

const owned = (p: Player, f: (x: Item) => boolean) =>
  Object.keys(p.inv)
    .filter((id) => (p.inv[id] ?? 0) > 0)
    .map((id) => item(id))
    .filter(f);

function temper(p: Player): { killer: boolean; bold: boolean } {
  let h = 0;
  for (const c of p.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { killer: h % 100 < 35, bold: h % 7 < 3 };
}

export function botTurn(w: World, p: Player, now: number, rng: Rng, out: (id: string, e: GameEvent) => void): GameEvent[] {
  const ev: GameEvent[] = [];
  const t = temper(p);
  if (p.needRebirth) {
    const xx = pick(rng, ['jian', 'ren', 'kuang', 'gui'] as const);
    const rs = RENSHE.filter((r) => r.xinxing === xx);
    completeRebirth(p, pool(p.gender, xx)[0]?.id ?? p.xingxiang, p.gender, xx, undefined, pick(rng, rs).id);
  }
  ev.push(...collect(p, now));

  for (const k of [...p.pendingKills]) {
    const m = new Map<string, GameEvent[]>();
    decideKill(p, k.uid, rng.nextFloat() < 0.7, w.players.get(k.targetId), now, m, w, rng);
    for (const [id, es] of m) for (const e of es) out(id, e);
  }

  while (p.qiyu.length > 0) {
    const q = p.qiyu[0] as (typeof p.qiyu)[number];
    const idx = t.killer ? (rng.nextFloat() < 0.7 ? 1 : 0) : rng.nextFloat() < 0.7 ? 0 : 2;
    ev.push(...chooseQiyu(p, q.uid, idx, now, rng));
  }

  if (statusAt(p, now) === 'dying' && (p.inv.jiuzhuan_jindan ?? 0) > 0) ev.push(...useItem(p, 'jiuzhuan_jindan', now));

  if (!p.buffs.some((b) => b.until > now)) {
    const z = owned(p, (x) => (x.cat === 'dan' || x.cat === 'cao') && x.effect === 'zuo').sort((a, b) => b.tier - a.tier)[0];
    if (z) ev.push(...useItem(p, z.id, now));
  }

  if (gateOf(p.level) >= 0 && p.xiuwei >= need(p.level) && !p.stay && !(p.youli && now < p.youli.end) && statusAt(p, now) !== 'dying') {
    const gate = gateOf(p.level);
    const pills = owned(p, (x) => x.cat === 'dan' && x.effect === (gate < 3 ? 'tupo' : 'dujie'))
      .sort((a, b) => b.tier - a.tier)
      .slice(0, 3)
      .map((x) => x.id);
    if (isJie3(gate)) {

      const plan = autoPlan3(p);
      const p3 = preview3(p, plan, now);
      if (p3.ready && (p3.total >= 0.55 || rng.nextFloat() < 0.25)) ev.push(...attempt3(p, plan, now, rng));
    } else {
      const pv = preview(p, pills.slice(0, 2), now);
      if (pv.ready && (pv.total >= 0.55 || rng.nextFloat() < 0.25)) ev.push(...attempt(p, pills.slice(0, 2), now, rng));
    }
  }

  const zuo = owned(p, (x) => x.cat === 'gongfa' && x.focus === 'zuo' && (t.killer || !x.mo)).sort((a, b) => b.tier - a.tier)[0];
  if (zuo && zuo.id !== p.gongfa) ev.push(...equipGongfa(p, zuo.id, now));

  const cap = braceletSlots(p);
  const fab = bestFabao(p);
  const cons = owned(p, (x) => (x.cat === 'fu' || x.cat === 'cao' || x.cat === 'dan') && ['dou', 'yun', 'hu', 'dun'].includes(x.effect ?? '')).sort((a, b) => b.tier - a.tier).map((x) => x.id);
  p.loadout = [...fab, ...cons].slice(0, Math.min(cap, 8 + Math.max(0, fab.length - 3)));

  if (p.lingshi > 600) {
    const e = p.enemies.find((x) => x.why === 'kill' && !w.bounties.some((b) => b.status === 'open' && b.poster === p.id && b.target === x.id));
    if (e) ev.push(...postBounty(w, p, e.id, 100, now));
  }

  {
    const ih = openInherit(w, realmOf(p.level), now);
    if (ih && !inheritBlock(w, p, ih.id, now) && rng.nextFloat() < 0.7) {
      const q = ih.trial === 'xin' ? WENXIN.find((x) => x.id === ih.q) : undefined;
      ev.push(...enterInherit(w, p, ih.id, q ? Math.floor(rng.nextFloat() * q.options.length) : undefined, now));
    }
  }

  {
    const st = stayOf(w, p);
    const pc = st ? pendingChoice(st) : null;
    if (st && pc && (st.stages[pc.idx]?.choice ?? null) === null && rng.nextFloat() < 0.6) {
      const ops = pc.def.options ?? [];
      const want = t.killer ? ops.findIndex((o) => o.tag === 'e') : ops.findIndex((o) => o.tag === 'shan');
      try {
        chooseStage(w, p, want >= 0 ? want : autoOption(pc.def, st.push), now);
      } catch {

      }
    }
  }

  if (!p.stay && !(p.youli && now < p.youli.end) && !p.needRebirth) {
    const s0 = statusAt(p, now);
    const today = todayRealm(w, p, now);
    const my = powerOf(p, now).power;
    let target: string | null = null;
    let hunted: string | undefined;
    let depth: 0 | 1 | 2 | undefined;
    let stance: Stance = t.killer ? 'kill' : 'spare';

    const hunt = [...p.enemies.map((e) => e.id), ...[...w.players.values()].filter((o) => o.id !== p.id && isXiong(o, now)).map((o) => o.id)];
    for (const id of hunt) {
      const o = w.players.get(id);
      if (!o) continue;
      const at = whereIs(w, o, now);
      const os = stayOf(w, o);
      if (at.kind === 'mijing' && os && os.inst === instOf(calDay(now), realmOf(p.level)) && my >= os.snap.raw * 0.85) {
        target = at.region;
        hunted = o.id;
        stance = 'kill';
        break;
      }
    }
    const roll = rng.nextFloat();
    if (!target && (s0 === 'ok' || t.bold) && roll < 0.65) {

      const canBeast = duelWinProb({ power: my * themeMult(themeOf(today, p)), yun: 0 }, { power: stagePower(realmOf(p.level), 'boss', 3), yun: 0 }) >= 0.5;
      depth = rng.nextFloat() < 0.4 ? 0 : canBeast && rng.nextFloat() < 0.5 ? 2 : 1;
      target = today.id;
    }
    if (target && !enterBlock(w, p, target, now)) {
      const dou = owned(p, (x) => x.cat === 'gongfa' && x.focus === 'dou' && (t.killer || !x.mo)).sort((a, b) => b.tier - a.tier)[0];
      if (dou && dou.id !== p.gongfa) ev.push(...equipGongfa(p, dou.id, now));
      enterRegion(w, p, target, stance, now, (id, e) => (id === p.id ? ev.push(e) : out(id, e)), hunted, depth, t.bold ? 'bold' : 'safe');
    } else if (roll < 0.9) {
      for (const h of [8, 4, 2]) {
        if (youliBlock(p, h, now) === null) {
          ev.push(...startYouli(p, h, now));
          break;
        }
      }
    }
  }
  return ev;
}

export function botSeed(i: number, rng: Rng, anchorLevel: number): { xingxiang: string; gender: 'm' | 'f'; xinxing: 'jian' | 'ren' | 'kuang' | 'gui'; level: number; shane: number; renshe: string } {
  const xx = pick(rng, XINGXIANG);
  const rs = RENSHE.filter((r) => r.xinxing === xx.xinxing);
  const band0 = Math.floor(Math.floor(anchorLevel / 4) / 2) * 8;
  const level = i % 4 === 3 ? Math.min(35, band0 + 8 + Math.floor(rng.nextFloat() * 6)) : Math.min(35, band0 + Math.floor(rng.nextFloat() * 8));
  const shane = xx.xinxing === 'kuang' || xx.xinxing === 'gui' ? -20 - Math.floor(rng.nextFloat() * 90) : Math.floor(rng.nextFloat() * 90);
  return { xingxiang: xx.id, gender: xx.gender, xinxing: xx.xinxing, level, shane, renshe: pick(rng, rs).id };
}
