// Deterministic seeded RNG (mulberry32). Zero DOM/Pixi imports.

export class RNG {
  private state: number;

  constructor(seed: number) {
    // Ensure a 32-bit unsigned starting state.
    this.state = seed >>> 0;
  }

  /** Uniform in [0,1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min,max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min,max]. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Fork an independent stream deterministically from this one. */
  fork(salt: number): RNG {
    // Mix current state with salt to derive a new, independent seed.
    let s = (this.state ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
    return new RNG(s);
  }
}
