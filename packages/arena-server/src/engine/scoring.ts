import type { Trade } from '../db/types.js';

export interface ScoringConfig {
  roiWeight: number;       // default 70
  winRateWeight: number;   // default 30
  minTradesForWinRate: number; // default 3
  roiCap: number;          // default 500 (percent)
  minPositionSize: number; // default 50 (USD)
  minHoldSeconds: number;  // default 60
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  roiWeight: 70,
  winRateWeight: 30,
  minTradesForWinRate: 3,
  roiCap: 500,
  minPositionSize: 50,
  minHoldSeconds: 60,
};

export interface TradeForScoring {
  pnl_usd: number;
  fees_usd: number;
  collateral_usd: number;
  entry_date: Date;
  exit_date: Date;
}

/**
 * Filter trades that are eligible for scoring.
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

/**
 * Calculate Arena Score (used for Gauntlet rankings).
 * Components normalized to [0, 1] before weighting.
 */
export function calculateArenaScore(
  trades: TradeForScoring[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): number {
  if (trades.length === 0) return 0;

  const returns = trades.map(tradeROI);
  const roi = returns.reduce((a, b) => a + b, 0);

  // ROI: normalized via cap
  const roiScore = Math.min(Math.max(roi / config.roiCap, -1), 1.0);

  // Win Rate: min trades required
  const winRateScore = trades.length >= config.minTradesForWinRate
    ? returns.filter(r => r > 0).length / returns.length
    : 0;

  return roiScore * config.roiWeight + winRateScore * config.winRateWeight;
}

/**
 * Calculate Duel score — pure ROI% comparison.
 */
export function calculateDuelROI(trades: TradeForScoring[]): number {
  if (trades.length === 0) return 0;
  return totalROI(trades);
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
 * Returns null if neither participant traded (both forfeit).
 */
export function determineDuelWinner(
  challengerTrades: TradeForScoring[],
  defenderTrades: TradeForScoring[],
  challengerPubkey: string,
  defenderPubkey: string
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

  // Both traded — higher ROI wins
  if (challengerROI > defenderROI) {
    return { winner: challengerPubkey, challengerROI, defenderROI, reason: 'higher_roi' };
  }
  if (defenderROI > challengerROI) {
    return { winner: defenderPubkey, challengerROI, defenderROI, reason: 'higher_roi' };
  }

  // Exact tie — challenger advantage (they took the initiative)
  return { winner: challengerPubkey, challengerROI, defenderROI, reason: 'tie_challenger_advantage' };
}
