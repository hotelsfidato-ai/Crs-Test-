/* ══════════════════════════════════════════════════════════════════
   DETERMINISTIC PRNG
   The whole seed set is generated from one fixed seed so every
   reload, screenshot and review starts from identical data.
   mulberry32 — small, fast, good enough distribution for fixtures.
   ══════════════════════════════════════════════════════════════════ */

export function createRandom(seed: number) {
  let state = seed >>> 0;

  function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  function int(min: number, max: number): number {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function pick<T>(items: readonly T[]): T {
    return items[Math.floor(next() * items.length)]!;
  }

  /** n distinct items, or all of them if n exceeds the pool. */
  function sample<T>(items: readonly T[], n: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    const count = Math.min(n, pool.length);
    for (let i = 0; i < count; i++) {
      out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]!);
    }
    return out;
  }

  function bool(probability = 0.5): boolean {
    return next() < probability;
  }

  /** Picks by relative weight — e.g. weighted([["a",5],["b",1]]). */
  function weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return entries[entries.length - 1]![0];
  }

  /** Rounds to the nearest `step` — keeps money looking quoted, not computed. */
  function money(min: number, max: number, step = 100): number {
    return Math.round(int(min, max) / step) * step;
  }

  return { next, int, pick, sample, bool, weighted, money };
}

export type Random = ReturnType<typeof createRandom>;
