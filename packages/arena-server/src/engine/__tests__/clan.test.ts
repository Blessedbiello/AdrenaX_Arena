import { describe, it, expect } from 'vitest';
import { calculateClanScore } from '../clan.js';

describe('calculateClanScore', () => {
  it('returns 0 for empty members', () => {
    expect(calculateClanScore([])).toBe(0);
  });

  it('applies full-profitability synergy when all members are profitable', () => {
    expect(calculateClanScore([100])).toBe(105); // 100 * 1.05
  });

  it('keeps 5% synergy when every member is profitable', () => {
    expect(calculateClanScore([100, 100])).toBeCloseTo(105);
  });

  it('uses the documented 5% ceiling even for larger profitable teams', () => {
    expect(calculateClanScore([100, 100, 100])).toBeCloseTo(105);
  });

  it('does not stack synergy beyond the documented ceiling', () => {
    expect(calculateClanScore([100, 100, 100, 100, 100])).toBeCloseTo(105);
  });

  it('averages different scores before applying synergy', () => {
    expect(calculateClanScore([80, 120])).toBeCloseTo(105); // avg 100 * 1.05
  });

  it('handles negative scores', () => {
    const score = calculateClanScore([-50, 50, 100]);
    // avg = 33.33, profitable ratio = 2/3, synergy = 1.0
    expect(score).toBeCloseTo(33.33, 1);
  });
});
