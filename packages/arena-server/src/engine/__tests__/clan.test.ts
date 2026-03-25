import { describe, it, expect } from 'vitest';
import { calculateClanScore } from '../clan.js';

describe('calculateClanScore', () => {
  it('returns 0 for empty members', () => {
    expect(calculateClanScore([])).toBe(0);
  });

  it('returns score with no synergy for 1 member', () => {
    expect(calculateClanScore([100])).toBe(100); // 100 * 1.0
  });

  it('applies 5% synergy per extra member', () => {
    expect(calculateClanScore([100, 100])).toBeCloseTo(105); // avg 100 * 1.05
  });

  it('applies 10% synergy for 3 members', () => {
    expect(calculateClanScore([100, 100, 100])).toBeCloseTo(110); // avg 100 * 1.10
  });

  it('applies 20% synergy for 5 members', () => {
    expect(calculateClanScore([100, 100, 100, 100, 100])).toBeCloseTo(120); // avg 100 * 1.20
  });

  it('averages different scores before applying synergy', () => {
    expect(calculateClanScore([80, 120])).toBeCloseTo(105); // avg 100 * 1.05
  });

  it('handles negative scores', () => {
    const score = calculateClanScore([-50, 50, 100]);
    // avg = 33.33, synergy = 1.10, total = 36.67
    expect(score).toBeCloseTo(36.67, 1);
  });
});
