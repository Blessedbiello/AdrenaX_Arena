import type { Trade } from '../db/types.js';

export interface ScoringConfig {
  roiWeight: number;              // default 40
  winRateWeight: number;          // default 20
  riskAdjustedWeight: number;     // default 25
  consistencyWeight: number;      // default 15
  minTradesForWinRate: number;    // default 3
  roiCap: number;                 // default 500 (percent)
  minPositionSize: number;        // default 50 (USD)
  minHoldSeconds: number;         // default 60
  sharpeCap: number;              // default 3 (max Sharpe ratio for normalization)
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  roiWeight: 40,
  winRateWeight: 20,
  riskAdjustedWeight: 25,
  consistencyWeight: 15,
  minTradesForWinRate: 3,
  roiCap: 500,
  minPositionSize: 50,
  minHoldSeconds: 60,
  sharpeCap: 3,
};

export interface TradeForScoring {
  pnl_usd: number;
  fees_usd: number;
  collateral_usd: number;
  entry_date: Date;
  exit_date: Date;
}

/**
 * Filter trades that are eligible for Gauntlet scoring.
 * This function is used exclusively for Gauntlet competitions where only fully
 * closed positions with both entry and exit within the competition window count.
 * Duels use isPositionEligibleForDuel in duel.ts, which additionally supports
 * mark-to-market valuation of open positions at settlement time.
 *
 * Eligibility criteria:
 * - Must have both entry and exit dates
 * - Minimum hold time (prevents wash trading)
 * - Minimum position size (prevents ROI manipulation)
 * - Entry and exit both within competition window
 */
export function filterEligibleTrades(
  trades: TradeForScoring[],
  competitionStart: Date,
  competitionEnd: Date,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): TradeForScoring[] {
  return trades.filter(t => {
    if (!t.entry_date || !t.exit_date) return false;
    if (t.collateral_usd < config.minPositionSize) return false;

    const holdSeconds = (t.exit_date.getTime() - t.entry_date.getTime()) / 1000;
    if (holdSeconds < config.minHoldSeconds) return false;

    // Both entry AND exit must be within the competition window
    if (t.entry_date < competitionStart) return false;
    if (t.exit_date > competitionEnd) return false;

    return true;
  });
}

/**
 * Calculate ROI for a single trade: (pnl - fees) / collateral * 100
 */
export function tradeROI(trade: TradeForScoring): number {
  if (!trade.collateral_usd || trade.collateral_usd === 0) return 0;
  return ((trade.pnl_usd - trade.fees_usd) / trade.collateral_usd) * 100;
}

/**
 * Calculate total ROI across multiple trades.
 */
export function totalROI(trades: TradeForScoring[]): number {
  return trades.reduce((sum, t) => sum + tradeROI(t), 0);
}

export function totalNetPnl(trades: TradeForScoring[]): number {
  return trades.reduce((sum, trade) => sum + (trade.pnl_usd - trade.fees_usd), 0);
}

export function totalCapitalDeployed(trades: TradeForScoring[]): number {
  return trades.reduce((sum, trade) => sum + trade.collateral_usd, 0);
}

/**
 * Calculate risk-adjusted return (Sharpe proxy).
 * mean(per-trade ROI) / stddev(per-trade ROI)
 * Returns 0 if fewer than minTrades or stddev is 0.
 */
export function calculateRiskAdjustedReturn(
  trades: TradeForScoring[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): number {
  if (trades.length < config.minTradesForWinRate) return 0;

  const returns = trades.map(tradeROI);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  const stddev = Math.sqrt(variance);

  if (stddev === 0) return mean > 0 ? 1 : mean < 0 ? -1 : 0;
  return mean / stddev;
}

/**
 * Calculate consistency score.
 * 1 / (1 + coefficient_of_variation) where CV = stddev / |mean|
 * Returns 0 if fewer than minTrades.
 * Returns 1.0 if all trades have identical ROI (perfect consistency).
 */
export function calculateConsistency(
  trades: TradeForScoring[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): number {
  if (trades.length < config.minTradesForWinRate) return 0;

  const returns = trades.map(tradeROI);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  const stddev = Math.sqrt(variance);

  if (Math.abs(mean) === 0) return stddev === 0 ? 1 : 0;
  const cv = stddev / Math.abs(mean);
  return 1 / (1 + cv);
}

/**
 * Calculate Arena Score (used for Gauntlet rankings).
 * 4-component composite score:
 * - ROI (40%): total ROI normalized via cap
 * - Win Rate (20%): profitable trades / total trades
 * - Risk-Adjusted Return (25%): Sharpe proxy normalized via cap
 * - Consistency (15%): inverse coefficient of variation
 * All components normalized to [0, 1] or [-1, 1] before weighting.
 */
export function calculateArenaScore(
  trades: TradeForScoring[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): number {
  if (trades.length === 0) return 0;

  const returns = trades.map(tradeROI);
  const roi = returns.reduce((a, b) => a + b, 0);

  // ROI: normalized via cap to [-1, 1]
  const roiScore = Math.min(Math.max(roi / config.roiCap, -1), 1.0);

  // Win Rate: min trades required, [0, 1]
  const winRateScore = trades.length >= config.minTradesForWinRate
    ? returns.filter(r => r > 0).length / returns.length
    : 0;

  // Risk-Adjusted Return: Sharpe proxy normalized via sharpeCap to [-1, 1]
  const sharpe = calculateRiskAdjustedReturn(trades, config);
  const riskAdjustedScore = Math.min(Math.max(sharpe / config.sharpeCap, -1), 1.0);

  // Consistency: [0, 1]
  const consistencyScore = calculateConsistency(trades, config);

  return (
    roiScore * config.roiWeight +
    winRateScore * config.winRateWeight +
    riskAdjustedScore * config.riskAdjustedWeight +
    consistencyScore * config.consistencyWeight
  );
}

/**
 * Calculate Duel score — pure ROI% comparison.
 */
export function calculateDuelROI(trades: TradeForScoring[]): number {
  if (trades.length === 0) return 0;
  const capital = totalCapitalDeployed(trades);
  if (capital <= 0) return 0;
  return (totalNetPnl(trades) / capital) * 100;
}

/**
 * Calculate Mutagen multiplier from Arena performance.
 * final_mutagen = base_mutagen × arena_multiplier
 * Capped at 2.0x
 */
export function calculateMutagenMultiplier(
  duelWinsThisWeek: number,
  gauntletRoundsSurvived: number
): number {
  const multiplier = 1.0 + (0.05 * duelWinsThisWeek) + (0.1 * gauntletRoundsSurvived);
  return Math.min(multiplier, 2.0);
}

/**
 * Determine duel winner based on ROI comparison.
 * Tie resolution: ROI to 6 decimal precision → volume → draw.
 * Returns null if neither participant traded (both forfeit).
 */
export function determineDuelWinner(
  challengerTrades: TradeForScoring[],
  defenderTrades: TradeForScoring[],
  challengerPubkey: string,
  defenderPubkey: string,
  challengerVolume: number = 0,
  defenderVolume: number = 0,
): { winner: string | null; challengerROI: number; defenderROI: number; reason: string } {
  const challengerROI = calculateDuelROI(challengerTrades);
  const defenderROI = calculateDuelROI(defenderTrades);

  // Neither traded — both forfeit
  if (challengerTrades.length === 0 && defenderTrades.length === 0) {
    return { winner: null, challengerROI: 0, defenderROI: 0, reason: 'both_forfeit' };
  }

  // Only one traded — the one who traded wins by forfeit
  if (challengerTrades.length === 0) {
    return { winner: defenderPubkey, challengerROI: 0, defenderROI, reason: 'challenger_forfeit' };
  }
  if (defenderTrades.length === 0) {
    return { winner: challengerPubkey, challengerROI, defenderROI: 0, reason: 'defender_forfeit' };
  }

  // ROI tied to 6 decimal precision — try volume tiebreak
  const cROI6 = Math.round(challengerROI * 1e6) / 1e6;
  const dROI6 = Math.round(defenderROI * 1e6) / 1e6;
  if (cROI6 > dROI6) {
    return { winner: challengerPubkey, challengerROI, defenderROI, reason: 'higher_roi' };
  }
  if (dROI6 > cROI6) {
    return { winner: defenderPubkey, challengerROI, defenderROI, reason: 'higher_roi' };
  }
  // Volume tiebreak
  if (challengerVolume > defenderVolume) {
    return { winner: challengerPubkey, challengerROI, defenderROI, reason: 'higher_volume' };
  }
  if (defenderVolume > challengerVolume) {
    return { winner: defenderPubkey, challengerROI, defenderROI, reason: 'higher_volume' };
  }

  // Complete draw — no winner
  return { winner: null, challengerROI, defenderROI, reason: 'draw' };
}
