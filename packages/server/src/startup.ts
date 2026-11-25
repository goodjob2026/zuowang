import { parseMgKeys } from './qingliao.ts';

export interface Startup {

  mode: 'mg' | 'dev';
  production: boolean;

  test: boolean;

  devLogin: boolean;
  pfCode: string;

  mgKeysJson: string | null;
  kids: string[];
  cors: string[];
  warnings: string[];
}
type Env = Record<string, string | undefined>;

export function resolveStartup(env: Env): { ok: true; cfg: Startup } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const production = (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
  const test = env.TEST_MODE === '1';
  const devFlag = env.DEV_LOGIN === '1';
  const keysJson = (env.MG_PUBLIC_KEYS ?? '').trim();
  const pfCode = (env.MG_PF_CODE ?? 'zuowang').trim();
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(pfCode)) return fail(`MG_PF_CODE 不像一个平台码：${pfCode}`);

  if (production && test) return fail('NODE_ENV=production 时不许设 TEST_MODE（测试模式会打开不用登录就能改号的接口）。');
  if (production && devFlag) return fail('NODE_ENV=production 时不许设 DEV_LOGIN（开发登录报个名字就能进任何人的号）。');
  if (production && !keysJson) return fail('没有配 MG_PUBLIC_KEYS（轻聊后台「我的游戏」里的会话公钥）。部署出去的服务器不许用开发登录。');

  if (!keysJson && !test && !devFlag) {
    return fail('没有配 MG_PUBLIC_KEYS，也没有设 DEV_LOGIN=1：不知道该怎么认人。正式部署请配会话公钥并设 NODE_ENV=production；本机开发请设 DEV_LOGIN=1。');
  }
  let kids: string[] = [];
  if (keysJson) {
    try {
      kids = [...parseMgKeys(keysJson).keys()];
    } catch (e) {
      return fail(`MG_PUBLIC_KEYS 写得不对：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const rawCors = env.CORS_ORIGIN !== undefined ? env.CORS_ORIGIN : keysJson ? `https://${pfCode}.mg.superstringtech.com` : '';
  const cors = rawCors.split(',').map((x) => x.trim()).filter(Boolean);
  for (const o of cors) {
    if (!/^https?:\/\/[^/\s?#]+$/.test(o)) return fail(`CORS_ORIGIN 里这一项不对（要写成 https://域名，结尾不带斜杠、不带路径）：${o}`);
    if (production && !o.startsWith('https://')) return fail(`NODE_ENV=production 时 CORS_ORIGIN 只能是 https：${o}`);
  }
  if (keysJson && cors.length === 0) return fail('CORS_ORIGIN 是空的：页面（在平台的域名上）一个请求都进不来。不写这一项就是默认值。');
  const devLogin = keysJson ? test || devFlag : true;
  const warnings: string[] = [];
  if (devLogin) warnings.push('开发登录开着：报个名字就能进任何人的号。只许在本机、测试里这样跑。');
  if (test) warnings.push('测试模式开着：/__test/* 不用登录就能拨钟、改号。只许在测试里这样跑。');
  return { ok: true, cfg: { mode: keysJson ? 'mg' : 'dev', production, test, devLogin, pfCode, mgKeysJson: keysJson || null, kids, cors, warnings } };
}
