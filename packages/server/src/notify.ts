import type { GameEvent } from '@zuowang/rules';

export function notifyText(e: GameEvent): string | null {
  switch (e.kind) {
    case 'slain':
      return e.revived ? `你被${e.by}斩了，靠轮回珠还魂。打开坐忘看看，记下这笔仇。` : `你被${e.by}斩了，跌落一个大境界${Array.isArray(e.loot) && e.loot.length ? `，带进秘境的法宝被他夺去 ${e.loot.length} 件` : ''}。打开坐忘看看，记下这笔仇。`;
    case 'mijing_fight':

      if (e.aggressor || !e.holderFight) return null;
      return e.won ? `${e.vs}闯到${e.name}最后一关来夺宝，被你打退了。` : `${e.vs}闯到${e.name}最后一关，把你手里的宝物夺走了。`;
    case 'bounty_claimed':
      return `你挂在${e.target}头上的悬赏，被${e.by}领走了：${e.target}已被斩。`;
    case 'inherit_open':
      return `${e.realm}的道友留意：前辈${e.master}的洞府「${e.cave}」现世了，只开一天。打开坐忘去拜见，前辈只传一个有缘人。`;
    case 'zhan_escaped':
      return `${e.by}要斩你，你拼死遁走，重伤濒死。`;
    default:
      return null;
  }
}
