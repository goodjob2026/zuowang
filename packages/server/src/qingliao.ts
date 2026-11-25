import { type KeyObject, createPublicKey, verify } from 'node:crypto';
import type { ImAdapter, ImIdentity } from './im.ts';

export class MgAuthError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`mg token ${code}`);
    this.code = code;
  }
}

export const MG_TOKEN_MAX_MS = 2 * 3_600_000;
const b64url = (s: string): Buffer => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
function jsonPart(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(b64url(s).toString('utf8')) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {

  }
  throw new MgAuthError('malformed');
}

export function parseMgKeys(json: string): Map<string, KeyObject> {
  const raw = JSON.parse(json) as Record<string, string>;
  const keys = new Map<string, KeyObject>();
  for (const [kid, pem] of Object.entries(raw)) {
    const k = createPublicKey(pem);
    if (k.asymmetricKeyType !== 'ed25519') throw new Error(`会话公钥 ${kid} 不是 Ed25519`);
    keys.set(kid, k);
  }
  if (keys.size === 0) throw new Error('MG_PUBLIC_KEYS 里一把公钥也没有');
  return keys;
}

export function verifyMgToken(token: string, keys: Map<string, KeyObject>, pfCode: string, nowMs: number): { sub: string; nick: string; expMs: number } {
  const parts = String(token ?? '').split('.');

  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) throw new MgAuthError('malformed');
  const [h, p, s] = parts as [string, string, string];
  const header = jsonPart(h);
  if (header.alg !== 'EdDSA') throw new MgAuthError('bad_alg');
  const key = typeof header.kid === 'string' ? keys.get(header.kid) : undefined;
  if (!key) throw new MgAuthError('unknown_kid');
  if (!verify(null, Buffer.from(`${h}.${p}`), key, b64url(s))) throw new MgAuthError('bad_signature');
  const c = jsonPart(p);
  if (c.iss !== 'mgp') throw new MgAuthError('bad_iss');
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(pfCode)) throw new MgAuthError('bad_aud');
  if (typeof c.exp !== 'number' || !Number.isFinite(c.exp) || c.exp * 1000 <= nowMs) throw new MgAuthError('expired');
  if (typeof c.sub !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(c.sub)) throw new MgAuthError('bad_sub');

  return { sub: c.sub, nick: typeof c.nick === 'string' ? c.nick : '', expMs: Math.min(c.exp * 1000, nowMs + MG_TOKEN_MAX_MS) };
}

export class MgIm implements ImAdapter {
  private readonly keys: Map<string, KeyObject>;
  private readonly pfCode: string;
  private readonly now: () => number;
  private readonly dev: ImAdapter | null;
  constructor(opts: { keys: Map<string, KeyObject>; pfCode: string; now?: () => number; dev?: ImAdapter | null }) {
    this.keys = opts.keys;
    this.pfCode = opts.pfCode;
    this.now = opts.now ?? Date.now;
    this.dev = opts.dev ?? null;
  }
  verifyCredential(credential: string): ImIdentity | null {
    if (this.dev && credential.startsWith('dev:')) {
      const id = this.dev.verifyCredential(credential);

      return id && !id.uid.startsWith('mg_') ? id : null;
    }
    try {
      const t = verifyMgToken(credential, this.keys, this.pfCode, this.now());

      return { uid: `mg_${t.sub}`, name: t.nick, expiresAt: t.expMs };
    } catch (e) {
      if (e instanceof MgAuthError) return null;
      throw e;
    }
  }
  payParams(): Record<string, unknown> {
    throw new Error('充值没有开');
  }
  verifyPayCallback(): boolean {
    return false;
  }
}
