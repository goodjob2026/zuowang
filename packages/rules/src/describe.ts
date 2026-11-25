import {
  BRACELET_SLOTS,
  DOU_FU,
  DUN_TO,
  HU_BLOCKS,
  HU_WEAK_MAX_TIER,
  FABAO_BONUS,
  FABAO_GUARD,
  FABAO_YUN,
  GONGFA_DOU,
  GONGFA_JIE_BONUS,
  GONGFA_SHANG,
  GONGFA_YUN,
  GONGFA_ZUO,
  MO_GONGFA_MULT,
  PILL_BONUS,
  YUN_ITEM,
  ZUO_DAN,
} from './config.ts';
import { type Item, fabaoRole } from './content.ts';

export const TIER_NAME = ['凡品', '灵品', '玄品', '地品', '天品', '仙品'] as const;
export const TIER_COLOR_NAME = ['灰', '白', '绿', '蓝', '紫', '橙'] as const;
export const CAT_NAME: Record<Item['cat'], string> = { gongfa: '功法', fabao: '法宝', dan: '丹药', cao: '草药', fu: '符箓', special: '奇珍', bracelet: '储物手镯' };
export const FOCUS_NAME = { zuo: '打坐', dou: '斗法', jie: '渡劫', shang: '疗伤', yun: '气运' } as const;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const pts = (v: number) => `${Math.round(v * 100)} 个点`;

export function effectText(x: Item): string {
  const t = x.tier;
  switch (x.cat) {
    case 'gongfa': {
      const m = x.mo ? MO_GONGFA_MULT : 1;
      const tail = x.mo ? '；魔功，修炼期间每日恶人值 +2' : '';
      if (x.focus === 'zuo') return `打坐 +${pct((GONGFA_ZUO[t] as number) * m)}${tail}`;
      if (x.focus === 'dou') return `斗法 +${pct((GONGFA_DOU[t] as number) * m)}${tail}`;
      if (x.focus === 'jie') return `突破、渡劫成功率 +${pts(GONGFA_JIE_BONUS[t] as number)}`;
      if (x.focus === 'shang') return `伤病时长缩为 ${pct(GONGFA_SHANG[t] as number)}`;
      return `气运 +${GONGFA_YUN[t]}`;
    }
    case 'fabao':
      {
        const role = fabaoRole(x);
        const tail = '（同类多带，第二件起减半）';
        if (role === 'shou') return `护身：落败时 ${pct(FABAO_GUARD[t] as number)} 的机会替你挡下${tail}`;
        if (role === 'qi') return `奇门：气运 +${FABAO_YUN[t]}${tail}`;
        return `攻伐：斗法 +${pct(FABAO_BONUS[t] as number)}${tail}`;
      }
    case 'dan':
    case 'cao':
    case 'fu': {
      const e = x.effect;
      if (e === 'tupo') return `元婴之前突破成功率 +${pts(PILL_BONUS[t] as number)}`;
      if (e === 'dujie') return `渡劫成功率 +${pts(PILL_BONUS[t] as number)}`;
      if (e === 'heal') return ['受伤少养三个时辰', '受伤立愈', '受伤立愈；濒死少养四个时辰', '受伤立愈；濒死少养八个时辰', '受伤立愈；濒死转为受伤', '受伤、濒死皆可立愈'][t] as string;
      if (e === 'zuo') return `服后一日内打坐 +${pct(ZUO_DAN[t] as number)}`;
      if (e === 'dou') return `带入秘境：斗法 +${pct(DOU_FU[t] as number)}`;
      if (e === 'yun') return `带入秘境：气运 +${YUN_ITEM[t]}`;
      if (e === 'hu') return `带入秘境：挡下 ${HU_BLOCKS[t]} 次负伤${t <= HU_WEAK_MAX_TIER ? '（化神起挡不住，要玄品以上）' : ''}`;
      if (e === 'dun') return `带入秘境或身上带着：本该身死时，${{ dying: '改为重伤濒死', hurt: '只落个受伤', safe: '全身而退' }[DUN_TO[t] as string]}`;
      return '';
    }
    case 'special':
      return x.effect === 'revive' ? '身死时自动用掉，魂归原身，境界不失' : '濒死立愈';
    case 'bracelet':
      return `可带 ${BRACELET_SLOTS[t]} 件入秘境`;
  }
}
