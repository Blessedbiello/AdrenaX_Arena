import { getDb } from '../db/connection.js';
import { getAdrenaClient } from '../adrena/client.js';
import { childLogger } from '../logger.js';
import { env } from '../config.js';

const log = childLogger('anti-sybil');

/**
 * Check if a wallet has enough trade history on Adrena.
 * Returns true if the wallet meets the minimum requirements.
 */
export async function checkTradeHistory(pubkey: string): Promise<boolean> {
  if (!env.ENABLE_SYBIL_CHECKS) return true;

  try {
    const client = getAdrenaClient();
    const count = await client.countClosedPositions(pubkey);
    const passes = count >= env.MIN_CLOSED_POSITIONS;
    if (!passes) {
      log.info({ pubkey, count, required: env.MIN_CLOSED_POSITIONS }, 'Wallet failed trade history check');
    }
    return passes;
  } catch (err) {
    log.error({ err, pubkey }, 'Trade history check failed — allowing by default');
    return true; // Fail open to avoid blocking legitimate users
  }
}

/**
 * Check for potential collusion between two wallets.
 * Returns a risk score from 0-100.
 */
export async function checkCollusionPair(walletA: string, walletB: string): Promise<number> {
  if (!env.ENABLE_SYBIL_CHECKS) return 0;

  const db = getDb();
  let riskScore = 0;

  try {
    // Check duel frequency between the pair
    const recentDuels = await db
      .selectFrom('arena_duels')
      .where(eb => eb.or([
        eb.and([eb('challenger_pubkey', '=', walletA), eb('defender_pubkey', '=', walletB)]),
        eb.and([eb('challenger_pubkey', '=', walletB), eb('defender_pubkey', '=', walletA)]),
      ]))
      .where('status', 'in', ['active', 'completed', 'pending'])
      .selectAll()
      .execute();

    // More than 3 duels between same pair in history is suspicious
    if (recentDuels.length > 5) riskScore += 40;
    else if (recentDuels.length > 3) riskScore += 20;

    // Check for alternating wins (potential wash trading)
    const completedDuels = recentDuels.filter(d => d.status === 'completed' && d.winner_pubkey);
    if (completedDuels.length >= 4) {
      const aWins = completedDuels.filter(d => d.winner_pubkey === walletA).length;
      const bWins = completedDuels.filter(d => d.winner_pubkey === walletB).length;
      const ratio = Math.min(aWins, bWins) / Math.max(aWins, bWins, 1);
      if (ratio > 0.8) riskScore += 30; // Suspiciously even win distribution
    }

    if (riskScore > 0) {
      log.info({ walletA, walletB, riskScore, duelCount: recentDuels.length }, 'Collusion risk detected');
    }

    return Math.min(riskScore, 100);
  } catch (err) {
    log.error({ err, walletA, walletB }, 'Collusion check failed — allowing by default');
    return 0;
  }
}

/**
 * Run all anti-sybil checks for duel participation.
 * Throws if any check fails.
 */
export async function validateDuelParticipant(pubkey: string, opponentPubkey?: string): Promise<void> {
  if (!env.ENABLE_SYBIL_CHECKS) return;

  const hasHistory = await checkTradeHistory(pubkey);
  if (!hasHistory) {
    throw new Error(`INSUFFICIENT_HISTORY: Need at least ${env.MIN_CLOSED_POSITIONS} closed positions on Adrena`);
  }

  if (opponentPubkey) {
    const collusionScore = await checkCollusionPair(pubkey, opponentPubkey);
    if (collusionScore >= 80) {
      throw new Error('COLLUSION_SUSPECTED: Unusual trading pattern detected between these wallets');
    }
  }
}
