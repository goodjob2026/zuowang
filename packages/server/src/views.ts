import {
  CAT_NAME,
  DANTIAN_CAP_MS,
  FOCUS_NAME,
  type Player,
  QIYU,
  QIYU_AFTER,
  REVENGE_BONUS,
  type Attitude,
  type Yuan,
  type YouliMeet,
  addDays,
  amendsCost,
  askOptions,
  NPC_SAY,
  NPC_LINES,
  yuanList,
  yuanOf,
  REALMS,
  type Stay,
  type World,
  hashSeed,
  JULING_HOURS,
  KILL_HEALTHY_CHANCE,
  bandOf,
  bountyOn,
  duelWinProb,
  enterBlock,
  isXiong,
  occupants,
  rensheOf,
  stayOf,
  whereIs,
  YOULI_ITEMS,
  YOULI_LINGSHI_PER_HOUR,
  YOULI_XIUWEI_FACTOR,
  LINGSHI_REALM_SCALE,
  retakeBlock,
  nextOdds,
  BOARDS_OPEN,
  PATH_MATCH_POW,
  isJie3,
  QI_NAME,
  openInherit,
  masterOf,
  inheritBlock,
  WENXIN,
  activeGongfa,
  realmPower,
  whereOf,
  carriable,
  titlesOf,
  titleBonusAt,
  resetWeek,
  resetDay,
  rankOf,
  BOARDS,
  BOARD_NAME,
  BOARD_TITLES,
  BOARD_BONUS,
  isEarly,
  TIER_NAME,
  XINXING_NAME,
  XINGXIANG,
  RIKE_BONUS_HOURS,
  RIKE_NAME,
  RIKE_SIT_MS,
  YOULI,
  accrue,
  rikeLingshi,
  QIANDAO_CYCLE,
  qiandaoLingshi,
  qiandaoStreak,
  signedToday,
  youliOptions,
  braceletSlots,
  campOf,
  effectText,
  effectiveLoadout,
  huTooWeak,
  fabaoRole,
  FABAO_ROLE_NAME,
  HU_WEAK_FROM_REALM,
  gateOf,
  healthyRate,
  item,
  julingEfficacy,
  levelName,
  need,
  pillFits,
  powerOf,
  preview,
  rateAt,
  realmOf,
  sellPrice,
  statusAt,
  todayRealm,
  upcoming,
  miLayerOf,
  LAYER_NAME,
  themeOf,
  themeMult,
  stagePower,
  pendingChoice,
  NPC_BY_ID,
  NPC_SCENES,
  type NpcSceneKind,
  STAGE_BY_ID,
  miRealm,
  FIRST_TRIP_STEP_MIN,
  isFirstTrip,
  MI_DEPTHS,
  MI_LATE,
  CAMP3_NAME,
  LOOT_THEME_NAME,
  TEXTS,
  instOf,
  calDay,
  lagRealms,
  catchupZuo,
  catchupGate,
  type MiRealm,
  type StagePlan,
} from '@zuowang/rules';

export function itemView(id: string) {
  const x = item(id);
  return {
    id: x.id,
    name: x.name,
    tier: x.tier,
    tierName: TIER_NAME[x.tier],
    cat: x.cat,
    catName: CAT_NAME[x.cat],
    icon: x.icon,
    flavor: x.flavor,
    source: x.source,
    where: whereOf(x.id),
    carry: carriable(x),
    focus: x.focus ?? null,
    focusName: x.focus ? FOCUS_NAME[x.focus] : null,
    mo: x.mo ?? false,
    qi: x.qi ?? null,
    qiName: x.qi && (x.cat === 'gongfa' || x.cat === 'fabao') ? QI_NAME[x.qi] : null,
    sell: sellPrice(x.id),
    kind: x.kind ?? null,
    role: x.cat === 'fabao' ? fabaoRole(x) : null,
    roleName: x.cat === 'fabao' ? FABAO_ROLE_NAME[fabaoRole(x)] : null,
    effect: x.effect ?? null,
    effectText: effectText(x),
  };
}

const INJ: Record<string, string> = { hurt: '受了伤', dying: '重伤濒死，被抬了出去', death: '被斩了', revive: '被斩了，轮回珠救回一命', blocked: '护身之物挡下了这一击', dun: '捏碎遁符，逃得一命' };

function stageStory(st: Stay, sp: StagePlan, r: MiRealm | undefined): { title: string; cause: string; text: string; opt: string | null } {
  const mine = (o: string) => INJ[o] ?? '受了伤';
  if (sp.pvp) {
    const pv = sp.pvp;
    const theirs = INJ[pv.outcome] ? `他${INJ[pv.outcome]}` : '他退走了';
    if (pv.holder) return { title: '夺宝', cause: `闯到最后，宝物已经在${pv.vsName}手里。`, text: pv.won ? `你和他斗了一场，胜了：${theirs}，宝物归你。` : `你和他斗了一场，败了：你${mine(pv.outcome)}。`, opt: null };

    if (!pv.won && (pv.outcome === 'death' || pv.outcome === 'revive') && NPC_BY_ID.has(pv.vs)) {
      const scene = npcScene(pv.vs, 'slay', slayPick(pv.vs, st.pid, sp.at), pv.vsName);
      if (scene) return { title: '狭路相逢', cause: `半路撞上了同来的${pv.vsName}。`, text: `${scene}${pv.outcome === 'revive' ? '怀中轮回珠碎作齑粉，你又睁开了眼。' : ''}`, opt: null };
    }
    return { title: '狭路相逢', cause: `半路撞上了同来的${pv.vsName}。`, text: pv.won ? `斗了一场，你胜了：${theirs}。` : `斗了一场，你败了：你${mine(pv.outcome)}。`, opt: null };
  }
  if (sp.ref === 'boss') {
    const b = r?.layers[st.layer]?.boss;
    if (!b) return { title: '', cause: '', text: '', opt: null };
    const res = sp.outcome === 'win' ? b.win : sp.outcome === 'repelled' ? b.repelled : b.fail;
    return { title: b.name, cause: b.text, text: res, opt: null };
  }
  const def = STAGE_BY_ID.get(sp.ref);
  if (!def) return { title: '', cause: '', text: '', opt: null };
  const oc = (sp.outcome ?? 'win') as 'win' | 'scrape' | 'fail';
  if (def.options && sp.opt !== undefined) {
    const o = def.options[sp.opt];
    return { title: def.title, cause: def.text, text: o?.[oc] ?? '', opt: o ? `${sp.auto ? '你没拿主意，按你的打法' : '你'}选了「${o.label}」。` : null };
  }
  return { title: def.title, cause: def.text, text: def[oc] ?? def.win ?? '', opt: null };
}

export const taOf = (npcId: string): '他' | '她' => (NPC_BY_ID.get(npcId)?.gender === 'f' ? '她' : '他');

export const she = (text: string, npcId: string): string => (taOf(npcId) === '她' ? text.replace(/(?<!其)他(?![人日处乡年山])/g, '她') : text);
export function npcScene(npcId: string, kind: NpcSceneKind, pick: number, name?: string): string {
  const own = NPC_SCENES[npcId]?.[kind];
  if (own?.length) return own[pick % own.length] as string;
  const def = NPC_BY_ID.get(npcId);
  const T = TEXTS as Record<string, unknown>;

  const yuan = (T.yuan as Record<string, Record<string, string[]>> | undefined)?.[def?.xinxing ?? 'jian']?.[kind];
  const pool = (kind === 'slay' ? (T.npcSlay as Record<string, string[]> | undefined) : (T.npcRepay as Record<string, Record<string, string[]>> | undefined)?.[kind]) ?? {};

  const back = kind === 'accept' ? (T.npcRepay as Record<string, Record<string, string[]>> | undefined)?.grateful : kind === 'colder' ? (T.npcRepay as Record<string, Record<string, string[]>> | undefined)?.cold : undefined;
  const lines = yuan ?? pool[def?.xinxing ?? 'any'] ?? pool.any ?? back?.[def?.xinxing ?? 'any'] ?? back?.any ?? [];

  return she((lines[pick % Math.max(1, lines.length)] ?? '').replace(/\{name\}/g, name ?? def?.name ?? '他'), npcId);
}

export function repayText(npcId: string, name: string, how: 'betray' | 'cold' | 'grateful' | 'rob', lingshi: number, pick: number, itemId?: string, flag?: { accept?: boolean; colder?: boolean }): string {
  const tail =
    how === 'rob'
      ? itemId
        ? `到手的「${item(itemId).name}」被他夺了去。`
        : '到手的宝物被他夺了去，由他带出了秘境。'
      : how === 'betray'
        ? lingshi > 0
          ? `被他夺去灵石 ${lingshi}，贴身藏着的还在。`
          : '好在囊中本就空着，只是方才到手的东西没了。'
        : how === 'grateful' && lingshi > 0
          ? `你得了灵石 ${lingshi}。`
          : '';
  return `${npcScene(npcId, repayKind(how, flag), pick, name)}${she(tail, npcId)}`;
}

export const repayKind = (how: string, flag?: { accept?: unknown; colder?: unknown }): NpcSceneKind => (flag?.accept ? 'accept' : flag?.colder ? 'colder' : (how as NpcSceneKind));

const yuanPick = (npcId: string, me: string, at: number): number => hashSeed(`yuan:${npcId}:${me}:${Math.floor(at / 86_400_000)}`) % 1000;

function yuanSceneKind(d: Record<string, unknown>): NpcSceneKind | null {
  if (d.kind === 'yuan') {
    if (d.beat === 'hunt_lost') return 'hunt_lost';
    if (d.beat === 'hunt_hurt') return 'hunt_hurt';
    if (d.beat === 'chutou') return d.won ? 'chutou' : 'chutou_lost';
    if (d.beat === 'tongxing') return 'tongxing';
    if (d.beat === 'hide') return 'hide';
    return null;
  }
  const how = d.how as string;
  if (how === 'back') return 'caught';
  if (how === 'sent') return 'sent';
  if (how === 'missed' && d.line === 'repay') return 'tongxing_miss';
  if (how === 'lost') return d.seize ? 'seize_lost' : 'hunt_lost';
  if (how === 'hid') return 'hid';
  if (how === 'siege_won' || how === 'siege_lost' || how === 'saved' || how === 'gone' || how === 'again') return how;
  if (how === 'took') return 'seize_won';
  return null;
}
const DAY_LABEL = (day: string, now: number): string => (day === calDay(now) ? '今日' : day === addDays(calDay(now), 1) ? '明日' : '后日');
const owedLine = (name: string, y: Yuan): string => {
  const ls = y.owed?.lingshi ?? 0;
  const it = (y.owed?.items ?? []).map((id) => `「${item(id).name}」`).join('、');
  if (y.kind === 'blood') return `${name}斩过你${it ? `，夺去${it}` : ''}`;
  if (ls > 0 && it) return `${name}夺你灵石 ${ls}、${it}`;
  if (ls > 0) return `${name}夺你灵石 ${ls}`;
  if (it) return `${name}夺你${it}`;
  return `${name}负过你`;
};

const owes = (y: Yuan): boolean => (y.owed?.lingshi ?? 0) > 0 || (y.owed?.items.length ?? 0) > 0;
const GO_RANK: Record<string, number> = { ask: 0, hunt: 1, mijing: 2, npc: 3 };
const ASK_TITLE = { yao: '故人送药', siege: '仇家堵门', beg: '旧人求救' } as const;

export function yuanView(p: Player, w: World, now: number) {
  const today = calDay(now);
  return yuanList(p)
    .map((y) => {
      const o = w.players.get(y.npc);
      const name = o?.daohao ?? y.name;
      const pub = pubId(w.seed, y.npc);
      const lbl = y.show ? DAY_LABEL(y.show.day, now) : '';

      const brief = y.ask
        ? y.ask.kind === 'yao' ? `${name}送药上门` : y.ask.kind === 'siege' ? `${name}堵在洞府门外` : `${name}带伤来求`
        : y.kind === 'debt' || y.kind === 'blood'
          ? y.show ? `${name}${y.kind === 'blood' ? '斩过你' : owes(y) ? '欠你的' : '负过你'}，${lbl}在${y.show.name}` : y.kind === 'blood' ? `${name}斩过你` : owes(y) ? `${name}欠你一笔` : `${name}负过你`
          : y.kind === 'repay' ? (y.show ? `${name}约你${lbl}同去` : `${name}记着你的好`)
          : y.kind === 'siege' ? `${name}说改日再来` : `${name}待你冷淡`;
      const base = { id: y.id, kind: y.kind, npc: pub, npcId: y.npc, name, ta: taOf(y.npc), face: o?.xingxiang ?? null, until: y.until, brief };
      const here = !!y.show && y.show.day === today;
      if (y.ask) {
        const round = (y.tries ?? 0) + 1;
        const kind: NpcSceneKind = y.ask.kind === 'siege' ? (`siege${Math.min(3, round)}` as NpcSceneKind) : y.ask.kind;
        const line = y.ask.kind === 'yao' ? `${name}托人送药，人在洞府外候着。` : y.ask.kind === 'siege' ? `${name}堵在你洞府门外${round === 2 ? '，这是第二回' : round >= 3 ? '，这是第三回' : ''}。` : `${name}带着伤，求到你洞府门前。`;
        const winP = o && (y.ask.kind === 'siege' || y.ask.kind === 'beg') ? duelWinProb(powerOf(p, now), powerOf(o, now), y.ask.kind === 'siege' ? -REVENGE_BONUS : 0) : null;
        const cost = o ? amendsCost(o) : 0;
        const LABEL: Record<string, string> = { take: '收下', decline: '推辞', fight: '出去会他', amends: `备礼赔罪（灵石 ${cost}）`, hide: '闭门不出', save: '救他', ignore: '不理', seize: '拿下他' };

        const warn = y.ask.kind === 'siege' ? (now < (p.newbieUntil ?? 0) || now < p.protectUntil || isEarly(p.level) ? '出去败了，你会受伤。' : `出去败了，${taOf(y.npc)}会下杀手：轻则重伤，重则身死。`) : '';
        const owed = y.ask.kind === 'beg' && ((y.owed?.lingshi ?? 0) > 0 || (y.owed?.items.length ?? 0) > 0) ? `${owedLine(name, y)}，至今未还。` : '';
        return {
          ...base,
          line,
          go: 'ask' as const,
          ask: {
            kind: y.ask.kind,
            title: ASK_TITLE[y.ask.kind],
            text: npcScene(y.npc, kind, yuanPick(y.npc, p.id, y.ask.at), name) || line,
            note: owed,
            warn,
            until: y.ask.until,
            options: askOptions(w, p, y).map((x, i) => ({ i, label: she(LABEL[x.key] ?? x.key, y.npc), no: x.no, odds: (x.key === 'fight' || x.key === 'seize') && winP !== null ? winP : null })),
          },
        };
      }
      if (y.kind === 'debt' || y.kind === 'blood') {
        const head = owedLine(name, y);
        const line = y.show ? `${head}，${here ? `今日就在${y.show.name}。` : `听说${DAY_LABEL(y.show.day, now)}要进${y.show.name}。`}` : `${head}，尚不知去向。`;
        return { ...base, line, go: here && !p.stay ? ('hunt' as const) : ('npc' as const), day: y.show?.day ?? null };
      }
      if (y.kind === 'repay') return { ...base, line: y.show ? `${name}托人带话：${DAY_LABEL(y.show.day, now)}同去${y.show.name}。` : `${name}记着你的好。`, go: here && !p.stay ? ('mijing' as const) : ('npc' as const), day: y.show?.day ?? null };
      if (y.kind === 'siege') return { ...base, line: `${name}放下话：改日再来。`, go: 'npc' as const, day: null };
      if (y.kind === 'sangu') return { ...base, line: (y.colds ?? 0) >= 2 ? `${name}仍不领情，话却比上回短了。` : `${name}待你冷淡，不曾言谢。`, go: 'npc' as const, day: null };
      return { ...base, line: `${name}与你还有一段未了的事。`, go: 'npc' as const, day: null };
    })
    .sort((a, b) => (GO_RANK[a.go] ?? 9) - (GO_RANK[b.go] ?? 9));
}

export function meetText(m: YouliMeet): { title: string; text: string } {
  const def = NPC_BY_ID.get(m.npc);

  const pool = (def ? (NPC_SAY[def.id]?.[m.mood as Attitude] ?? NPC_LINES[def.xinxing]?.[m.mood as Attitude] ?? []) : []).filter((x) => !/丹|药|符|灵石|法宝|收好|拿去|拿着|给你|送你|赠你|借你/.test(x));
  const line = pool.length ? (pool[m.pick % pool.length] as string) : '';
  const warm = m.mood === 'friend' || m.mood === 'sworn';
  const cold = m.mood === 'feud' || m.mood === 'grudge';
  const OPEN = warm
    ? [`山道转角，迎面来的是${m.name}。他先认出了你，停下脚步。`, `茶棚里只剩一张空桌，对面坐着的竟是${m.name}。他把茶碗往你这边推了推。`, `渡口等船的人里，有一个是${m.name}。他朝你点了点头，让出半边石凳。`]
    : cold
      ? [`窄桥上只容一人，对面走来的偏是${m.name}。他站住了，没有让路的意思。`, `驿亭里避雨，檐下先到的一人回过头来，是${m.name}。四目相对，谁也没有先开口。`, `集上人挤人，你一抬眼，${m.name}正隔着半条街看你，手按在腰间。`]
      : [`半山亭里歇脚，亭中已坐着一人，是${m.name}。他抬了抬眼，又垂下去。`, `林间小径上，${m.name}独自走在前头。你跟了一段，他始终没有回头。`, `溪边饮马的人直起身来，是${m.name}。他看了你一眼，牵马让到一旁。`];
  const open = OPEN[m.pick % OPEN.length] as string;
  const say = line ? `「${line}」` : '';
  const tail =
    m.effect === 'show'
      ? `路人多，他终究没有动手。擦肩而过时，你听见他同随行的人说，${m.day ? '明日' : '改日'}要进${m.regionName ?? '秘境'}。`
      : m.effect === 'gift'
        ? '临别，他往你手里按了些灵石，不容你推。'
        : cold
          ? '路人多，他终究没有动手，冷冷看你走远。'
          : warm
            ? '说了几句闲话，各自上路。'
            : '你们没有多话，各走各的。';
  return { title: '路遇故人', text: `${she(open, m.npc)}${say}${she(tail, m.npc)}` };
}

const slayPick = (npcId: string, victim: string, at: number): number => hashSeed(`${npcId}:${victim}:${Math.floor(at / 86_400_000)}`) % 1000;
function memLine(st: Stay, r: MiRealm | undefined): string | null {
  if (!st.mem) return null;
  const lines = ((TEXTS as Record<string, unknown>).mijingMem as Record<string, string[]> | undefined)?.[st.mem.kind] ?? [];
  if (!lines.length) return null;
  const line = lines[hashSeed(st.id) % lines.length] as string;
  return line.replace(/\{name\}/g, st.mem.name || (r?.layers[st.layer]?.boss.name ?? ''));
}

export function stayView(st: Stay, me?: Player) {
  const r = miRealm(st.region);
  const stages = st.stages ?? [];
  const done = stages.filter((s) => s.done);
  const next = st.status === 'in' ? stages.find((s) => !s.done) : undefined;
  const pc = st.status === 'in' ? pendingChoice(st) : null;
  const pcAt = pc ? (stages[pc.idx] as StagePlan).at : 0;
  return {
    id: st.id,
    region: st.region,
    name: r?.name ?? '',
    art: r?.art ?? 'rg_qingluo',
    layer: st.layer ?? 0,
    layerName: r ? `${LAYER_NAME[st.layer ?? 0]} · ${r.layers[st.layer ?? 0]?.name ?? ''}` : '',
    grade: st.grade,
    gradeName: st.late ? '' : (MI_DEPTHS[st.grade]?.name ?? ''),
    late: !!st.late,
    mate: st.mate ? { name: st.mate.name, mode: st.mate.mode } : null,
    push: st.push ?? 'safe',
    start: st.start,
    end: st.end,
    stance: st.stance,
    status: st.status,
    holder: st.holder,
    bossWon: !!st.bossWon,
    wins: st.wins,
    losses: st.losses,
    total: stages.length,
    mem: memLine(st, r),

    stages: done.map((sp) => ({ at: sp.at, boss: sp.ref === 'boss', outcome: sp.outcome ?? null, injury: sp.injury ?? null, pvp: !!sp.pvp, ...stageStory(st, sp, r), turn: sp.repay ? { how: sp.repay.how, lingshi: sp.repay.how === 'betray' ? -sp.repay.lingshi : sp.repay.how === 'grateful' ? sp.repay.lingshi : 0, text: repayText(sp.repay.npc, sp.repay.name, sp.repay.how, sp.repay.lingshi, sp.repay.pick ?? 0, sp.repay.item, sp.repay) } : null, lingshi: sp.lingshi ?? 0, items: (sp.items ?? []).map(itemView) })),
    next: next ? { at: next.at, boss: next.ref === 'boss', idx: stages.indexOf(next) } : null,
    choice: pc
      ? { idx: pc.idx, at: pcAt, title: pc.def.title, text: pc.def.text, npc: pc.def.npc ?? null, chosen: (stages[pc.idx] as StagePlan).choice ?? null, options: (pc.def.options ?? []).map((o, i) => ({ i, label: o.label })) }
      : null,
    fights: st.fights.map((f) => ({ at: f.at, vsName: f.vsName, beast: f.beast, aggressor: f.aggressor, won: f.won, winP: f.winP, outcome: f.outcome, block: f.block, revenge: f.revenge, bounty: f.bounty })),
    result: st.result ? { ...st.result, items: st.result.items.map(itemView) } : null,
  };
}

export function riskText(p: Player, at: number): string {
  const s = statusAt(p, at);
  const k = Math.round((KILL_HEALTHY_CHANCE[bandOf(p.level)] as number) * 100);

  if (isEarly(p.level)) return s === 'ok' ? '化神以前最多受伤，不会濒死、不会被斩；败退的话，路上捡的东西丢一半、灵石折三成。' : '你带着伤，过关更难；化神以前最多也只是伤着。';
  if (s === 'dying') return '你重伤濒死：再败一关、斗镇守一输，都可能死在里面。被人斩了，掉一件带进来的法宝（本命不掉）。';
  if (s === 'hurt') return '你带着伤：再败一关就是濒死，斗镇守输了会死。被人斩了，掉一件带进来的法宝（本命不掉）。';
  return k > 0 ? `败了：前两关受伤，往后重伤濒死。撞上下杀手的人多半濒死，${k}% 一刀被斩；被斩掉一件带进来的法宝（本命不掉）。` : '败了：前两关受伤，往后重伤濒死。撞上下杀手的人，会被打成濒死抬出秘境。';
}

export function withScene(d: Record<string, unknown>, me: string, at: number): Record<string, unknown> {
  if (d.kind === 'npc_event' && typeof d.repay === 'string' && typeof d.npc === 'string') return { ...d, ta: taOf(d.npc), scene: npcScene(d.npc, repayKind(d.repay, d), typeof d.pick === 'number' ? d.pick : 0, String(d.name ?? '')) };

  if ((d.kind === 'yuan' || d.kind === 'yuan_end') && typeof d.npc === 'string') {
    const k = yuanSceneKind(d);
    const named = Array.isArray(d.owedItems) ? { owedNames: (d.owedItems as string[]).map((id) => item(id).name) } : {};
    const got = Array.isArray(d.items) ? { itemNames: (d.items as string[]).map((id) => item(id).name) } : {};
    return { ...d, ...named, ...got, ta: taOf(d.npc), ...(k ? { scene: npcScene(d.npc, k, yuanPick(d.npc, me, at), String(d.name ?? '')) } : {}) };
  }
  if (d.kind === 'youli_back' && d.meet) return { ...d, meetText: meetText(d.meet as YouliMeet) };
  if (d.kind === 'mijing_fight' && d.won === false && (d.outcome === 'death' || d.outcome === 'revive') && typeof d.vsId === 'string' && NPC_BY_ID.has(d.vsId)) return { ...d, scene: npcScene(d.vsId, 'slay', slayPick(d.vsId, me, at), String(d.vs ?? '')) };
  return d;
}
function stripIds(d: Record<string, unknown>) {
  const { vsId: _a, byId: _b, ...rest } = d;
  return rest;
}
export interface ViewCtx {
  now: number;
  w: World;
  logs: { id: number; at: number; self: boolean; data: unknown }[];
  rumors: { id: number; at: number; kind: string; who: string; text: string }[];
}

export function playerView(p: Player, c: ViewCtx) {
  const now = c.now;
  const d = accrue(p, now);
  const gate = gateOf(p.level);
  const ownedPills = gate >= 0 ? Object.keys(p.inv).filter((id) => (p.inv[id] ?? 0) > 0 && pillFits(id, gate)) : [];
  const inv = Object.entries(p.inv)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ ...itemView(id), n, weak: huTooWeak(p, id), benming: p.benming === id }))
    .sort((a, b) => b.tier - a.tier || a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  const eff = effectiveLoadout(p);
  const xx = XINGXIANG.find((x) => x.id === p.xingxiang);
  return {
    now,
    player: {
      id: p.id,
      daohao: p.daohao,
      gender: p.gender,
      xinxing: p.xinxing,
      xinxingName: XINXING_NAME[p.xinxing],
      xingxiang: p.xingxiang,
      xingxiangTitle: xx?.title ?? '',
      level: p.level,
      levelName: levelName(p.level),
      realm: realmOf(p.level),
      realmName: REALMS[realmOf(p.level)],
      xiuwei: p.xiuwei,
      need: need(p.level),
      status: statusAt(p, now),
      statusUntil: p.statusUntil,
      shane: p.shane,
      lastSeenAt: p.lastSeenAt,
      camp: campOf(p),
      lingshi: p.lingshi,
      protectUntil: p.protectUntil,
      needRebirth: p.needRebirth,
      feisheng: p.feisheng,
      deaths: p.deaths,
      xiong: notorious(p, now),

      slain: p.needRebirth && p.slainBy ? { name: NPC_BY_ID.get(p.slainBy.npc)?.name ?? '', scene: npcScene(p.slainBy.npc, 'slay', slayPick(p.slainBy.npc, p.id, p.slainBy.at)) } : null,
      titles: titlesOf(p, now),
      week: p.week.key === resetWeek(now) ? p.week : { duobao: 0, e: 0, shan: 0, jin: 0 },
      giftToday: p.giftDay !== resetDay(now),
      renshe: rensheFull(p.renshe),
      heirs: (p.heirs ?? []).map((n) => `${n}传人`),
      friendAsks: (p.friendAsks ?? []).length,
      catchup: { lag: lagRealms(p), zuo: catchupZuo(p), gate: catchupGate(p), leadName: p.lead ? levelName(Math.round(p.lead)) : null },
      zhidian: p.zhidian?.day === resetDay(now) ? { gave: p.zhidian.gave, got: p.zhidian.got } : { gave: 0, got: 0 },
    },
    dantian: { qi: Math.floor(d.qi), sitMs: d.sitMs, capMs: DANTIAN_CAP_MS, lostMs: d.lostMs, full: d.sitMs >= DANTIAN_CAP_MS, rate: rateAt(p, now), healthyRate: healthyRate(p, now) },
    gate: gate >= 0 ? { ...preview(p, [], now), three: isJie3(gate), pillsOwned: ownedPills.map((id) => ({ ...itemView(id), n: p.inv[id] ?? 0 })) } : null,
    gongfa: itemView(p.gongfa),
    power: powerOf(p, now),

    bag: { slots: braceletSlots(p), loadout: p.loadout, effective: eff, inv, keeps: (p.keeps ?? []).map((id) => YOULI.find((x) => x.id === id)).filter((s): s is NonNullable<typeof s> => !!s?.keep).map((s) => ({ id: s.id, name: s.keep as string, from: s.title })) },
    mijing: mijingView(p, c.w, now),
    enemies: enemiesView(p, c.w, now),
    boards: boardsView(c.w, now),
    inherit: inheritView(p, c.w, now),
    bounties: bountiesView(p, c.w, now),
    qiyu: p.qiyu.map((q) => {
      const e = QIYU.find((x) => x.id === q.eventId);

      const af = q.after ? QIYU_AFTER[q.eventId]?.[q.after] : undefined;
      if (af) return { uid: q.uid, title: af.title, text: af.text, again: null, after: true, options: af.options.map((o) => ({ label: o.label, off: false })) };
      return { uid: q.uid, title: e?.title ?? '', text: e?.text ?? '', again: q.again ?? null, options: (e?.options ?? []).map((o) => ({ label: o.label,  off: o.kind === 'none' && q.again === 'bad' })) };
    }),
    kills: p.pendingKills,
    yuan: yuanView(p, c.w, now),
    juling: { ...julingEfficacy(p, now), hours: JULING_HOURS },
    qiandao: { signed: signedToday(p, now), streak: qiandaoStreak(p, now), cycle: QIANDAO_CYCLE, lingshi: qiandaoLingshi(p) },
    rike: {
      tasks: p.rike.tasks.map((t) => ({ id: t.id, name: RIKE_NAME[t.id], done: t.done, prog: t.id === 'sit6' ? Math.min(t.prog, RIKE_SIT_MS) : null, need: t.id === 'sit6' ? RIKE_SIT_MS : null })),
      lingshi: rikeLingshi(p),
      bonus: p.rike.bonus,
      bonusHours: RIKE_BONUS_HOURS,

      bonusXiuwei: Math.floor(healthyRate(p, now) * RIKE_BONUS_HOURS),
    },
    youli: {
      away: p.youli && now < p.youli.end ? p.youli : null,
      options: youliOptions(p, now).map((o) => ({ ...o, lingshi: Math.round(YOULI_LINGSHI_PER_HOUR * o.hours * (1 + LINGSHI_REALM_SCALE * realmOf(p.level))), items: YOULI_ITEMS[o.hours] ?? 1, xiuwei: Math.floor(healthyRate(p, now) * o.hours * YOULI_XIUWEI_FACTOR) })),
      back: p.youliBack
        ? (() => {
            const s = YOULI.find((x) => x.id === p.youliBack?.story);
            const mt = p.youliBack?.meet ? meetText(p.youliBack.meet) : null;
            return { title: mt?.title ?? s?.title ?? '', text: mt?.text ?? s?.text ?? '', meet: !!mt, keep: p.youliBack?.keep && s?.keep ? { name: s.keep, fresh: p.youliBack.keep.fresh } : null, hours: p.youliBack.hours, at: p.youliBack.at, lingshi: p.youliBack.lingshi, xiuwei: p.youliBack.xiuwei ?? 0, items: p.youliBack.items.map(itemView) };
          })()
        : null,
    },

    logs: c.logs.map((l) => ({ ...l, data: stripIds(withScene(l.data as Record<string, unknown>, p.id, l.at)) })),
    rumors: c.rumors,
  };
}

export function rensheFull(id: string) {
  const r = rensheOf(id);
  if (!r) return null;
  return { ...r, matchName: rensheOf(r.match)?.name ?? '', clashName: rensheOf(r.clash)?.name ?? '' };
}

export function pubId(seed: number, id: string): string {
  return `h${hashSeed(`${seed}:pub:${id}`).toString(36)}`;
}

export function notorious(o: Player, now: number): boolean {
  return isXiong(o, now) || titleBonusAt(o, 'e', now) > 0;
}
const campName = (o: Player) => (campOf(o) === 'zheng' ? '正道' : campOf(o) === 'mo' ? '魔道' : '散修');
function personView(o: Player, now: number, seed: number) {
  return { id: pubId(seed, o.id), npc: o.npc ?? null, daohao: o.daohao, xingxiang: o.xingxiang, realmName: levelName(o.level), camp: campOf(o), campName: campName(o), status: statusAt(o, now), renshe: rensheOf(o.renshe)?.name ?? null, xiong: notorious(o, now), titles: [...titlesOf(o, now), ...(o.heirs ?? []).map((n) => `${n}传人`)], realm: realmOf(o.level) };
}

function prepFor(r: MiRealm, p: Player): { gongfa: string | null; fabao: string[]; gain: number } | null {
  if (activeGongfa(p).qi === r.qi) return null;
  const own = Object.keys(p.inv).filter((id) => (p.inv[id] ?? 0) > 0).map((id) => item(id)).filter((x) => x.qi === r.qi);
  const gf = own.filter((x) => x.cat === 'gongfa').sort((a, b) => b.tier - a.tier)[0];
  if (!gf) return null;
  return { gongfa: gf.name, fabao: own.filter((x) => x.cat === 'fabao').sort((a, b) => b.tier - a.tier).slice(0, 2).map((x) => x.name), gain: Math.round((PATH_MATCH_POW - 1) * 100) };
}
function realmCard(r: MiRealm, layer: 0 | 1 | 2, p: Player) {
  const L = r.layers[layer];
  const th = themeOf(r, p);
  return {
    id: r.id,
    name: r.name,
    source: r.source,
    art: r.art,
    tagline: r.tagline,
    camp: r.camp,
    campName: r.camp ? CAMP3_NAME[r.camp] : null,
    qi: r.qi,
    qiName: QI_NAME[r.qi],
    loot: r.loot,
    lootName: LOOT_THEME_NAME[r.loot],
    layer,
    layerName: LAYER_NAME[layer],
    place: L?.name ?? '',
    text: L?.text ?? '',
    boss: L?.boss.name ?? '',
    treasures: (L?.treasures ?? []).map(itemView),
    match: th,
    matchMult: themeMult(th),
    prep: prepFor(r, p),
  };
}

export function mijingView(p: Player, w: World, now: number) {
  const st = stayOf(w, p);
  const mine = [...w.stays.values()].filter((x) => x.pid === p.id && x.status === 'done').sort((a, b) => b.end - a.end)[0] ?? null;
  const realm = realmOf(p.level);
  const layer = miLayerOf(realm);
  const early = isEarly(p.level);
  const r = todayRealm(w, p, now);
  const card = realmCard(r, layer, p);
  const power = powerOf(p, now).power * card.matchMult;
  const inst = instOf(calDay(now), realm);
  const people = occupants(w, inst, now)
    .filter((x) => x.pid !== p.id)
    .map((x) => w.players.get(x.pid))
    .filter((x): x is Player => !!x);
  const enemyIds = new Set(p.enemies.map((e) => e.id));
  const first = early && isFirstTrip(p);

  const showing = yuanList(p)
    .filter((y) => (y.kind === 'debt' || y.kind === 'blood') && y.show?.day === calDay(now) && enemyIds.has(y.npc))
    .map((y) => w.players.get(y.npc))
    .filter((o): o is Player => !!o && !o.needRebirth && realmOf(o.level) === realm);
  const marks = (day: string) =>
    yuanList(p)
      .filter((y) => y.show?.day === day)
      .map((y) => ({ name: w.players.get(y.npc)?.daohao ?? y.name, kind: y.kind }));
  return {
    realmName: REALMS[realm],
    early,
    stance: p.stance,

    risk: first ? '头一趟有山门前辈暗中照看：每一关都过得去，不会受伤。往后就要凭自己了。' : riskText(p, now),
    today: {
      ...card,
      bossWin: first ? 1 : duelWinProb({ power, yun: 0 }, { power: stagePower(realm, 'boss', early ? 3 : MI_LATE.stages - 1), yun: 0 }),

      first,
      depths: early ? MI_DEPTHS.map((d, i) => ({ depth: i, name: d.name, stages: d.stages, hours: first ? (d.stages * FIRST_TRIP_STEP_MIN) / 60 : d.hours, boss: d.boss })) : null,
      late: early ? null : { stages: MI_LATE.stages, hours: MI_LATE.hours, bossAt: MI_LATE.stages * MI_LATE.stepHours },

      enemies: [...new Set([...people.filter((o) => enemyIds.has(o.id)), ...showing])].map((o) => ({ id: pubId(w.seed, o.id), daohao: o.daohao, ...(yuanOf(p, o.id, ['debt', 'blood']) ? { yuan: yuanOf(p, o.id, ['debt', 'blood'])?.kind, ta: taOf(o.id) } : {}) })),
      mates: yuanList(p).filter((y) => y.kind === 'repay' && y.show?.day === calDay(now)).map((y) => w.players.get(y.npc)?.daohao ?? y.name),
      xiong: people.filter((o) => notorious(o, now)).map((o) => ({ id: pubId(w.seed, o.id), daohao: o.daohao })),
      block: enterBlock(w, p, r.id, now),
      inst,
    },
    calendar: upcoming(w.seed, realm, now, 3).map((x, k) => ({ label: ['今日', '明日', '后日'][k] , day: x.day, marks: marks(x.day), ...realmCard(x.realm, layer, p) })),
    stay: st && st.status === 'in' ? { ...stayView(st, p), retake: retakeBlock(w, p, now), cash: nextOdds(w, st, p, now) } : null,
    last: mine ? stayView(mine) : null,
    hint: hasGuard(p)
      ? null
      : realmOf(p.level) >= HU_WEAK_FROM_REALM
        ? '没带管用的护符、遁符：化神起护身符要玄品以上（只在秘境里得），遁符坊市有卖。'
        : '没带护符、遁符：坊市几十灵石一张，护符挡一次伤，遁符保命。',
    newbie: p.newbieUntil > now ? p.newbieUntil : null,
  };
}

function hasGuard(p: Player): boolean {
  return effectiveLoadout(p).some((id) => ['hu', 'dun'].includes(item(id).effect ?? ''));
}

export function enemiesView(p: Player, w: World, now: number) {
  return p.enemies
    .map((e) => {
      const o = w.players.get(e.id);
      if (!o) return null;
      const at = whereIs(w, o, now);
      const myInst = instOf(calDay(now), realmOf(p.level));
      const b = bountyOn(w, o, now);
      return {
        ...personView(o, now, w.seed),
        why: e.why,
        times: e.times,
        at: e.at,
        where: at,
        reachable: ((at.kind === 'mijing' && at.inst === myInst) || (yuanOf(p, o.id, ['debt', 'blood'])?.show?.day === calDay(now) && realmOf(o.level) === realmOf(p.level))) && !p.stay,
        bounty: b.players + b.tiandao,
        myBounty: w.bounties.some((x) => x.status === 'open' && x.poster === p.id && x.target === o.id),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export function bountiesView(p: Player, w: World, now: number) {
  const ids = new Set<string>();
  for (const b of w.bounties) if (b.status === 'open' && now < b.expires) ids.add(b.target);
  for (const o of w.players.values()) if (notorious(o, now)) ids.add(o.id);
  const enemyIds = new Set(p.enemies.map((e) => e.id));
  return [...ids]
    .map((id) => {
      const o = w.players.get(id);
      if (!o || o.id === p.id) return null;
      const b = bountyOn(w, o, now);
      const seen = enemyIds.has(o.id) || notorious(o, now);
      return {
        ...personView(o, now, w.seed),
        players: b.players,
        tiandao: b.tiandao,
        total: b.players + b.tiandao,
        posters: w.bounties.filter((x) => x.status === 'open' && x.target === o.id).map((x) => x.posterName),
        where: seen ? whereIs(w, o, now) : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);
}

export function boardsView(w: World, now: number) {
  const players = [...w.players.values()];
  const wk = resetWeek(now);
  const bonusText: Record<string, (r: number) => string> = { xiuwei: () => '', jin: () => '', duobao: (r: number) => `秘境灵石 +${Math.round((BOARD_BONUS.duobao[r] as number) * 100)}%`, e: (r: number) => `斗法战力 +${Math.round((BOARD_BONUS.e[r] as number) * 100)}%，行踪人人看得见`, shan: (r: number) => `打坐 +${Math.round((BOARD_BONUS.shan[r] as number) * 100)}%` };
  return BOARDS_OPEN.map((b) => ({
    board: b,
    name: BOARD_NAME[b],
    titles: BOARD_TITLES[b].map((t, i) => ({ title: t as string, bonus: (bonusText[b] as (r: number) => string)(i) })).filter((x) => x.title),
    live: rankOf(players, b, wk, now).map((r) => ({ daohao: r.daohao, value: b === 'xiuwei' ? levelName(r.value) : b === 'jin' ? `破 ${r.value} 层` : r.value })),
    last: (w.boards.last[b] ?? []).map((r, i) => ({ daohao: r.daohao, value: r.value, title: i < 3 && BOARD_TITLES[b][i] ? (BOARD_TITLES[b][i] as string) : null })),
  }));
}

export function inheritView(p: Player, w: World, now: number) {
  const ih = openInherit(w, realmOf(p.level), now);
  if (!ih) return null;
  const m = masterOf(ih);
  const q = ih.trial === 'xin' ? WENXIN.find((x) => x.id === ih.q) : null;
  const me = ih.entrants.find((e) => e.pid === p.id);
  return {
    id: ih.id,
    master: m.name,
    cave: m.cave,
    text: m.text,
    qiName: QI_NAME[m.qi],
    pathMatch: activeGongfa(p).qi === m.qi,
    trial: ih.trial,
    question: q ? { text: q.text, options: q.options.map((o) => o.label) } : null,
    puppetWin: ih.trial === 'dou' ? duelWinProb({ power: powerOf(p, now).power, yun: powerOf(p, now).yun }, { power: realmPower(ih.realm * 4 + 2), yun: 0 }) : null,
    closes: ih.closes,
    entered: !!me,
    entrants: ih.entrants.length,
    block: me ? null : inheritBlock(w, p, ih.id, now),
  };
}
