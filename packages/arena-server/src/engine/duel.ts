import { sql } from 'kysely';
import { getDb } from '../db/connection.js';
import type { DB } from '../db/types.js';
import { scheduleDuelSettlement, startIndexingParticipant } from './indexer.js';
import { scheduleRewardProcessing } from '../rewards/distributor.js';
import { updateStreaks } from './streaks.js';
import { env } from '../config.js';

export class DuelError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = 'DuelError';
  }
}

export interface CreateDuelInput {
  challengerPubkey: string;
  defenderPubkey?: string;
  assetSymbol: string;
  durationHours: 24 | 48;
  stakeAmount?: number;
  stakeToken?: string;
  isHonorDuel?: boolean;
}

/**
 * Create a new duel challenge.
 * Creates both the competition and duel records in a single transaction.
 */
export async function createDuel(input: CreateDuelInput) {
  const db = getDb();
  const {
    challengerPubkey,
    defenderPubkey,
    assetSymbol,
    durationHours,
    stakeAmount = 0,
    stakeToken = 'ADX',
    isHonorDuel = false,
  } = input;

  if (defenderPubkey && challengerPubkey === defenderPubkey) {
    throw new DuelError('CANNOT_SELF_DUEL', 'Cannot challenge yourself');
  }

  const now = new Date();
  // Open challenges get 24 hours to accept, direct challenges get 1 hour
  const expiresMs = defenderPubkey ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expiresAt = new Date(now.getTime() + expiresMs);

  return db.transaction().execute(async (trx) => {
    // Create the parent competition
    const competition = await trx
      .insertInto('arena_competitions')
      .values({
        mode: 'duel',
        status: 'pending',
        start_time: now, // Will be updated on accept
        end_time: new Date(now.getTime() + durationHours * 60 * 60 * 1000), // Placeholder
        current_round: 1,
        total_rounds: 1,
        config: JSON.stringify({ asset: assetSymbol, durationHours }),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Create the duel record
    const duel = await trx
      .insertInto('arena_duels')
      .values({
        competition_id: competition.id,
        challenger_pubkey: challengerPubkey,
        defender_pubkey: defenderPubkey ?? null,
        asset_symbol: assetSymbol,
        stake_amount: stakeAmount,
        stake_token: stakeToken,
        is_honor_duel: isHonorDuel,
        duration_hours: durationHours,
        status: 'pending',
        expires_at: expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Create challenger as participant
    await trx
      .insertInto('arena_participants')
      .values({
        competition_id: competition.id,
        user_pubkey: challengerPubkey,
        status: 'active',
      })
      .execute();

    return { competition, duel };
  });
}

/**
 * Accept a duel challenge.
 * Uses SELECT ... FOR UPDATE to prevent race conditions on double-accept.
 */
export async function acceptDuel(duelId: string, defenderWallet: string) {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    // Lock the duel row
    const duel = await trx
      .selectFrom('arena_duels')
      .where('id', '=', duelId)
      .where('status', '=', 'pending')
      .forUpdate()
      .selectAll()
      .executeTakeFirst();

    if (!duel) {
      throw new DuelError('DUEL_NOT_AVAILABLE', 'Duel not found or no longer pending');
    }

    if (duel.challenger_pubkey === defenderWallet) {
      throw new DuelError('CANNOT_SELF_DUEL', 'Cannot accept your own challenge');
    }

    if (duel.defender_pubkey && duel.defender_pubkey !== defenderWallet) {
      throw new DuelError('WRONG_DEFENDER', 'This duel was challenged to a different wallet');
    }

    if (new Date(duel.expires_at) < new Date()) {
      // Auto-expire
      await trx
        .updateTable('arena_duels')
        .set({ status: 'expired' })
        .where('id', '=', duelId)
        .execute();
      throw new DuelError('DUEL_EXPIRED', 'Challenge has expired');
    }

    const now = new Date();
    const endTime = new Date(now.getTime() + duel.duration_hours * 60 * 60 * 1000);

    // Update duel status
    const updatedDuel = await trx
      .updateTable('arena_duels')
      .set({
        status: 'active',
        defender_pubkey: defenderWallet,
        accepted_at: now,
      })
      .where('id', '=', duelId)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Update competition to active with real times
    await trx
      .updateTable('arena_competitions')
      .set({
        status: 'active',
        start_time: now,
        end_time: endTime,
        updated_at: now,
      })
      .where('id', '=', duel.competition_id)
      .execute();

    // Add defender as participant
    await trx
      .insertInto('arena_participants')
      .values({
        competition_id: duel.competition_id,
        user_pubkey: defenderWallet,
        status: 'active',
      })
      .execute();

    // Schedule position indexing for both participants
    const redisUrl = env.REDIS_URL;
    await startIndexingParticipant(redisUrl, duel.competition_id, duel.challenger_pubkey);
    await startIndexingParticipant(redisUrl, duel.competition_id, defenderWallet);

    // Schedule settlement when the duel ends
    await scheduleDuelSettlement(redisUrl, duelId, endTime);

    return { duel: updatedDuel, startTime: now, endTime };
  });
}

/**
 * Settle a completed duel.
 * Uses advisory lock to prevent concurrent settlement.
 */
export async function settleDuel(duelId: string) {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    // Advisory lock based on duel ID hash
    const lockKey = hashToInt(duelId);
    await sql`SELECT pg_advisory_xact_lock(${lockKey})`.execute(trx);

    const duel = await trx
      .selectFrom('arena_duels')
      .where('id', '=', duelId)
      .where('status', '=', 'active')
      .forUpdate()
      .selectAll()
      .executeTakeFirst();

    if (!duel) {
      throw new DuelError('DUEL_NOT_SETTLEABLE', 'Duel not found or not active');
    }

    const competition = await trx
      .selectFrom('arena_competitions')
      .where('id', '=', duel.competition_id)
      .selectAll()
      .executeTakeFirstOrThrow();

    // Fetch eligible trades for both participants
    const startTime = new Date(competition.start_time);
    const endTime = new Date(competition.end_time);

    const [challengerTrades, defenderTrades] = await Promise.all([
      getEligibleTrades(trx, duel.competition_id, duel.challenger_pubkey, startTime, endTime),
      duel.defender_pubkey
        ? getEligibleTrades(trx, duel.competition_id, duel.defender_pubkey, startTime, endTime)
        : Promise.resolve([]),
    ]);

    // Import scoring dynamically to avoid circular deps
    const { determineDuelWinner } = await import('./scoring.js');

    const challengerTradesForScoring = challengerTrades.map(toScoringTrade);
    const defenderTradesForScoring = defenderTrades.map(toScoringTrade);

    const result = determineDuelWinner(
      challengerTradesForScoring,
      defenderTradesForScoring,
      duel.challenger_pubkey,
      duel.defender_pubkey ?? ''
    );

    // Update duel with result
    await trx
      .updateTable('arena_duels')
      .set({
        status: 'completed',
        winner_pubkey: result.winner,
        challenger_roi: result.challengerROI,
        defender_roi: result.defenderROI,
      })
      .where('id', '=', duelId)
      .execute();

    // Update competition status
    await trx
      .updateTable('arena_competitions')
      .set({ status: 'completed', updated_at: new Date() })
      .where('id', '=', duel.competition_id)
      .execute();

    // Update participant statuses
    if (result.winner) {
      await trx
        .updateTable('arena_participants')
        .set({ status: 'winner' })
        .where('competition_id', '=', duel.competition_id)
        .where('user_pubkey', '=', result.winner)
        .execute();

      const loser = result.winner === duel.challenger_pubkey
        ? duel.defender_pubkey
        : duel.challenger_pubkey;

      if (loser) {
        await trx
          .updateTable('arena_participants')
          .set({ status: 'eliminated' })
          .where('competition_id', '=', duel.competition_id)
          .where('user_pubkey', '=', loser)
          .execute();

        // Update streak stats
        await updateStreaks(result.winner, loser);
      }

      // Create reward entries for staked duels
      if (!duel.is_honor_duel && Number(duel.stake_amount) > 0) {
        const totalStake = Number(duel.stake_amount) * 2;
        const protocolFee = totalStake * 0.02;
        const winnerPrize = totalStake - protocolFee;

        await trx
          .insertInto('arena_rewards')
          .values([
            {
              competition_id: duel.competition_id,
              user_pubkey: result.winner,
              amount: winnerPrize,
              token: duel.stake_token,
              reward_type: 'prize',
            },
            {
              competition_id: duel.competition_id,
              user_pubkey: 'protocol',
              amount: protocolFee,
              token: duel.stake_token,
              reward_type: 'protocol_fee',
            },
          ])
          .execute();
      }
    } else {
      // Both forfeit — mark both as forfeited
      await trx
        .updateTable('arena_participants')
        .set({ status: 'forfeited' })
        .where('competition_id', '=', duel.competition_id)
        .execute();
    }

    // Create Mutagen rewards for honor duels (with streak multiplier)
    if (duel.is_honor_duel && result.winner) {
      // Look up winner's streak multiplier
      const winnerStats = await trx
        .selectFrom('arena_user_stats')
        .where('user_pubkey', '=', result.winner)
        .select('mutagen_multiplier')
        .executeTakeFirst();

      const multiplier = Number(winnerStats?.mutagen_multiplier ?? 1.0);
      const mutagenAmount = Math.round(50 * multiplier);

      await trx
        .insertInto('arena_rewards')
        .values({
          competition_id: duel.competition_id,
          user_pubkey: result.winner,
          amount: mutagenAmount,
          token: 'MUTAGEN',
          reward_type: 'mutagen_bonus',
        })
        .execute();
    }

    // Stop indexing both participants
    const redisUrl = env.REDIS_URL;
    await import('./indexer.js').then(m => {
      return Promise.all([
        m.stopIndexingParticipant(redisUrl, duel.competition_id, duel.challenger_pubkey),
        duel.defender_pubkey
          ? m.stopIndexingParticipant(redisUrl, duel.competition_id, duel.defender_pubkey)
          : Promise.resolve(),
      ]);
    });

    // Schedule reward processing
    await scheduleRewardProcessing(redisUrl, duel.competition_id);

    // Settle predictions
    if (result.winner) {
      await trx
        .updateTable('arena_predictions')
        .set({ is_correct: true, mutagen_reward: 10 })
        .where('duel_id', '=', duelId)
        .where('predicted_winner', '=', result.winner)
        .execute();

      await trx
        .updateTable('arena_predictions')
        .set({ is_correct: false, mutagen_reward: 0 })
        .where('duel_id', '=', duelId)
        .where('predicted_winner', '!=', result.winner)
        .execute();
    }

    return { duel: { ...duel, ...result }, result };
  });
}

/**
 * Expire pending duels that have passed their expires_at time.
 */
export async function expireStaleDuels() {
  const db = getDb();
  const now = new Date();

  const expired = await db
    .updateTable('arena_duels')
    .set({ status: 'expired' })
    .where('status', '=', 'pending')
    .where('expires_at', '<', now)
    .returningAll()
    .execute();

  // Also cancel the parent competitions
  for (const duel of expired) {
    await db
      .updateTable('arena_competitions')
      .set({ status: 'cancelled', updated_at: now })
      .where('id', '=', duel.competition_id)
      .execute();
  }

  return expired.length;
}

/**
 * Get a duel with full details including participant scores.
 */
export async function getDuelDetails(duelId: string) {
  const db = getDb();

  const duel = await db
    .selectFrom('arena_duels')
    .where('id', '=', duelId)
    .selectAll()
    .executeTakeFirst();

  if (!duel) return null;

  const [participants, predictions, competition] = await Promise.all([
    db
      .selectFrom('arena_participants')
      .where('competition_id', '=', duel.competition_id)
      .selectAll()
      .execute(),
    db
      .selectFrom('arena_predictions')
      .where('duel_id', '=', duelId)
      .selectAll()
      .execute(),
    db
      .selectFrom('arena_competitions')
      .where('id', '=', duel.competition_id)
      .select(['start_time', 'end_time'])
      .executeTakeFirst(),
  ]);

  return { duel, participants, predictions, competition };
}

// ── Helpers ──

async function getEligibleTrades(
  trx: any,
  competitionId: string,
  userPubkey: string,
  startTime: Date,
  endTime: Date
) {
  return trx
    .selectFrom('arena_trades')
    .where('competition_id', '=', competitionId)
    .where('user_pubkey', '=', userPubkey)
    .where('exit_date', 'is not', null)
    .where('entry_date', '>=', startTime)
    .where('exit_date', '<=', endTime)
    .where('collateral_usd', '>=', 50)
    .where(
      sql`EXTRACT(EPOCH FROM (exit_date - entry_date))`,
      '>=',
      60
    )
    .selectAll()
    .execute();
}

function toScoringTrade(trade: any) {
  return {
    pnl_usd: Number(trade.pnl_usd) || 0,
    fees_usd: Number(trade.fees_usd) || 0,
    collateral_usd: Number(trade.collateral_usd) || 0,
    entry_date: new Date(trade.entry_date),
    exit_date: new Date(trade.exit_date),
  };
}

function hashToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
