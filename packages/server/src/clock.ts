export interface Clock {
  now(): number;
}
export class RealClock implements Clock {
  now(): number {
    return Date.now();
  }
}
export class VirtualClock implements Clock {
  private t: number;
  constructor(start: number) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  set(ms: number): void {
    if (ms < this.t) throw new RangeError('virtual clock cannot go backwards');
    this.t = ms;
  }
  advance(ms: number): void {
    if (ms < 0) throw new RangeError('advance must be >= 0');
    this.t += ms;
  }
}
