/**
 * EvoSafe PRNG - Pseudo-Random Number Generator
 * Provides deterministic, seeded pseudorandom number generation using Mulberry32.
 * Falls back to Math.random when unseeded.
 */

class PRNG {
  constructor(seed = null) {
    this.seed = seed;
    this._state = seed != null ? this.#hashSeed(seed) : null;
  }

  #hashSeed(seed) {
    if (typeof seed === "number") {
      return (seed >>> 0) || 0x12345678;
    }
    const str = String(seed);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    }
    return h || 0x12345678;
  }

  setSeed(seed) {
    this.seed = seed;
    this._state = seed != null ? this.#hashSeed(seed) : null;
  }

  /**
   * Returns a float in [0, 1)
   */
  random() {
    if (this._state == null) {
      return Math.random();
    }
    // Mulberry32 32-bit PRNG algorithm
    let t = (this._state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Random float in [min, max)
   */
  range(min, max) {
    return this.random() * (max - min) + min;
  }

  /**
   * Random integer in [min, max] inclusive
   */
  rangeInt(min, max) {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /**
   * Gaussian / Normal distribution random float via Box-Muller transform
   */
  gaussian(mean = 0, std = 1) {
    let u1 = this.random();
    let u2 = this.random();
    while (u1 === 0) u1 = this.random(); // avoid log(0)
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * std;
  }

  /**
   * Pick random element from array
   */
  choice(array) {
    if (!array || array.length === 0) return null;
    return array[Math.floor(this.random() * array.length)];
  }

  /**
   * In-place Fisher-Yates array shuffle
   */
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Fork a new independent PRNG with deterministic derived seed
   */
  fork() {
    const derivedSeed = Math.floor(this.random() * 0xffffffff);
    return new PRNG(derivedSeed);
  }
}

// Global default PRNG instance (unseeded by default, preserving original Math.random behavior)
const DefaultPRNG = new PRNG(null);
