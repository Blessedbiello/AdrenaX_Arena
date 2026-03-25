import { describe, it, expect } from 'vitest';

// Test collusion detection logic (pure math, no DB)
describe('collusion detection', () => {
  function calculateCollusionScore(duelCount: number, aWins: number, bWins: number): number {
    let score = 0;
    if (duelCount > 5) score += 40;
    else if (duelCount > 3) score += 20;

    if (duelCount >= 4) {
      const ratio = Math.min(aWins, bWins) / Math.max(aWins, bWins, 1);
      if (ratio > 0.8) score += 30;
    }
    return Math.min(score, 100);
  }

  it('returns 0 for normal pair (few duels)', () => {
    expect(calculateCollusionScore(2, 1, 1)).toBe(0);
  });

  it('flags frequent dueling (>3)', () => {
    expect(calculateCollusionScore(4, 3, 1)).toBe(20);
  });

  it('flags very frequent dueling (>5)', () => {
    expect(calculateCollusionScore(6, 4, 2)).toBe(40);
  });

  it('flags even win distribution', () => {
    expect(calculateCollusionScore(4, 2, 2)).toBe(50); // 20 (>3 duels) + 30 (even wins)
  });

  it('flags heavy collusion pattern', () => {
    expect(calculateCollusionScore(8, 4, 4)).toBe(70); // 40 (>5 duels) + 30 (even wins)
  });

  it('caps at 100', () => {
    expect(calculateCollusionScore(10, 5, 5)).toBeLessThanOrEqual(100);
  });

  it('does not flag one-sided results', () => {
    // 6 duels but 5-1 record = not suspicious win distribution
    expect(calculateCollusionScore(6, 5, 1)).toBe(40); // only frequency flag, ratio is 0.2
  });
});
