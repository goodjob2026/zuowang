export type GameEvent = { kind: string } & Record<string, unknown>;

export interface Rumor {
  at: number;
  kind: 'jie_ok' | 'jie_fail' | 'death' | 'orange' | 'zhan' | 'feisheng' | 'revenge' | 'bounty' | 'bounty_post' | 'board' | 'inherit_open' | 'inherit_won' | 'npc_death' | 'npc_join' | 'join' | 'tupo_ok' | 'raid' | 'yuan';
  who: string;
  text: string;
}
