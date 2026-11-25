import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ImIdentity {
  uid: string;
  name: string;

  expiresAt?: number;
}
export interface ImAdapter {
  verifyCredential(credential: string): ImIdentity | null;

  payParams(orderId: string, product: string, priceCents: number): Record<string, unknown>;

  verifyPayCallback(body: { orderId: string; status: string; sign: string }): boolean;

  notify?(uid: string, text: string): void;
}

export class DevIm implements ImAdapter {
  private readonly secret: string;
  constructor(secret: string) {
    this.secret = secret;
  }
  verifyCredential(credential: string): ImIdentity | null {
    const m = /^dev:([A-Za-z0-9_-]{1,40}):(.{1,20})$/.exec(credential);
    return m ? { uid: m[1] as string, name: m[2] as string } : null;
  }
  sign(orderId: string, status: string): string {
    return createHmac('sha256', this.secret).update(`${orderId}|${status}`).digest('hex');
  }
  payParams(orderId: string, product: string, priceCents: number): Record<string, unknown> {
    return { orderId, product, priceCents, provider: 'dev' };
  }

  readonly sent: { uid: string; text: string }[] = [];
  notify(uid: string, text: string): void {
    this.sent.push({ uid, text });
    if (this.sent.length > 200) this.sent.shift();
  }
  verifyPayCallback(body: { orderId: string; status: string; sign: string }): boolean {
    const want = Buffer.from(this.sign(body.orderId, body.status));
    const got = Buffer.from(String(body.sign));
    return want.length === got.length && timingSafeEqual(want, got);
  }
}
