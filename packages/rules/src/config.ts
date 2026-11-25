export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export const DAILY_RESET_HOUR = 5;
export const ENCOUNTER_HOUR = 20;

export const DANTIAN_CAP_MS = 12 * HOUR;
export const NEW_PLAYER_DANTIAN_FULL = true;

export const REALMS = ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'] as const;
export const LAYERS_PER_REALM = 4;
export const MAX_LEVEL = REALMS.length * LAYERS_PER_REALM - 1;

export function baseRate(level: number): number {
  const r = Math.floor(level / LAYERS_PER_REALM);
  const l = level % LAYERS_PER_REALM;
  return Math.round(60 * 1.38 ** r * (1 + 0.12 * l));
}

export const TARGET_DAYS = [1.5, 3.5, 6, 9, 11, 12.5, 14, 15, 17.5] as const;
export const LAYER_SHARE = [0.2, 0.23, 0.27, 0.3] as const;

export const DILIGENT_HOURS_PER_DAY = 19.7;

export const EXPECTED_ZUO_MULT = [1.05, 1.1, 1.18, 1.25, 1.33, 1.4, 1.48, 1.55, 1.6] as const;

export const REALM_CALIB = [1.0, 0.56, 0.78, 0.8, 0.64, 0.64, 0.55, 0.585, 0.52];

function round2sig(x: number): number {
  if (x <= 0) return 0;
  const p = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
}
export function need(level: number): number {
  const r = Math.floor(level / LAYERS_PER_REALM);
  const l = level % LAYERS_PER_REALM;
  const hours = (TARGET_DAYS[r] as number) * DILIGENT_HOURS_PER_DAY * (LAYER_SHARE[l] as number) * (REALM_CALIB[r] as number);
  return round2sig(hours * baseRate(level) * (EXPECTED_ZUO_MULT[r] as number));
}

export type GateKind = 'tupo' | 'xiao' | 'da' | 'xian';
export const GATES: readonly { kind: GateKind; strikes: number; base: number }[] = [
  { kind: 'tupo', strikes: 0, base: 0.6 },
  { kind: 'tupo', strikes: 0, base: 0.5 },
  { kind: 'tupo', strikes: 0, base: 0.4 },
  { kind: 'xiao', strikes: 3, base: 0.4 },
  { kind: 'xiao', strikes: 3, base: 0.35 },
  { kind: 'da', strikes: 6, base: 0.3 },
  { kind: 'da', strikes: 6, base: 0.25 },
  { kind: 'da', strikes: 6, base: 0.2 },
  { kind: 'xian', strikes: 9, base: 0.15 },
];
export const SUCCESS_CAP = 0.7;

export const GATE_FAIL_PITY = 0.05;
export const GATE_FAIL_PITY_MAX = 0.2;

export const GATE_WAIT_BONUS_PER_DAY = 0.02;
export const GATE_WAIT_BONUS_MAX = 0.1;
export const MAX_PILLS_PER_ATTEMPT = 2;
export const PILL_BONUS = [0.06, 0.1, 0.14, 0.18, 0.22, 0.28] as const;
export const GONGFA_JIE_BONUS = [0.02, 0.03, 0.05, 0.07, 0.09, 0.12] as const;
export const MO_JIE_PENALTY = 0.08;
export const TUPO_FAIL_LOSS = 0.1;
export const JIE_FAIL_LOSS = 0.3;

export const JIE_DEATH = { mid: 0.1, low: 0.3 } as const;
export const JIE_DYING_MID = 0.7;
export const JIE_CLASS_MULT: Record<GateKind, number> = { tupo: 0, xiao: 1, da: 1.4, xian: 1.8 };

export const HURT_MS = 12 * HOUR;
export const DYING_MS = 24 * HOUR;
export const HURT_RATE = 0.5;
export const HURT_POWER = 0.8;
export const DYING_POWER = 0.5;
export const MO_RATE = 1.2;

export const SAN_RATE = 1.1;

export const ZUO_PACE = 0.95;

export const NEWBIE_MS = 48 * HOUR;
export const REBIRTH_PROTECT_MS = 1 * DAY;
export const SHANE_ZHENG = 100;
export const SHANE_MO = -100;
export const MO_GONGFA_DAILY_SHANE = -2;

export const GONGFA_ZUO = [0.05, 0.1, 0.18, 0.3, 0.45, 0.65] as const;
export const GONGFA_DOU = [0.05, 0.1, 0.18, 0.3, 0.45, 0.65] as const;
export const GONGFA_YUN = [3, 5, 8, 12, 16, 22] as const;
export const GONGFA_SHANG = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4] as const;
export const MO_GONGFA_MULT = 1.25;

export function realmPower(level: number): number {
  return 100 * 2 ** (level / LAYERS_PER_REALM);
}
export const FABAO_BONUS = [0.05, 0.1, 0.18, 0.28, 0.4, 0.6] as const;
export const FABAO_DECAY = 0.5;

export type FabaoRole = 'gong' | 'shou' | 'qi';
export const FABAO_ROLE: Record<string, FabaoRole> = {
  jian: 'gong', dao: 'gong', qiang: 'gong', bian: 'gong', chi: 'gong', yin: 'gong', shan: 'gong', qin: 'gong',

  zhong: 'shou', ding: 'shou', ta: 'shou', san: 'shou', huan: 'shou',
  jing: 'qi', zhu: 'qi', hulu: 'qi', fan: 'qi', ling: 'qi', suo: 'qi',
};
export const FABAO_ROLE_NAME: Record<FabaoRole, string> = { gong: '攻伐', shou: '护身', qi: '奇门' };
export const FABAO_PER_ROLE = 2;

export const FABAO_GUARD = [0.08, 0.12, 0.18, 0.25, 0.33, 0.42] as const;
export const FABAO_GUARD_MAX = 0.6;

export const FABAO_YUN = [2, 3, 5, 8, 11, 15] as const;
export const CONSUMABLE_DECAY = 0.8;

export const DOU_FU = [0.05, 0.08, 0.12, 0.18, 0.25, 0.35] as const;

export const HU_BLOCKS = [1, 1, 2, 2, 3, 3] as const;

export const HU_WEAK_FROM_REALM = 4;
export const HU_WEAK_MAX_TIER = 1;

export const DUN_TO = ['dying', 'dying', 'hurt', 'hurt', 'safe', 'safe'] as const;
export const YUN_ITEM = [2, 3, 5, 8, 11, 15] as const;
export const LUCK_SIGMA = 0.73;
export const YUN_WEIGHT = 0.01;
export const ZHENG_VS_MO_BONUS = 0.1;

export const ZUO_DAN = [0.05, 0.08, 0.12, 0.18, 0.25, 0.35] as const;

export const HEAL_HURT_CUT_MS = 6 * HOUR;

export const HEAL_DYING_CUT_MS = [0, 0, 8 * HOUR, 16 * HOUR] as const;
export const ZUO_BUFF_MS = 24 * HOUR;

export const MIJING_GRADES = [
  { name: '小福地', hours: 4, lingshi: 60, items: 1 },
  { name: '洞天', hours: 8, lingshi: 120, items: 2 },
  { name: '大福地', hours: 12, lingshi: 200, items: 3 },
] as const;

export const REALM_BAND = [0, 0, 1, 1, 2, 2, 3, 3, 3] as const;
export const BAND_NAME = ['练气筑基', '金丹元婴', '化神炼虚', '合体以上'] as const;
export const LILIAN_FACTOR = 0.5;
export const LINGSHI_REALM_SCALE = 0.15;
export const ALONE_LINGSHI_MULT = 1.4;
export const LOSS_LINGSHI_KEEP = 0.6;
export const KICKED_LINGSHI = 0.3;

export const KICKED_ITEM_KEEP = 0.5;

export const KILL_HEALTHY_CHANCE = [0, 0, 0.15, 0.25] as const;

export const EARLY_BANDS = [0, 1] as const;
export const REVENGE_BONUS = 0.1;

export const SPOILS_MAX = 2;

export const BEAST_POWER_MULT = 1.25;
export const BEAST_LOSS_KEEP = 0.5;

export const SLAIN_DROP_PLAIN = 1;

export const SLAY_SHANE = { mo: 5, zheng: -10, san: -8, spare: 2 } as const;

export const CAL_EPOCH = '2025-01-01';
export const CAL_CAMP_WINDOW = 4;

export const CAL_LAYER_SHIFT = 0;

export const MI_DEPTHS = [
  { name: '浅探', stages: 2, hours: 4, boss: false },
  { name: '深入', stages: 3, hours: 8, boss: false },
  { name: '探到底', stages: 4, hours: 12, boss: true },
] as const;

export const FIRST_TRIP_STEP_MIN = 1.5;
export const FIRST_TRIP_EASE = 0.25;

export const NPC_STAGE_REPEAT_MAX = 3;

export const GATE_SURE_BELOW = 1;

export const MI_LATE = { stages: 4, stepHours: 1.5, hours: 8 } as const;

export const STAGE_POWER = { beast: 0.57, array: 0.55, trap: 0.52, herb: 0.5, heart: 0.55, npc: 0.57, boss: 1.2 } as const;
export const STAGE_DEPTH_STEP = 0.08;

export const STAGE_SCRAPE_SHARE = 0.55;
export const BOSS_REPEL_SHARE = 0.6;

export const OPT_EFFECT = {

  safe: { pass: 0.06, loot: 0.8, shane: 0 },
  bold: { pass: -0.09, loot: 1.5, shane: 0 },

  shan: { pass: 0, loot: 1.0, shane: 3 },
  e: { pass: 0, loot: 1.3, shane: -3 },
} as const;

export const OPT_FIT_XINXING: Record<'safe' | 'bold' | 'shan' | 'e', Record<'jian' | 'ren' | 'kuang' | 'gui', number>> = {
  safe: { jian: 0, ren: 1, kuang: -1, gui: 1 },
  bold: { jian: 1, ren: -1, kuang: 1, gui: 0 },
  shan: { jian: 0, ren: 1, kuang: 0, gui: 0 },
  e: { jian: 0, ren: 0, kuang: 0, gui: 1 },
};
export const OPT_FIT_CAMP: Record<'shan' | 'e', Record<'zheng' | 'mo' | 'san', number>> = {
  shan: { zheng: 1, mo: -1, san: 0 },
  e: { zheng: -1, mo: 1, san: 0 },
};

export const OPT_FIT_PASS = 0.08;

export const CAMP_MATCH = 1.3;
export const PATH_MATCH_POW = 1.2;

export const THEME_CAT_MULT = 3;
export const THEME_LINGSHI_MULT = 1.5;

export const MI_LOOT = {
  early: [
    { lingshi: 1.9, items: 2.2 },
    { lingshi: 1.82, items: 4.1 },
    { lingshi: 1.0, items: 2.8 },
  ],
  late: { lingshi: 1.0, items: 3.05 },
} as const;

export const BOSS_LINGSHI_SHARE = 0.4;
export const BOSS_SIGNATURE_CHANCE = 0.5;

export const FAIL_ITEM_KEEP = 0.5;
export const FAIL_LINGSHI_KEEP = 0.7;

export const MEET_PER_STAGE = { early: 0.4, late: 0.07 } as const;

export const BOON_CHANCE = 0.7;
export const NPC_SHARE = 0.4;

export const CATCHUP_ZUO_PER_REALM = 0.5;
export const CATCHUP_ZUO_MAX = 1.5;
export const CATCHUP_GATE_PER_REALM = 0.05;
export const CATCHUP_GATE_MAX = 0.15;

export const CATCHUP_SHIELD_LAG = 2;

export const ZHIDIAN_HOURS = 2;
export const ZHIDIAN_SHANE = 1;
export const ZHIDIAN_GIVE_PER_DAY = 1;
export const ZHIDIAN_GET_PER_DAY = 2;

export const ENEMY_MAX = 6;
export const ENEMY_KEEP_MS = 14 * DAY;
export const PAIR_KILL_COOLDOWN_MS = 7 * DAY;
export const BOUNTY_MIN = 50;
export const BOUNTY_KEEP_MS = 7 * DAY;
export const BOUNTY_REFUND = 0.8;
export const XIONG_WINDOW_MS = 7 * DAY;
export const XIONG_KILLS = 3;
export const XIONG_BOUNTY_PER = 100;
export const XIONG_CLAIM_COOLDOWN_MS = 7 * DAY;
export const XIONG_MIN_REALM = 2;

export const CATCHUP_RATE = 3;
export const BASE_LOOT_TIER = [0, 0, 1, 1, 2, 2, 3, 3, 4] as const;

export const ORANGE_KEEP = 0.04;
export const LOOT_CATEGORY = [
  { cat: 'gongfa', w: 16 },
  { cat: 'fabao', w: 16 },

  { cat: 'pill', w: 36 },
  { cat: 'cao', w: 7 },
  { cat: 'fu', w: 18 },
  { cat: 'special', w: 3 },
] as const;

export const LOOT_PILL = [
  { e: 'gate', w: 81 },
  { e: 'zuo', w: 19 },
] as const;

export const LOOT_FU = [

  { e: 'dou', w: 44 },
  { e: 'yun', w: 35 },
  { e: 'hu', w: 12 },
  { e: 'dun', w: 9 },
] as const;
export const SPECIAL_LOOT = [
  { id: 'lunhui_zhu', w: 1 },
  { id: 'jiuzhuan_jindan', w: 2 },
  { id: 'bracelet', w: 2 },
] as const;

export const BRACELET_SLOTS = [10, 15, 20, 30, 40, 50] as const;

export const QIYU_MAX_PENDING = 3;
export const QIYU_NO_REPEAT_DAYS = 30;

export const ENCOUNTER_DAILY_CHANCE = 0.4;
export const ENCOUNTER_PAIR_COOLDOWN_MS = 7 * DAY;
export const ENCOUNTER_DECIDE_MS = 48 * HOUR;
export const KILL_SHANE = { zhengKillsMo: 5, moKillsZheng: -10, zhengSparesMo: 3, moSparesZheng: 2 } as const;
export const MAX_KILLED_PER_WEEK = 2;

export const ZHENG_MO_FIGHT_CHANCE = 0.25;

export const ZHAN_SUCCESS = 0.6;

export const SHOP_PRICE = {
  cao: [20, 110],
  fu: [30, 80],
  dan_tupo: [40, 120],
  dan_zuo: [30, 90],
  fabao: [80, 240],

  gongfa: [100, 300],
  bracelet_1: 600,
} as const;
export const SELL_RATIO = 0.5;

export function sellPriceByTier(tier: number): number {
  return Math.round(30 * 2.2 ** tier * SELL_RATIO);
}

export const JULING_HOURS = 1;
export const JULING_EFFICACY = [1, 0.7, 0.5, 0.3] as const;
export const JULING_MAX_PER_DAY = 5;
export const PAY_PRODUCTS = {
  juling: { name: '聚灵丹', priceCents: 0 },
  heal_hurt: { name: '疗伤 · 受伤立愈', priceCents: 0 },
  heal_dying: { name: '疗伤 · 濒死立愈', priceCents: 0 },
} as const;

export const RIKE_POOL = [
  { id: 'collect', w: 3 },
  { id: 'sit6', w: 2 },
  { id: 'mijing', w: 2 },
  { id: 'qiyu', w: 2 },
  { id: 'shop', w: 1 },
  { id: 'dan', w: 1 },
  { id: 'youli', w: 2 },
] as const;
export const RIKE_COUNT = 3;
export const RIKE_SIT_MS = 6 * HOUR;
export const RIKE_LINGSHI = 25;
export const RIKE_BONUS_HOURS = 1;
export const RIKE_SHOP_MIN = 20;

export const QIANDAO_CYCLE = 7;

export const QIANDAO_LINGSHI_RATE = 0.2;

export const YOULI_HOURS = [2, 4, 8] as const;
export const YOULI_LINGSHI_PER_HOUR = 8;

export const YOULI_ITEMS: Record<number, number> = { 2: 1, 4: 1.5, 8: 2.5 };
export const YOULI_RARE_PER_HOUR = 0.004;
export const YOULI_RECENT = 6;
export const YOULI_XIUWEI_FACTOR = 0.3;

export const BOARD_SHOW = 10;
export const BOARD_TITLES = {
  xiuwei: ['独断万古', '', ''],
  jin: ['一骑绝尘', '', ''],
  duobao: ['夺宝魁首', '寻宝圣手', '福缘深厚'],
  e: ['九幽魔君', '血手修罗', '笑面阎罗'],
  shan: ['九霄真君', '妙手菩萨', '慈眉金刚'],
} as const;

export const BOARD_BONUS = {
  xiuwei: [0, 0, 0],
  jin: [0, 0, 0],
  duobao: [0.3, 0.2, 0.1],
  e: [0.15, 0.1, 0.05],
  shan: [0.15, 0.1, 0.05],
} as const;

export const GIFT_PER_DAY = 1;

export const SHOP_BAND_PRICE_BASE = 60;

export const SHOP_GATE_PILL_MULT = 5;

export const QUIZ_QUESTIONS = 7;
export const QUIZ_SHANE_PER_POINT = 4;
export const QUIZ_SHANE_CLAMP = 40;

export const FABAO_MATCH = 1.5;

export const PATH_MATCH_CHANCE = 0.7;

export const INHERIT_EVERY_DAYS = 2;
export const INHERIT_HOUR = 12;
export const INHERIT_OPEN_MS = 24 * 3600_000;
export const INHERIT_PATH_BONUS = 2;
export const INHERIT_CONSOLE = 30;

export const QUIZ_EXTREME = 8;
export const QUIZ_RETRIES = 1;
export const DAOHAO_MIN = 2;
export const DAOHAO_MAX = 6;

export const ACTIVE_WINDOW_MS = 7 * DAY;
export const RUMOR_SHOW_MAX = 5;

export const RUMOR_PAGE_DAYS = 14;
export const RUMOR_JIE_MIN_GATE = 3;

export const GATE_ALLY_CHANCE = { friend: 0.35, npc_friend: 0.25, npc_sworn: 0.6 } as const;

export const GATE_HELP_EACH = 0.05;
export const GATE_HELP_MAX = 0.12;

export const GATE_FOE_CHANCE = { marked: 0.25, grudge: 0.25, npc_feud: 0.35 } as const;

export const GATE_FOE_PENALTY = 0.15;

export const GATE_HELPER_GUARD = 0.08;

export const GATE_VISIT_CAP = 0.82;

export const TEAM_POWER = 0.4;

export const LUNDAO_HOURS = 0.5;
export const LUNDAO_GIVE_PER_DAY = 1;
export const LUNDAO_GET_PER_DAY = 2;
export const LUNDAO_TRUST = 6;

export const RAID_MIN_LEVEL = 4;

export const RAID_PER_DAY = 2;
export const RAID_SAME_MS = 3 * DAY;

export const RAID_SHIELD_MS = 8 * HOUR;

export const RAID_HIT_PER_DAY = 1;
export const RAID_STREAK_DAYS = 2;

export const RAID_TAKE = 0.2;
export const RAID_TAKE_CAP_HOURS = 2;

export const RAID_HOME_BONUS = 0.1;

export const RAID_HURT_MS = 2 * HOUR;
export const RAID_HEAVY_MS = 8 * HOUR;

export const RAID_SHANE = -3;

export const RAID_REVENGE_MS = 12 * HOUR;
export const RAID_REVENGE_BONUS = 0.1;

export const TEAM_NPC_JOIN = { sworn: 1, friend: 0.8, neutral: 0 } as const;

export const SHEN_THANKS = 0.1;
export const SHEN_TRUST = 6;

export const AID_POWER = 0.12;

export const AVENGER_MAX = 2;

export const VOW_DELAY_MS = 6 * HOUR;

export const AMENDS_BASE = 150;

export const MEDIATE_COOLDOWN_MS = 14 * DAY;

export const LOADOUT_CONSUMABLE_MAX = 8;

export const SWORN_BOSS_HELP = 0.1;

export const NPC_EVENT_CHANCE = 0.4;

export const QIYU_REVISIT_DAYS = 3;
export const QIYU_BIG_CHANCE = 0.5;
export const QIYU_BIG_MULT = 1.5;
export const QIYU_BAD_MULT = 0.5;

export const QIYU_NOON_HOUR = 13;

export const JIE3_FROM_GATE = 5;
export const JIE3_WEIGHTS = [0.2, 0.3, 0.5] as const;

export const JIE3_STRIKE_MAX = 0.97;
export const JIE3_PILL_MULT = 1.5;
export const JIE3_FABAO_BONUS = [0.06, 0.09, 0.13, 0.17, 0.22, 0.28] as const;
export const JIE3_GUARD_MULT = 2;

export const JIE3_FELL_DEATH = [0.6, 0.3, 0] as const;
export const JIE3_SAFE_DYING = [0.5, 0.25, 0] as const;

export const RUMOR_NPC_PER_DAY = 3;

export const RUMOR_JOIN_PER_DAY = 12;

export const NPC_REPAY = {
  fu: { betray: 0.45, cold: 0.15, grateful: 0 },
  ao: { betray: 0.03, cold: 0.5, grateful: 0.03 },
  bao: { betray: 0, cold: 0, grateful: 0.4 },
  ping: { betray: 0.02, cold: 0.08, grateful: 0.1 },
} as const;

export const NPC_REPAY_THIN = 0.1;

export const NPC_REPAY_FRIEND = 0.3;

export const NPC_TEAM_ROB = { fu: 0.3, ao: 0.05, bao: 0, ping: 0.03 } as const;

export const NPC_BETRAY_TAKE = 0.3;

export const NPC_GRATEFUL_GIFT = 0.8;

export const YUAN_MAX = 3;

export const YUAN_KEEP_MS = 10 * DAY;

export const YUAN_GAP_MS = [1 * DAY, 2 * DAY] as const;

export const YUAN_DEBT_BEG_MS = 7 * DAY;

export const YUAN_TRIES = 3;

export const YUAN_REPAY_EVERY_MS = 7 * DAY;

export const YUAN_REPAY_DAILY = 0.5;

export const YUAN_ASK_MS = 2 * DAY;

export const YUAN_SIEGE_AFTER_MS = 1 * DAY;
export const YUAN_SIEGE_GAP_MS = 3 * DAY;
export const YUAN_SIEGE_QUIET_MS = 14 * DAY;

export const SANGU_COLDS = 2;
export const SANGU_GIFT = 2;
export const SANGU_KEEP_MS = 21 * DAY;

export const BEG_AGAIN = 0.225;
export const BEG_GONE = 0.225;
export const BEG_AGAIN_TAKE = 0.1;
export const BEG_THANKS = 20;

export const BEG_MEM_MS = 30 * DAY;

export const YOULI_SEEN_KEEP = 80;

export const YOULI_MEET = 0.15;

export const YOULI_MEET_GIFT = 10;

export const QIYU_AFTER_DAYS = [3, 7] as const;

export const YOULI_REPAY_GAP_MS = 7 * DAY;

export const YUAN_SPROUT_EVERY_MS = 2 * HOUR;
