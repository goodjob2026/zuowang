import fabaoRaw from '../content/fabao.json' with { type: 'json' };
import gongfaRaw from '../content/gongfa.json' with { type: 'json' };
import mijingRaw from '../content/mijing.json' with { type: 'json' };
import npcStagesRaw from '../content/npcstages.json' with { type: 'json' };
import qiyuRaw from '../content/qiyu.json' with { type: 'json' };
import qiyuAfterRaw from '../content/qiyuafter.json' with { type: 'json' };
import textsRaw from '../content/texts.json' with { type: 'json' };
import wenxinRaw from '../content/wenxin.json' with { type: 'json' };
import yaoRaw from '../content/yao.json' with { type: 'json' };
import yaoMovedRaw from '../content/yao_moved.json' with { type: 'json' };
import youliRaw from '../content/youli.json' with { type: 'json' };
import inheritRaw from '../content/inherit.json' with { type: 'json' };
import mijing5Raw from '../content/mijing5.json' with { type: 'json' };
import stages5Raw from '../content/stages5.json' with { type: 'json' };
import rensheRaw from '../content/renshe.json' with { type: 'json' };
import { BRACELET_SLOTS, FABAO_ROLE, type FabaoRole } from './config.ts';

export type Focus = 'zuo' | 'dou' | 'jie' | 'shang' | 'yun';
export type YaoType = 'dan' | 'cao' | 'fu';
export type YaoEffect = 'tupo' | 'dujie' | 'heal' | 'zuo' | 'dou' | 'yun' | 'hu' | 'dun';
export type ItemCat = 'gongfa' | 'fabao' | 'dan' | 'cao' | 'fu' | 'special' | 'bracelet';

export type QiStyle = 'qing' | 'mu' | 'huo' | 'bing' | 'jian' | 'lei' | 'tu' | 'mo' | 'fo';
export const QI_STYLES: QiStyle[] = ['qing', 'mu', 'huo', 'bing', 'jian', 'lei', 'tu', 'mo', 'fo'];

export interface Item {
  id: string;
  name: string;
  tier: number;
  cat: ItemCat;
  icon: string;
  source: string;
  flavor: string;
  focus?: Focus;
  mo?: boolean;
  qi?: QiStyle;
  kind?: string;
  effect?: YaoEffect | 'revive' | 'fullheal';
  slots?: number;
}

export interface QiyuEffects {
  shane?: number;
  lingshi?: number;
  xiuweiHours?: number;
  item?: { type: 'cao' | 'fu' | 'dan' | 'fabao' | 'gongfa'; tierOffset: number; path?: boolean } | null;
  hurt?: boolean;
}
export interface QiyuOutcome {
  weight: number;
  text: string;
  effects?: QiyuEffects;
}
export interface QiyuOption {
  label: string;
  kind: 'shan' | 'e' | 'none';
  outcomes: QiyuOutcome[];
}
export interface QiyuEvent {
  id: string;
  title: string;
  text: string;
  minRealm: number;
  weight?: number;
  options: QiyuOption[];
}
export interface WenxinQuestion {
  id: string;
  text: string;
  options: { label: string; shan: number; gang: number; dong: number; qing: number }[];
}
export interface MijingContent {
  prefix: string[];
  place: string[];
  suffix: string[];
  specials: { name: string; source: string; grade: number }[];
  gradeText: Record<string, string[]>;
}
export type Texts = Record<string, unknown> & {
  zuo: string[];
  collect: string[];
  full: string[];
  errors: Record<string, string>;
  encounter: Record<string, string[]>;
};

interface RawCommon {
  id: string;
  name: string;
  tier: number;
  source: string;
  flavor: string;
  icon: string;
}

export const GONGFA: Item[] = (gongfaRaw as (RawCommon & { focus: Focus; mo: boolean; qi: QiStyle })[]).map((x) => ({
  ...x,
  cat: 'gongfa' as const,
}));
export const FABAO: Item[] = (fabaoRaw as (RawCommon & { kind: string; qi: QiStyle })[]).map((x) => ({ ...x, cat: 'fabao' as const }));

export function fabaoRole(x: Item): FabaoRole {
  return FABAO_ROLE[x.kind ?? ''] ?? 'gong';
}

export const QI_NAME: Record<QiStyle, string> = { qing: '清', mu: '木', huo: '火', bing: '冰', jian: '剑', lei: '雷', tu: '土', mo: '魔', fo: '佛' };
export const YAO: Item[] = (yaoRaw as (RawCommon & { type: YaoType; effect: YaoEffect })[]).map((x) => ({
  id: x.id,
  name: x.name,
  tier: x.tier,
  source: x.source,
  flavor: x.flavor,
  icon: x.icon,
  effect: x.effect,
  cat: x.type,
}));

export const BRACELET_NAMES = ['粗铁手镯', '青藤手镯', '碧玉手镯', '沧海手镯', '紫霄手镯', '乾坤手镯'] as const;
const BRACELET_FLAVOR = [
  '铁匠铺里随手打的粗镯子，内圈刻着半道阵纹。磨得手腕发红，东西倒是丢不了。',
  '青藤编成，戴久了会长出一两片新叶。山里的散修人手一只，图它不怕水。',
  '碧玉里头隐着一层水光，摇一摇，听得见里面东西轻轻碰着。',
  '镯面刻着一道浪，据说是照着东海的潮头刻的。夜里贴着耳朵，有涛声。',
  '紫气在镯子里绕着走，从不停下。戴它的人，走路都轻了几分。',
  '镯子不大，里面却像另有一方天地。有人往里放了一座小院，后来就再没找着门。',
] as const;
export const SPECIALS: Item[] = [
  {
    id: 'lunhui_zhu',
    name: '轮回珠',
    tier: 4,
    cat: 'special',
    icon: 'misc_lunhui',
    source: '原创',
    flavor: '珠子里映着一个人影，看久了，会发觉那是自己。它只亮一回，亮过便碎了。',
    effect: 'revive',
  },
  {
    id: 'jiuzhuan_jindan',
    name: '九转金丹',
    tier: 4,
    cat: 'special',
    icon: 'misc_jiuzhuan',
    source: '西游记',
    flavor: '兜率宫里的炉火烧了九转才出一炉。丹色金黄，凑近了闻，竟是新米的香。',
    effect: 'fullheal',
  },
  ...BRACELET_NAMES.map((name, t) => ({
    id: `bracelet_${t}`,
    name,
    tier: t,
    cat: 'bracelet' as const,
    icon: `bracelet_${t}`,
    source: '原创',
    flavor: BRACELET_FLAVOR[t] as string,
    slots: BRACELET_SLOTS[t] as number,
  })),
];

export const ALL_ITEMS: Item[] = [...GONGFA, ...FABAO, ...YAO, ...SPECIALS];
export const ITEMS = new Map<string, Item>(ALL_ITEMS.map((x) => [x.id, x]));
if (ITEMS.size !== ALL_ITEMS.length) {
  const seen = new Set<string>();
  const dup = ALL_ITEMS.filter((x) => (seen.has(x.id) ? true : (seen.add(x.id), false))).map((x) => x.id);
  throw new Error(`内容表 id 重复: ${dup.slice(0, 5).join(',')}`);
}

export const YAO_MOVED = yaoMovedRaw as Record<string, string>;

export function canon(id: string): string {
  return YAO_MOVED[id] ?? id;
}

export function findItem(id: string): Item | undefined {
  return ITEMS.get(canon(id));
}
export function item(id: string): Item {
  const x = ITEMS.get(canon(id));
  if (!x) throw new Error(`未知物品 ${id}`);
  return x;
}

export const QIYU: QiyuEvent[] = qiyuRaw as QiyuEvent[];

export interface QiyuAfter {
  title: string;
  text: string;

  options: { label: string; outcomes: QiyuOutcome[] }[];
}
export const QIYU_AFTER = qiyuAfterRaw as unknown as Record<string, Partial<Record<'shan' | 'e', QiyuAfter>>>;
export const WENXIN: WenxinQuestion[] = wenxinRaw as WenxinQuestion[];

export interface InheritMaster {
  id: string;
  name: string;
  qi: QiStyle;
  xinxing: Xinxing;
  cave: string;
  text: string;
}
export const INHERIT_MASTERS: InheritMaster[] = inheritRaw as InheritMaster[];
export const MIJING: MijingContent = mijingRaw as MijingContent;
export const TEXTS: Texts = textsRaw as unknown as Texts;
export interface YouliStory {
  id: string;
  band: number;
  title: string;
  text: string;

  gives?: 'cao' | 'fu';

  keep?: string;
}
export const YOULI: YouliStory[] = youliRaw as YouliStory[];

export type Camp3 = 'zheng' | 'mo' | 'san';
export type StageKind = 'beast' | 'array' | 'trap' | 'herb' | 'heart' | 'npc' | 'boon';

export type OptTag = 'safe' | 'bold' | 'shan' | 'e';
export interface StageOption {
  label: string;
  tag: OptTag;
  win: string;
  scrape: string;
  fail: string;
}
export interface StageDef {
  id: string;
  kind: StageKind;
  title: string;
  text: string;
  layers?: number[];
  camp?: Camp3 | null;
  npc?: string;
  win?: string;
  scrape?: string;
  fail?: string;
  options?: StageOption[];
  draft?: boolean;
}
export interface BossDef {
  name: string;
  text: string;
  win: string;
  repelled: string;
  fail: string;
}
export interface RealmLayer {
  name: string;
  text: string;
  boss: BossDef;
  treasures: string[];
}
export type LootTheme = 'gongfa' | 'fabao' | 'dan' | 'cao' | 'fu' | 'lingshi';
export interface MiRealm {
  id: string;
  name: string;
  source: string;
  camp: Camp3 | null;
  qi: QiStyle;
  loot: LootTheme;
  art: string;
  tagline: string;
  layers: RealmLayer[];
  stages: StageDef[];
  draft?: boolean;
}
export const MI_REALMS: MiRealm[] = mijing5Raw as MiRealm[];
export const STAGES5: StageDef[] = stages5Raw as StageDef[];

export const GENERIC_STAGES: StageDef[] = STAGES5.filter((s) => s.id.startsWith('g_') && s.kind !== 'boon');
export const BOON_STAGES: StageDef[] = STAGES5.filter((s) => s.kind === 'boon');
export const NPC_STAGES: StageDef[] = STAGES5.filter((s) => s.id.startsWith('c_'));

export const NPC_EVENTS: StageDef[] = npcStagesRaw as StageDef[];
export const STAGE_BY_ID = new Map<string, StageDef>([...MI_REALMS.flatMap((r) => r.stages), ...STAGES5, ...NPC_EVENTS].map((s) => [s.id, s]));
export function miRealm(id: string): MiRealm | undefined {
  return MI_REALMS.find((r) => r.id === id);
}
export const LOOT_THEME_NAME: Record<LootTheme, string> = { gongfa: '功法', fabao: '法宝', dan: '丹药', cao: '灵草', fu: '符箓', lingshi: '灵石' };
export const CAMP3_NAME: Record<Camp3, string> = { zheng: '正道', mo: '魔道', san: '散修' };

export interface Renshe {
  id: string;
  xinxing: string;
  dong: number;
  qing: number;
  name: string;
  motto: string;
  desc: string;
  dao: string;
  match: string;
  clash: string;
  color: string;
}
export const RENSHE: Renshe[] = rensheRaw as Renshe[];
export function rensheOf(id: string): Renshe | undefined {
  return RENSHE.find((r) => r.id === id);
}

export const STARTER_GONGFA: Item =
  GONGFA.find((x) => x.name === '长春功' && x.focus === 'zuo') ??
  GONGFA.find((x) => x.tier === 0 && x.focus === 'zuo' && !x.mo) ??
  (() => {
    throw new Error('内容表里没有灰品打坐功法');
  })();

const starter = (name: string, mo: boolean): Item =>
  GONGFA.find((x) => x.name === name && x.tier === 0 && x.focus === 'zuo' && x.mo === mo) ??
  GONGFA.find((x) => x.tier === 0 && x.focus === 'zuo' && x.mo === mo) ??
  (() => {
    throw new Error(`内容表里没有凡品打坐${mo ? '魔功' : '功法'}`);
  })();
export const STARTER_ZHENG: Item = starter('抱朴坐忘诀', false);
export const STARTER_MO_LEAN: Item = starter('魔心诀', true);
export const STARTER_MO: Item = starter('血饮功', true);

const byCatTier = new Map<string, Item[]>();
for (const x of ALL_ITEMS) {
  const k = `${x.cat}:${x.tier}`;
  const arr = byCatTier.get(k) ?? [];
  arr.push(x);
  byCatTier.set(k, arr);
}
export function itemsOf(cat: ItemCat, tier: number, filter?: (x: Item) => boolean): Item[] {
  const arr = byCatTier.get(`${cat}:${tier}`) ?? [];
  return filter ? arr.filter(filter) : arr;
}

export type Gender = 'm' | 'f';
export type Xinxing = 'jian' | 'ren' | 'kuang' | 'gui';
export const XINXING_NAME: Record<Xinxing, string> = { jian: '剑心', ren: '仁心', kuang: '狂心', gui: '诡心' };
export const XINXING_DESC: Record<Xinxing, string> = {
  jian: '嫉恶如仇，宁折不弯。',
  ren: '温润如玉，见不得人受苦。',
  kuang: '快意恩仇，天地也拘不住。',
  gui: '心思九转，笑里藏针。',
};
export interface Xingxiang {
  id: string;
  gender: Gender;
  xinxing: Xinxing;
  title: string;
}

const XX_TITLES: Record<string, string[]> = {
  m_jian: ['白衣剑修', '青衫剑客', '玄衣剑仙', '灰袍剑隐', '蓝衫少年', '金冠剑君'],
  f_jian: ['白衣剑仙', '青衣女侠', '红绫剑修', '墨衣剑姬', '雪发剑灵', '黄衫少女'],
  m_ren: ['青衫书生', '杏林医修', '抱琴散人', '白眉道人', '布衣僧人', '持卷先生'],
  f_ren: ['素手医仙', '抚琴仙子', '莲冠女冠', '采药少女', '鹤氅仙姑', '桃花仙子'],
  m_kuang: ['醉卧狂生', '断岳刀客', '赤发魔修', '虎皮蛮修', '白发狂刀', '金甲战修'],
  f_kuang: ['红衣魔女', '玄衣刀客', '赤练仙子', '紫电雷女', '蛮荒猎女', '金环女将'],
  m_gui: ['紫衣公子', '白发鬼修', '银面客', '黑袍阴师', '青面书吏', '红衣妖僧'],
  f_gui: ['狐裘妖女', '黑纱女子', '银冠蛊女', '白衣幽女', '青蛇妖姬', '牵丝傀师'],
};
export const XINGXIANG: Xingxiang[] = Object.entries(XX_TITLES).flatMap(([k, titles]) => {
  const [g, xx] = k.split('_') as [Gender, Xinxing];
  return titles.map((title, i) => ({ id: `${g}_${xx}_${i + 1}`, gender: g, xinxing: xx, title }));
});
