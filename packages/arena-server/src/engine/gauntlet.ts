import { sql } from 'kysely';
import { getDb } from '../db/connection.js';
import {
  scheduleGauntletActivation,
  scheduleGauntletSettlement,
  scheduleGauntletRoundSettlement,
  scheduleGauntletRoundActivation,
  startIndexingParticipant,
  stopIndexingParticipant,
} from './indexer.js';
import { scheduleRewardProcessing } from '../rewards/distributor.js';
import type { GauntletConfig } from '../db/types.js';
import { env } from '../config.js';

export class GauntletError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = 'GauntletError';
  }
}

export interface CreateGauntletInput {
  name: string;
  maxParticipants?: number;
  durationHours?: number;
  rounds?: number;
  roundDurations?: number[];
  intermissionMinutes?: number;
  seasonId?: number;
}

/**
 * Create a new Gauntlet competition.
 * Supports multi-round elimination with configurable round durations and intermissions.
 */
export async function createGauntlet(input: CreateGauntletInput) {
  const db = getDb();
  const {
    name,
    maxParticipants = 16,
    durationHours = 24,
    rounds = 3,
    roundDurations = [48, 24, 12],
    intermissionMinutes = 30,
    seasonId,
  } = input;

  const now = new Date();
  // Registration period: 2 hours before start
  const registrationEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  // Total duration: sum of all round durations + intermissions between rounds
  const totalRoundMs = roundDurations.reduce((sum, h) => sum + h * 60 * 60 * 1000, 0);
  const totalIntermissionMs = (rounds - 1) * intermissionMinutes * 60 * 1000;
  const endTime = new Date(registrationEnd.getTime() + totalRoundMs + totalIntermissionMs);

  const competition = await db
    .insertInto('arena_competitions')
    .values({
      mode: 'gauntlet',
      status: 'registration',
      season_id: seasonId ?? null,
      start_time: registrationEnd,
      end_time: endTime,
      current_round: 0,
      total_rounds: rounds,
      config: JSON.stringify({
        name,
        maxParticipants,
        durationHours,
        rounds,
        roundDurations,
        intermissionMinutes,
      }),
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  const redisUrl = env.REDIS_URL;

  // Schedule activation when registration ends
  await scheduleGauntletActivation(redisUrl, competition.id, registrationEnd);

  // Schedule first round settlement
  const firstRoundDurationMs = roundDurations[0] * 60 * 60 * 1000;
  const firstRoundEndTime = new Date(registrationEnd.getTime() + firstRoundDurationMs);
  await scheduleGauntletRoundSettlement(redisUrl, competition.id, firstRoundEndTime);

  return competition;
}

/**
 * Register a participant for a Gauntlet.
 */
export async function registerForGauntlet(
  competitionId: string,
  userPubkey: string
) {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    const competition = await trx
      .selectFrom('arena_competitions')
      .where('id', '=', competitionId)
      .where('mode', '=', 'gauntlet')
      .where('status', '=', 'registration')
      .forUpdate()
      .selectAll()
      .executeTakeFirst();

    if (!competition) {
      throw new GauntletError('NOT_REGISTRABLE', 'Gauntlet not found or registration closed');
    }

    const config = (typeof competition.config === 'string' ? JSON.parse(competition.config) : competition.config) as GauntletConfig;
    const maxParticipants = config.maxParticipants ?? 16;

    // Check current count
    const { count } = await trx
      .selectFrom('arena_participants')
      .where('competition_id', '=', competitionId)
      .select(sql<number>`COUNT(*)`.as('count'))
      .executeTakeFirstOrThrow();

    if (Number(count) >= maxParticipants) {
      throw new GauntletError('GAUNTLET_FULL', `Gauntlet is full (${maxParticipants} max)`);
    }

    // Register
    const participant = await trx
      .insertInto('arena_participants')
      .values({
        competition_id: competitionId,
        user_pubkey: userPubkey,
        status: 'active',
      })
      .onConflict(oc => oc.columns(['competition_id', 'user_pubkey']).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (!participant) {
      throw new GauntletError('ALREADY_REGISTERED', 'Already registered for this Gauntlet');
    }

    return participant;
  });
}

/**
 * Activate a Gauntlet (transition from registration to active).
 * Sets current_round to 1 to begin round tracking.
 */
export async function activateGauntlet(competitionId: string) {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    const lockKey = hashToInt(competitionId);
    await sql`SELECT pg_advisory_xact_lock(${lockKey})`.execute(trx);

    const competition = await trx
      .selectFrom('arena_competitions')
      .where('id', '=', competitionId)
      .where('status', '=', 'registration')
      .forUpdate()
      .selectAll()
      .executeTakeFirst();

    if (!competition) {
      throw new GauntletError('NOT_ACTIVATABLE', 'Gauntlet not found or not in registration');
    }

    // Need at least 2 participants
    const { count } = await trx
      .selectFrom('arena_participants')
      .where('competition_id', '=', competitionId)
      .select(sql<number>`COUNT(*)`.as('count'))
      .executeTakeFirstOrThrow();

    if (Number(count) < 2) {
      // Cancel — not enough participants
      await trx
        .updateTable('arena_competitions')
        .set({ status: 'cancelled', updated_at: new Date() })
        .where('id', '=', competitionId)
        .execute();
      throw new GauntletError('NOT_ENOUGH_PARTICIPANTS', 'Need at least 2 participants');
    }

    // Activate and set current_round to 1 (was 0 during registration)
    await trx
      .updateTable('arena_competitions')
      .set({ status: 'active', current_round: 1, updated_at: new Date() })
      .where('id', '=', competitionId)
      .execute();

    // Start indexing for all registered participants
    const participants = await trx
      .selectFrom('arena_participants')
      .where('competition_id', '=', competitionId)
      .where('status', '=', 'active')
      .select('user_pubkey')
      .execute();

    const redisUrl = env.REDIS_URL;
    for (const p of participants) {
      await startIndexingParticipant(redisUrl, competitionId, p.user_pubkey);
    }

    return { participantCount: Number(count) };
  });
}

/**
 * Settle a single Gauntlet round.
 * - Forfeits participants with 0 positions_closed this round.
 * - Eliminates the bottom 50% of remaining participants.
 * - If this is the final round, triggers full settlement (rewards, completion).
 * - Otherwise transitions to 'round_transition' and schedules the next round.
 */
export async function settleGauntletRound(competitionId: string) {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    const lockKey = hashToInt(competitionId);
    await sql`SELECT pg_advisory_xact_lock(${lockKey})`.execute(trx);

    const competition = await trx
      .selectFrom('arena_competitions')
      .where('id', '=', competitionId)
      .where('status', '=', 'active')
      .forUpdate()
      .selectAll()
      .executeTakeFirst();

    if (!competition) {
      throw new GauntletError('NOT_SETTLEABLE', 'Gauntlet not found or not active');
    }

    const config = (typeof competition.config === 'string'
      ? JSON.parse(competition.config as string)
      : competition.config) as GauntletConfig;

    const currentRound = competition.current_round;

    // Get all active participants ordered by arena_score DESC
    const participants = await trx
      .selectFrom('arena_participants')
      .where('competition_id', '=', competitionId)
      .where('status', '=', 'active')
      .orderBy('arena_score', 'desc')
      .selectAll()
      .execute();

    // Forfeit anyone with 0 positions_closed this round
    const forfeited = participants.filter(p => p.positions_closed === 0);
    for (const p of forfeited) {
      await trx
        .updateTable('arena_participants')
        .set({ status: 'forfeited', eliminated_round: currentRound })
        .where('id', '=', p.id)
        .execute();
    }

    const active = participants.filter(p => p.positions_closed > 0);

    // Eliminate bottom 50% (Math.floor of half, keeping Math.ceil survivors)
    const surviveCount = Math.ceil(active.length / 2);
    const surviving = active.slice(0, surviveCount);
    const eliminated = active.slice(surviveCount);

    for (const p of eliminated) {
      await trx
        .updateTable('arena_participants')
        .set({ status: 'eliminated', eliminated_round: currentRound })
        .where('id', '=', p.id)
        .execute();
    }

    // Create round snapshot
    const allEliminated = [
      ...forfeited.map(p => p.user_pubkey),
      ...eliminated.map(p => p.user_pubkey),
    ];

    await trx
      .insertInto('arena_round_snapshots')
      .values({
        competition_id: competitionId,
        round_number: currentRound,
        participant_scores: JSON.stringify(
          active.map(p => ({
            pubkey: p.user_pubkey,
            arenaScore: Number(p.arena_score),
            roi: Number(p.roi_percent),
            pnl: Number(p.pnl_usd),
            trades: p.positions_closed,
          }))
        ),
        eliminated_pubkeys: allEliminated,
      })
      .execute();

    // Record settlement snapshot for audit trail
    await trx
      .insertInto('arena_settlement_snapshots')
      .values({
        competition_id: competitionId,
        snapshot_type: currentRound >= competition.total_rounds ? 'gauntlet_final' : 'gauntlet_round',
        raw_positions: JSON.stringify(
          participants.map(p => ({
            pubkey: p.user_pubkey,
            arena_score: Number(p.arena_score),
            roi_percent: Number(p.roi_percent),
            pnl_usd: Number(p.pnl_usd),
            positions_closed: p.positions_closed,
            status: p.status,
          }))
        ),
        computed_scores: JSON.stringify({
          round: currentRound,
          surviveCount,
          activeCount: active.length,
          forfeitedCount: forfeited.length,
        }),
        settlement_result: JSON.stringify({
          surviving: surviving.map(p => p.user_pubkey),
          eliminated: eliminated.map(p => p.user_pubkey),
          forfeited: forfeited.map(p => p.user_pubkey),
          isFinal: currentRound >= competition.total_rounds,
        }),
      })
      .execute();

    const redisUrl = env.REDIS_URL;

    if (currentRound >= competition.total_rounds) {
      // Final round — do full settlement
      if (surviving.length > 0) {
        await trx
          .updateTable('arena_participants')
          .set({ status: 'winner' })
          .where('id', '=', surviving[0].id)
          .execute();
      }

      await trx
        .updateTable('arena_competitions')
        .set({ status: 'completed', updated_at: new Date() })
        .where('id', '=', competitionId)
        .execute();

      // Stop indexing for all participants
      for (const p of participants) {
        await stopIndexingParticipant(redisUrl, competitionId, p.user_pubkey);
      }

      // Award top 3 surviving participants with Mutagen bonuses
      const rewards = [100, 60, 30];
      for (let i = 0; i < Math.min(3, surviving.length); i++) {
        await trx
          .insertInto('arena_rewards')
          .values({
            competition_id: competitionId,
            user_pubkey: surviving[i].user_pubkey,
            amount: rewards[i],
            token: 'MUTAGEN',
            reward_type: 'mutagen_bonus',
          })
          .execute();
      }

      await scheduleRewardProcessing(redisUrl, competitionId);

      return {
        round: currentRound,
        final: true,
        surviving: surviving.map(p => p.user_pubkey),
        eliminated: allEliminated,
      };
    } else {
      // More rounds remain — transition to round_transition
      const nextRound = currentRound + 1;
      const intermissionMs = (config.intermissionMinutes ?? 30) * 60 * 1000;
      const nextRoundDurationMs = (config.roundDurations?.[nextRound - 1] ?? 24) * 60 * 60 * 1000;

      await trx
        .updateTable('arena_competitions')
        .set({
          status: 'round_transition',
          current_round: nextRound,
          updated_at: new Date(),
        })
        .where('id', '=', competitionId)
        .execute();

      // Stop indexing for eliminated participants
      for (const p of [...forfeited, ...eliminated]) {
        await stopIndexingParticipant(redisUrl, competitionId, p.user_pubkey);
      }

      // Schedule next round activation after intermission
      const activationTime = new Date(Date.now() + intermissionMs);
      await scheduleGauntletRoundActivation(redisUrl, competitionId, activationTime);

      // Schedule next round settlement after activation + round duration
      const nextRoundEnd = new Date(activationTime.getTime() + nextRoundDurationMs);
      await scheduleGauntletRoundSettlement(redisUrl, competitionId, nextRoundEnd);

      return {
        round: currentRound,
        final: false,
        nextRound,
        surviving: surviving.map(p => p.user_pubkey),
        eliminated: allEliminated,
        nextActivationAt: activationTime,
        nextRoundEndAt: nextRoundEnd,
      };
    }
  });
}

/**
 * Activate the next Gauntlet round after an intermission.
 * Transitions from 'round_transition' to 'active' and resets per-round
 * positions_closed to 0 so scoring starts fresh for the new round.
 */
export async function activateGauntletRound(competitionId: string) {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    const lockKey = hashToInt(competitionId);
    await sql`SELECT pg_advisory_xact_lock(${lockKey})`.execute(trx);

    const competition = await trx
      .selectFrom('arena_competitions')
      .where('id', '=', competitionId)
      .where('status', '=', 'round_transition')
      .forUpdate()
      .selectAll()
      .executeTakeFirst();

    if (!competition) {
      throw new GauntletError(
        'NOT_ROUND_ACTIVATABLE',
        'Gauntlet not found or not in round_transition'
      );
    }

    await trx
      .updateTable('arena_competitions')
      .set({ status: 'active', updated_at: new Date() })
      .where('id', '=', competitionId)
      .execute();

    // Reset positions_closed to 0 for all remaining active participants
    // so round-scoped elimination logic counts only this round's trades
    await trx
      .updateTable('arena_participants')
      .set({ positions_closed: 0, updated_at: new Date() })
      .where('competition_id', '=', competitionId)
      .where('status', '=', 'active')
      .execute();

    // Restart indexing for all remaining active participants
    const participants = await trx
      .selectFrom('arena_participants')
      .where('competition_id', '=', competitionId)
      .where('status', '=', 'active')
      .select('user_pubkey')
      .execute();

    const redisUrl = env.REDIS_URL;
    for (const p of participants) {
      await startIndexingParticipant(redisUrl, competitionId, p.user_pubkey);
    }

    return {
      round: competition.current_round,
      participantCount: participants.length,
    };
  });
}

/**
 * Settle a Gauntlet — rank participants and create rewards for top 3.
 * This is the legacy single-round path; multi-round gauntlets use settleGauntletRound.
 */
export async function settleGauntlet(competitionId: string) {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    const lockKey = hashToInt(competitionId);
    await sql`SELECT pg_advisory_xact_lock(${lockKey})`.execute(trx);

    const competition = await trx
      .selectFrom('arena_competitions')
      .where('id', '=', competitionId)
      .where('status', '=', 'active')
      .forUpdate()
      .selectAll()
      .executeTakeFirst();

    if (!competition) {
      throw new GauntletError('NOT_SETTLEABLE', 'Gauntlet not found or not active');
    }

    // Get ranked participants ordered by arena_score DESC
    const participants = await trx
      .selectFrom('arena_participants')
      .where('competition_id', '=', competitionId)
      .where('status', '=', 'active')
      .orderBy('arena_score', 'desc')
      .selectAll()
      .execute();

    // Eliminate participants with 0 closed positions
    for (const p of participants) {
      if (p.positions_closed === 0) {
        await trx
          .updateTable('arena_participants')
          .set({ status: 'forfeited' })
          .where('id', '=', p.id)
          .execute();
      }
    }

    const activeParticipants = participants.filter(p => p.positions_closed > 0);

    // Mark winner
    if (activeParticipants.length > 0) {
      await trx
        .updateTable('arena_participants')
        .set({ status: 'winner' })
        .where('id', '=', activeParticipants[0].id)
        .execute();
    }

    // Create snapshot
    await trx
      .insertInto('arena_round_snapshots')
      .values({
        competition_id: competitionId,
        round_number: competition.current_round,
        participant_scores: JSON.stringify(
          activeParticipants.map(p => ({
            pubkey: p.user_pubkey,
            arenaScore: Number(p.arena_score),
            roi: Number(p.roi_percent),
            pnl: Number(p.pnl_usd),
            trades: p.positions_closed,
          }))
        ),
        eliminated_pubkeys: participants
          .filter(p => p.positions_closed === 0)
          .map(p => p.user_pubkey),
      })
      .execute();

    // Update competition
    await trx
      .updateTable('arena_competitions')
      .set({ status: 'completed', updated_at: new Date() })
      .where('id', '=', competitionId)
      .execute();

    // Stop indexing for all participants
    const redisUrl = env.REDIS_URL;
    for (const p of participants) {
      await stopIndexingParticipant(redisUrl, competitionId, p.user_pubkey);
    }

    // Award top 3 with Mutagen bonuses
    const rewards = [100, 60, 30]; // Mutagen amounts
    for (let i = 0; i < Math.min(3, activeParticipants.length); i++) {
      await trx
        .insertInto('arena_rewards')
        .values({
          competition_id: competitionId,
          user_pubkey: activeParticipants[i].user_pubkey,
          amount: rewards[i],
          token: 'MUTAGEN',
          reward_type: 'mutagen_bonus',
        })
        .execute();
    }

    // Schedule reward processing
    await scheduleRewardProcessing(redisUrl, competitionId);

    return {
      rankings: activeParticipants.map((p, i) => ({
        rank: i + 1,
        pubkey: p.user_pubkey,
        arenaScore: Number(p.arena_score),
        roi: Number(p.roi_percent),
        pnl: Number(p.pnl_usd),
        trades: p.positions_closed,
      })),
    };
  });
}

/**
 * Get Gauntlet leaderboard.
 */
export async function getGauntletLeaderboard(competitionId: string) {
  const db = getDb();

  const participants = await db
    .selectFrom('arena_participants')
    .where('competition_id', '=', competitionId)
    .where('status', 'in', ['active', 'winner'])
    .orderBy('arena_score', 'desc')
    .selectAll()
    .execute();

  return participants.map((p, i) => ({
    rank: i + 1,
    pubkey: p.user_pubkey,
    roi: Number(p.roi_percent),
    pnl: Number(p.pnl_usd),
    volume: Number(p.total_volume_usd),
    trades: p.positions_closed,
    winRate: Number(p.win_rate),
    arenaScore: Number(p.arena_score),
    status: p.status,
  }));
}

function hashToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
