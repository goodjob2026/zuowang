import { type LedgerWorld, record } from './ledger.ts';
import { TRUST_GAIN, addTrust } from './trust.ts';
import { CATCHUP_RATE, GIFT_PER_DAY, ZHIDIAN_GET_PER_DAY, ZHIDIAN_GIVE_PER_DAY, ZHIDIAN_HOURS, ZHIDIAN_SHANE } from './config.ts';
import { item } from './content.ts';
import type { GameEvent } from './events.ts';
import { type Player, addItem, bank, catchupZuo, grantXiuweiHours, realmOf, removeItem, statusAt } from './player.ts';
import { applyShane } from './qiyu.ts';
import { resetDay } from './time.ts';

export function giftBlock(p: Player, to: Player | undefined, id: string, now: number): string | null {
  if (!to) return '没有这个人';
  if (to.id === p.id) return '不能送给自己';
  if (p.giftDay === resetDay(now)) return `今天已经送过了（每天 ${GIFT_PER_DAY} 件），明早再送`;
  let it;
  try {
    it = item(id);
  } catch {
    return '没有这件东西';
  }
  if (!['dan', 'cao', 'fu'].includes(it.cat)) return '只能送丹药、草药、符箓';
  if ((p.inv[id] ?? 0) < 1) return '你身上没有这件东西';
  return null;
}
export function gift(p: Player, to: Player | undefined, id: string, now: number, out: (id: string, e: GameEvent) => void): GameEvent[] {
  const why = giftBlock(p, to, id, now);
  if (why) throw new Error(why);
  const t = to as Player;
  removeItem(p, id);
  addItem(t, id, 1);
  p.giftDay = resetDay(now);
  addTrust(t, p.id, TRUST_GAIN.gift);
  out(t.id, { kind: 'gift_got', from: p.daohao, item: id });
  return [{ kind: 'gift_sent', to: t.daohao, item: id }];
}

export function giftNpc(w: LedgerWorld, p: Player, to: Player | undefined, id: string, now: number): GameEvent[] {
  if (!to?.npc || to.needRebirth) throw new Error('没有这个人');
  const why = giftBlock(p, to, id, now);
  if (why) throw new Error(why);
  removeItem(p, id);
  addItem(to, id, 1);
  p.giftDay = resetDay(now);
  record(w, p.id, to.npc, 'gift', now);
  return [{ kind: 'gift_sent', to: to.daohao, item: id }];
}

export function zhidianBlock(p: Player, to: Player | undefined, now: number): string | null {
  if (!to) return '没有这个人';
  if (to.id === p.id) return '不能指点自己';
  if (p.needRebirth || to.needRebirth) return '尚未转世';
  if (realmOf(to.level) >= realmOf(p.level)) return '只能指点境界比你低的道友';
  if (statusAt(p, now) === 'dying') return '你自己伤势垂危，指点不了别人';
  const day = resetDay(now);
  if ((p.zhidian?.day === day ? p.zhidian.gave : 0) >= ZHIDIAN_GIVE_PER_DAY) return '今天已经指点过一位道友了，明早再来';
  if ((to.zhidian?.day === day ? to.zhidian.got : 0) >= ZHIDIAN_GET_PER_DAY) return '这位道友今天已经得了两回指点，再多也听不进去了';
  return null;
}
export function zhidian(p: Player, to: Player | undefined, now: number, out: (id: string, e: GameEvent) => void): GameEvent[] {
  const why = zhidianBlock(p, to, now);
  if (why) throw new Error(why);
  const t = to as Player;
  const day = resetDay(now);
  if (p.zhidian?.day !== day) p.zhidian = { day, gave: 0, got: p.zhidian?.day === day ? p.zhidian.got : 0 };
  if (t.zhidian?.day !== day) t.zhidian = { day, gave: 0, got: 0 };
  p.zhidian.gave += 1;
  t.zhidian.got += 1;
  bank(t, now);
  const evT: GameEvent[] = [];

  const boost = (1 + catchupZuo(t)) * (t.level < t.maxLevel ? CATCHUP_RATE : 1);
  const gain = grantXiuweiHours(t, ZHIDIAN_HOURS / boost, now, evT);
  out(t.id, { kind: 'zhidian_got', from: p.daohao, xiuwei: gain });
  for (const e of evT) out(t.id, e);
  const ev: GameEvent[] = [];
  applyShane(p, ZHIDIAN_SHANE, ev, now);
  addTrust(to as Player, p.id, TRUST_GAIN.zhidian);
  return [{ kind: 'zhidian_gave', to: t.daohao, xiuwei: gain }, ...ev];
}
