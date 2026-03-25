import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// title thresholds (mirrors logic in streaks.ts calculateTitle)
// ---------------------------------------------------------------------------

function calculateTitle(streak: number): string | null {
  if (streak >= 10) return 'legendary_duelist';
  if (streak >= 5) return 'arena_champion';
  if (streak >= 3) return 'hot_streak';
  return null;
}

describe('title thresholds', () => {
  it('returns null for 0 streak', () => {
    expect(calculateTitle(0)).toBeNull();
  });

  it('returns null for 1 streak', () => {
    expect(calculateTitle(1)).toBeNull();
  });

  it('returns null for 2 streak', () => {
    expect(calculateTitle(2)).toBeNull();
  });

  it('returns hot_streak at exactly 3', () => {
    expect(calculateTitle(3)).toBe('hot_streak');
  });

  it('returns hot_streak for 4', () => {
    expect(calculateTitle(4)).toBe('hot_streak');
  });

  it('returns arena_champion at exactly 5', () => {
    expect(calculateTitle(5)).toBe('arena_champion');
  });

  it('returns arena_champion for 9', () => {
    expect(calculateTitle(9)).toBe('arena_champion');
  });

  it('returns legendary_duelist at exactly 10', () => {
    expect(calculateTitle(10)).toBe('legendary_duelist');
  });

  it('returns legendary_duelist for 50', () => {
    expect(calculateTitle(50)).toBe('legendary_duelist');
  });
});

// ---------------------------------------------------------------------------
// mutagen multiplier (mirrors logic in streaks.ts calculateMultiplier)
// ---------------------------------------------------------------------------

function calculateMultiplier(streak: number): number {
  return Math.min(2.0, 1.0 + streak * 0.05);
}

describe('streak mutagen multiplier', () => {
  it('starts at 1.0 for 0 streak', () => {
    expect(calculateMultiplier(0)).toBe(1.0);
  });

  it('returns 1.05 for 1 win', () => {
    expect(calculateMultiplier(1)).toBeCloseTo(1.05);
  });

  it('returns 1.15 for 3 wins (hot_streak)', () => {
    expect(calculateMultiplier(3)).toBeCloseTo(1.15);
  });

  it('returns 1.25 for 5 wins (arena_champion)', () => {
    expect(calculateMultiplier(5)).toBeCloseTo(1.25);
  });

  it('returns 1.5 for 10 wins (legendary_duelist)', () => {
    expect(calculateMultiplier(10)).toBeCloseTo(1.5);
  });

  it('caps at 2.0 for 20 wins', () => {
    expect(calculateMultiplier(20)).toBe(2.0);
  });

  it('caps at 2.0 for 100 wins', () => {
    expect(calculateMultiplier(100)).toBe(2.0);
  });

  it('just under cap at 19 wins', () => {
    expect(calculateMultiplier(19)).toBeCloseTo(1.95);
  });
});

// ---------------------------------------------------------------------------
// streak progression simulation
// ---------------------------------------------------------------------------

function simulateStreak(results: ('win' | 'loss')[]): {
  current: number;
  type: string;
  best: number;
  totalWins: number;
  totalLosses: number;
} {
  let current = 0;
  let best = 0;
  let type = 'none';
  let totalWins = 0;
  let totalLosses = 0;

  for (const result of results) {
    if (result === 'win') {
      totalWins++;
      if (type === 'win') {
        current++;
      } else {
        current = 1;
        type = 'win';
      }
      best = Math.max(best, current);
    } else {
      totalLosses++;
      if (type === 'loss') {
        current++;
      } else {
        current = 1;
        type = 'loss';
      }
    }
  }

  return { current, type, best, totalWins, totalLosses };
}

describe('streak progression', () => {
  it('tracks a simple 3-win streak', () => {
    const r = simulateStreak(['win', 'win', 'win']);
    expect(r.current).toBe(3);
    expect(r.type).toBe('win');
    expect(r.best).toBe(3);
  });

  it('resets win streak on loss', () => {
    const r = simulateStreak(['win', 'win', 'loss']);
    expect(r.current).toBe(1);
    expect(r.type).toBe('loss');
    expect(r.best).toBe(2);
  });

  it('resets loss streak on win', () => {
    const r = simulateStreak(['loss', 'loss', 'win']);
    expect(r.current).toBe(1);
    expect(r.type).toBe('win');
    expect(r.best).toBe(1);
  });

  it('tracks best streak across resets', () => {
    const r = simulateStreak(['win', 'win', 'win', 'loss', 'win', 'win']);
    expect(r.current).toBe(2);
    expect(r.type).toBe('win');
    expect(r.best).toBe(3);
  });

  it('handles empty results', () => {
    const r = simulateStreak([]);
    expect(r.current).toBe(0);
    expect(r.type).toBe('none');
    expect(r.best).toBe(0);
  });

  it('single win', () => {
    const r = simulateStreak(['win']);
    expect(r.current).toBe(1);
    expect(r.type).toBe('win');
    expect(r.best).toBe(1);
    expect(r.totalWins).toBe(1);
    expect(r.totalLosses).toBe(0);
  });

  it('alternating wins and losses never build streak', () => {
    const r = simulateStreak(['win', 'loss', 'win', 'loss', 'win']);
    expect(r.current).toBe(1);
    expect(r.best).toBe(1);
    expect(r.totalWins).toBe(3);
    expect(r.totalLosses).toBe(2);
  });

  it('long win streak builds to legendary', () => {
    const results = Array(10).fill('win') as ('win' | 'loss')[];
    const r = simulateStreak(results);
    expect(r.current).toBe(10);
    expect(r.best).toBe(10);
    expect(calculateTitle(r.current)).toBe('legendary_duelist');
    expect(calculateMultiplier(r.current)).toBeCloseTo(1.5);
  });

  it('loss after legendary resets to null title', () => {
    const results = [...Array(10).fill('win'), 'loss'] as ('win' | 'loss')[];
    const r = simulateStreak(results);
    expect(r.current).toBe(1);
    expect(r.type).toBe('loss');
    expect(r.best).toBe(10);
    expect(calculateTitle(r.current)).toBeNull();
  });
});
