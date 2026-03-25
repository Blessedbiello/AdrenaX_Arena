import { describe, it, expect } from 'vitest';
import {
  tradeROI,
  totalROI,
  calculateArenaScore,
  calculateDuelROI,
  calculateMutagenMultiplier,
  determineDuelWinner,
  filterEligibleTrades,
  calculateRiskAdjustedReturn,
  calculateConsistency,
  DEFAULT_SCORING_CONFIG,
  type TradeForScoring,
} from '../scoring.js';

function makeTrade(overrides: Partial<TradeForScoring> = {}): TradeForScoring {
  return {
    pnl_usd: 100,
    fees_usd: 5,
    collateral_usd: 500,
    entry_date: new Date('2025-01-01T00:00:00Z'),
    exit_date: new Date('2025-01-01T01:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// tradeROI
// ---------------------------------------------------------------------------

describe('tradeROI', () => {
  it('calculates ROI correctly', () => {
    const trade = makeTrade({ pnl_usd: 100, fees_usd: 10, collateral_usd: 500 });
    // (100 - 10) / 500 * 100 = 18%
    expect(tradeROI(trade)).toBeCloseTo(18);
  });

  it('handles negative PnL', () => {
    const trade = makeTrade({ pnl_usd: -50, fees_usd: 5, collateral_usd: 200 });
    // (-50 - 5) / 200 * 100 = -27.5%
    expect(tradeROI(trade)).toBeCloseTo(-27.5);
  });

  it('returns 0 for zero collateral', () => {
    const trade = makeTrade({ collateral_usd: 0 });
    expect(tradeROI(trade)).toBe(0);
  });

  it('handles zero fees', () => {
    const trade = makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 });
    expect(tradeROI(trade)).toBeCloseTo(50);
  });
});

// ---------------------------------------------------------------------------
// totalROI
// ---------------------------------------------------------------------------

describe('totalROI', () => {
  it('sums ROI across multiple trades', () => {
    const trades = [
      makeTrade({ pnl_usd: 100, fees_usd: 0, collateral_usd: 500 }), // 20%
      makeTrade({ pnl_usd: -25, fees_usd: 0, collateral_usd: 500 }), // -5%
    ];
    expect(totalROI(trades)).toBeCloseTo(15);
  });

  it('returns 0 for empty array', () => {
    expect(totalROI([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateRiskAdjustedReturn
// ---------------------------------------------------------------------------

describe('calculateRiskAdjustedReturn', () => {
  it('returns 0 for empty trades', () => {
    expect(calculateRiskAdjustedReturn([])).toBe(0);
  });

  it('returns 0 for fewer than minTrades', () => {
    const trades = [makeTrade()];
    expect(calculateRiskAdjustedReturn(trades)).toBe(0);
  });

  it('returns positive Sharpe for consistent profitable trades', () => {
    const trades = [
      makeTrade({ pnl_usd: 100, fees_usd: 0, collateral_usd: 100 }), // 100%
      makeTrade({ pnl_usd: 80, fees_usd: 0, collateral_usd: 100 }),  // 80%
      makeTrade({ pnl_usd: 120, fees_usd: 0, collateral_usd: 100 }), // 120%
    ];
    const sharpe = calculateRiskAdjustedReturn(trades);
    expect(sharpe).toBeGreaterThan(0);
  });

  it('returns 1 for perfectly consistent positive trades (stddev=0)', () => {
    const trades = [
      makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 }), // 50%
      makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 }), // 50%
      makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 }), // 50%
    ];
    expect(calculateRiskAdjustedReturn(trades)).toBe(1);
  });

  it('returns -1 for perfectly consistent negative trades (stddev=0)', () => {
    const trades = [
      makeTrade({ pnl_usd: -50, fees_usd: 0, collateral_usd: 100 }), // -50%
      makeTrade({ pnl_usd: -50, fees_usd: 0, collateral_usd: 100 }),
      makeTrade({ pnl_usd: -50, fees_usd: 0, collateral_usd: 100 }),
    ];
    expect(calculateRiskAdjustedReturn(trades)).toBe(-1);
  });

  it('returns lower Sharpe for volatile trades', () => {
    const consistent = [
      makeTrade({ pnl_usd: 100, fees_usd: 0, collateral_usd: 100 }),
      makeTrade({ pnl_usd: 100, fees_usd: 0, collateral_usd: 100 }),
      makeTrade({ pnl_usd: 100, fees_usd: 0, collateral_usd: 100 }),
    ];
    const volatile = [
      makeTrade({ pnl_usd: 300, fees_usd: 0, collateral_usd: 100 }),
      makeTrade({ pnl_usd: -100, fees_usd: 0, collateral_usd: 100 }),
      makeTrade({ pnl_usd: 100, fees_usd: 0, collateral_usd: 100 }),
    ];
    expect(calculateRiskAdjustedReturn(consistent)).toBeGreaterThan(
      calculateRiskAdjustedReturn(volatile)
    );
  });
});

// ---------------------------------------------------------------------------
// calculateConsistency
// ---------------------------------------------------------------------------

describe('calculateConsistency', () => {
  it('returns 0 for empty trades', () => {
    expect(calculateConsistency([])).toBe(0);
  });

  it('returns 0 for fewer than minTrades', () => {
    const trades = [makeTrade()];
    expect(calculateConsistency(trades)).toBe(0);
  });

  it('returns 1.0 for perfectly consistent trades', () => {
    const trades = [
      makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 }),
      makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 }),
      makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 }),
    ];
    expect(calculateConsistency(trades)).toBeCloseTo(1.0);
  });

  it('returns lower value for volatile trades', () => {
    const consistent = [
      makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 }),
      makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 }),
      makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 }),
    ];
    const volatile = [
      makeTrade({ pnl_usd: 200, fees_usd: 0, collateral_usd: 100 }),
      makeTrade({ pnl_usd: -50, fees_usd: 0, collateral_usd: 100 }),
      makeTrade({ pnl_usd: 100, fees_usd: 0, collateral_usd: 100 }),
    ];
    expect(calculateConsistency(consistent)).toBeGreaterThan(calculateConsistency(volatile));
  });

  it('handles zero mean gracefully', () => {
    const trades = [
      makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 }),   // +50%
      makeTrade({ pnl_usd: -50, fees_usd: 0, collateral_usd: 100 }),  // -50%
      makeTrade({ pnl_usd: 0, fees_usd: 0, collateral_usd: 100 }),    // 0%
    ];
    // Mean is ~0, CV is undefined -> returns 0
    expect(calculateConsistency(trades)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateArenaScore (4-component)
// ---------------------------------------------------------------------------

describe('calculateArenaScore', () => {
  it('returns 0 for no trades', () => {
    expect(calculateArenaScore([])).toBe(0);
  });

  it('calculates 4-component score with enough trades', () => {
    const trades = [
      makeTrade({ pnl_usd: 100, fees_usd: 0, collateral_usd: 100 }), // 100%
      makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 }),  // 50%
      makeTrade({ pnl_usd: -10, fees_usd: 0, collateral_usd: 100 }), // -10%
    ];
    const score = calculateArenaScore(trades);
    // ROI=140%, roiScore=140/500=0.28, weight 40 -> 11.2
    // WinRate=2/3=0.667, weight 20 -> 13.33
    // RiskAdjusted: mean=46.67, stddev=~45.09, sharpe=~1.035, norm=1.035/3=0.345, weight 25 -> 8.63
    // Consistency: cv=45.09/46.67=0.966, 1/(1+0.966)=0.508, weight 15 -> 7.63
    // Total ≈ 40.8
    expect(score).toBeGreaterThan(30);
    expect(score).toBeLessThan(50);
  });

  it('ignores win rate and advanced metrics when fewer than minTradesForWinRate', () => {
    const trades = [
      makeTrade({ pnl_usd: 250, fees_usd: 0, collateral_usd: 100 }), // 250%
    ];
    // ROI = 250%, roiScore = 250/500 = 0.5, weight 40 -> 20
    // Win rate = 0 (only 1 trade)
    // Risk-adjusted = 0 (fewer than min)
    // Consistency = 0 (fewer than min)
    // Score = 20
    expect(calculateArenaScore(trades)).toBeCloseTo(20);
  });

  it('caps ROI at roiCap', () => {
    const trades = [
      makeTrade({ pnl_usd: 5000, fees_usd: 0, collateral_usd: 100 }), // 5000%
      makeTrade({ pnl_usd: 5000, fees_usd: 0, collateral_usd: 100 }),
      makeTrade({ pnl_usd: 5000, fees_usd: 0, collateral_usd: 100 }),
    ];
    const score = calculateArenaScore(trades);
    // ROI capped at 1.0 * 40 = 40
    // WinRate = 1.0 * 20 = 20
    // RiskAdjusted = 1.0 (all positive, stddev=0 -> returns 1, /3 = 0.333, but capped at 1) -> actually stddev=0 so returns 1, norm = 1/3 = 0.333 * 25 = 8.33
    // Wait: calculateRiskAdjustedReturn returns 1 when stddev=0 and mean>0. Then sharpe/3 = 1/3 = 0.333 * 25 = 8.33
    // Consistency = 1.0 * 15 = 15
    // Total = 40 + 20 + 8.33 + 15 = 83.33
    expect(score).toBeGreaterThan(80);
  });

  it('handles all-negative ROI', () => {
    const trades = [
      makeTrade({ pnl_usd: -100, fees_usd: 5, collateral_usd: 100 }),
      makeTrade({ pnl_usd: -50, fees_usd: 5, collateral_usd: 100 }),
      makeTrade({ pnl_usd: -200, fees_usd: 5, collateral_usd: 100 }),
    ];
    const score = calculateArenaScore(trades);
    expect(score).toBeLessThan(0);
  });

  it('respects a custom config', () => {
    const trades = [
      makeTrade({ pnl_usd: 250, fees_usd: 0, collateral_usd: 100 }), // 250%
      makeTrade({ pnl_usd: 250, fees_usd: 0, collateral_usd: 100 }),
    ];
    const customConfig = {
      ...DEFAULT_SCORING_CONFIG,
      roiWeight: 100,
      winRateWeight: 0,
      riskAdjustedWeight: 0,
      consistencyWeight: 0,
      minTradesForWinRate: 2,
    };
    // ROI = 500%, roiScore = 1.0, weight 100 -> 100
    expect(calculateArenaScore(trades, customConfig)).toBeCloseTo(100);
  });
});

// ---------------------------------------------------------------------------
// calculateDuelROI
// ---------------------------------------------------------------------------

describe('calculateDuelROI', () => {
  it('returns capital-weighted ROI for duel scoring', () => {
    const trades = [
      makeTrade({ pnl_usd: 50, fees_usd: 5, collateral_usd: 200 }),
      makeTrade({ pnl_usd: 30, fees_usd: 2, collateral_usd: 100 }),
    ];
    expect(calculateDuelROI(trades)).toBeCloseTo(((50 - 5) + (30 - 2)) / 300 * 100);
  });

  it('returns 0 for no trades', () => {
    expect(calculateDuelROI([])).toBe(0);
  });

  it('returns weighted ROI for a single trade', () => {
    const trades = [makeTrade({ pnl_usd: 100, fees_usd: 0, collateral_usd: 200 })];
    // 100/200*100 = 50%
    expect(calculateDuelROI(trades)).toBeCloseTo(50);
  });
});

// ---------------------------------------------------------------------------
// calculateMutagenMultiplier
// ---------------------------------------------------------------------------

describe('calculateMutagenMultiplier', () => {
  it('starts at 1.0x with no activity', () => {
    expect(calculateMutagenMultiplier(0, 0)).toBe(1.0);
  });

  it('adds 0.05 per duel win', () => {
    expect(calculateMutagenMultiplier(4, 0)).toBeCloseTo(1.2);
  });

  it('adds 0.1 per gauntlet round', () => {
    expect(calculateMutagenMultiplier(0, 3)).toBeCloseTo(1.3);
  });

  it('caps at 2.0x', () => {
    expect(calculateMutagenMultiplier(20, 10)).toBe(2.0);
  });

  it('combines both sources', () => {
    expect(calculateMutagenMultiplier(2, 2)).toBeCloseTo(1.3);
  });

  it('caps exactly at boundary', () => {
    // 1.0 + 0.05*20 = 2.0 — exactly at the cap
    expect(calculateMutagenMultiplier(20, 0)).toBe(2.0);
  });

  it('does not exceed cap when only gauntlet rounds are high', () => {
    expect(calculateMutagenMultiplier(0, 100)).toBe(2.0);
  });
});

// ---------------------------------------------------------------------------
// determineDuelWinner (with volume tiebreak)
// ---------------------------------------------------------------------------

describe('determineDuelWinner', () => {
  const alice = 'Alice111111111111111111111111111111111111111';
  const bob   = 'Bob11111111111111111111111111111111111111111';

  it('picks higher ROI as winner', () => {
    const aliceTrades = [makeTrade({ pnl_usd: 100, fees_usd: 0, collateral_usd: 100 })];
    const bobTrades   = [makeTrade({ pnl_usd: 50,  fees_usd: 0, collateral_usd: 100 })];
    const result = determineDuelWinner(aliceTrades, bobTrades, alice, bob);
    expect(result.winner).toBe(alice);
    expect(result.reason).toBe('higher_roi');
  });

  it('defender wins when they have higher ROI', () => {
    const aliceTrades = [makeTrade({ pnl_usd: 10,  fees_usd: 0, collateral_usd: 100 })];
    const bobTrades   = [makeTrade({ pnl_usd: 200, fees_usd: 0, collateral_usd: 100 })];
    const result = determineDuelWinner(aliceTrades, bobTrades, alice, bob);
    expect(result.winner).toBe(bob);
    expect(result.reason).toBe('higher_roi');
  });

  it('both forfeit when neither traded', () => {
    const result = determineDuelWinner([], [], alice, bob);
    expect(result.winner).toBeNull();
    expect(result.reason).toBe('both_forfeit');
  });

  it('challenger wins by forfeit when defender has no trades', () => {
    const aliceTrades = [makeTrade()];
    const result = determineDuelWinner(aliceTrades, [], alice, bob);
    expect(result.winner).toBe(alice);
    expect(result.reason).toBe('defender_forfeit');
  });

  it('defender wins by forfeit when challenger has no trades', () => {
    const bobTrades = [makeTrade()];
    const result = determineDuelWinner([], bobTrades, alice, bob);
    expect(result.winner).toBe(bob);
    expect(result.reason).toBe('challenger_forfeit');
  });

  it('tie with equal volume results in draw', () => {
    const trades = [makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 })];
    const result = determineDuelWinner(trades, trades, alice, bob, 100, 100);
    expect(result.winner).toBeNull();
    expect(result.reason).toBe('draw');
  });

  it('tie resolved by higher challenger volume', () => {
    const trades = [makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 })];
    const result = determineDuelWinner(trades, trades, alice, bob, 500, 100);
    expect(result.winner).toBe(alice);
    expect(result.reason).toBe('higher_volume');
  });

  it('tie resolved by higher defender volume', () => {
    const trades = [makeTrade({ pnl_usd: 50, fees_usd: 0, collateral_usd: 100 })];
    const result = determineDuelWinner(trades, trades, alice, bob, 100, 500);
    expect(result.winner).toBe(bob);
    expect(result.reason).toBe('higher_volume');
  });

  it('exposes correct ROI values in the result', () => {
    const aliceTrades = [makeTrade({ pnl_usd: 100, fees_usd: 0, collateral_usd: 200 })]; // 50%
    const bobTrades   = [makeTrade({ pnl_usd: 40,  fees_usd: 0, collateral_usd: 200 })]; // 20%
    const result = determineDuelWinner(aliceTrades, bobTrades, alice, bob);
    expect(result.challengerROI).toBeCloseTo(50);
    expect(result.defenderROI).toBeCloseTo(20);
  });

  it('both_forfeit result carries zero ROI values', () => {
    const result = determineDuelWinner([], [], alice, bob);
    expect(result.challengerROI).toBe(0);
    expect(result.defenderROI).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// filterEligibleTrades
// ---------------------------------------------------------------------------

describe('filterEligibleTrades', () => {
  const start = new Date('2025-01-01T00:00:00Z');
  const end   = new Date('2025-01-02T00:00:00Z');

  it('keeps trades within window', () => {
    const trades = [makeTrade({
      entry_date: new Date('2025-01-01T01:00:00Z'),
      exit_date:  new Date('2025-01-01T05:00:00Z'),
      collateral_usd: 100,
    })];
    expect(filterEligibleTrades(trades, start, end)).toHaveLength(1);
  });

  it('rejects trades entered before window', () => {
    const trades = [makeTrade({
      entry_date: new Date('2024-12-31T23:00:00Z'),
      exit_date:  new Date('2025-01-01T05:00:00Z'),
      collateral_usd: 100,
    })];
    expect(filterEligibleTrades(trades, start, end)).toHaveLength(0);
  });

  it('rejects trades exiting after window', () => {
    const trades = [makeTrade({
      entry_date: new Date('2025-01-01T01:00:00Z'),
      exit_date:  new Date('2025-01-03T00:00:00Z'),
      collateral_usd: 100,
    })];
    expect(filterEligibleTrades(trades, start, end)).toHaveLength(0);
  });

  it('rejects trades under min position size', () => {
    const trades = [makeTrade({ collateral_usd: 10 })];
    expect(filterEligibleTrades(trades, start, end)).toHaveLength(0);
  });

  it('rejects trades held less than 60 seconds', () => {
    const trades = [makeTrade({
      entry_date: new Date('2025-01-01T01:00:00Z'),
      exit_date:  new Date('2025-01-01T01:00:30Z'), // 30 seconds
      collateral_usd: 100,
    })];
    expect(filterEligibleTrades(trades, start, end)).toHaveLength(0);
  });

  it('accepts trades at exactly 60 seconds hold', () => {
    const trades = [makeTrade({
      entry_date: new Date('2025-01-01T01:00:00Z'),
      exit_date:  new Date('2025-01-01T01:01:00Z'), // exactly 60s
      collateral_usd: 100,
    })];
    expect(filterEligibleTrades(trades, start, end)).toHaveLength(1);
  });

  it('filters a mixed batch correctly', () => {
    const eligible = makeTrade({
      entry_date: new Date('2025-01-01T02:00:00Z'),
      exit_date:  new Date('2025-01-01T03:00:00Z'),
      collateral_usd: 100,
    });
    const tooSmall = makeTrade({ collateral_usd: 10 });
    const tooShort = makeTrade({
      entry_date: new Date('2025-01-01T04:00:00Z'),
      exit_date:  new Date('2025-01-01T04:00:10Z'),
      collateral_usd: 100,
    });
    const result = filterEligibleTrades([eligible, tooSmall, tooShort], start, end);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(eligible);
  });

  it('accepts the minimum valid position size (exactly minPositionSize)', () => {
    const trades = [makeTrade({
      entry_date: new Date('2025-01-01T01:00:00Z'),
      exit_date:  new Date('2025-01-01T02:00:00Z'),
      collateral_usd: DEFAULT_SCORING_CONFIG.minPositionSize, // exactly 50
    })];
    expect(filterEligibleTrades(trades, start, end)).toHaveLength(1);
  });

  it('respects a custom config for minPositionSize', () => {
    const customConfig = { ...DEFAULT_SCORING_CONFIG, minPositionSize: 200 };
    const trades = [makeTrade({
      entry_date: new Date('2025-01-01T01:00:00Z'),
      exit_date:  new Date('2025-01-01T02:00:00Z'),
      collateral_usd: 100, // above default but below custom min
    })];
    expect(filterEligibleTrades(trades, start, end, customConfig)).toHaveLength(0);
  });

  it('returns empty array when given no trades', () => {
    expect(filterEligibleTrades([], start, end)).toHaveLength(0);
  });
});
