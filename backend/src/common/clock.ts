/** Injectable clock so tests can control time (fixed-clock expiry test). */
export abstract class Clock {
  abstract now(): Date;
}
export class SystemClock extends Clock {
  now() {
    return new Date();
  }
}
export class FixedClock extends Clock {
  constructor(private current: Date) {
    super();
  }
  now() {
    return new Date(this.current.getTime());
  }
  set(d: Date) {
    this.current = d;
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}
