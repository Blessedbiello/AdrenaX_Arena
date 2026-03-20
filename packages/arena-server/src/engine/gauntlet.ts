import { sql } from 'kysely';
import { getDb } from '../db/connection.js';

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
  seasonId?: number;
}

/**
 * Create a new Gauntlet competition.
 * Simplified: single round, 16 participants, 24h duration.
 */
export async function createGauntlet(input: CreateGauntletInput) {
  const db = getDb();
  const {
    name,
    maxParticipants = 16,
    durationHours = 24,
    seasonId,
  } = input;

  const now = new Date();
  // Registration period: 2 hours before start
  const registrationEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const endTime = new Date(registrationEnd.getTime() + durationHours * 60 * 60 * 1000);

  const competition = await db
    .insertInto('arena_competitions')
    .values({
      mode: 'gauntlet',
      status: 'registration',
      season_id: seasonId ?? null,
      start_time: registrationEnd,
      end_time: endTime,
      current_round: 1,
      total_rounds: 1,
      config: JSON.stringify({ name, maxParticipants, durationHours }),
    })
    .returningAll()
    .executeTakeFirstOrThrow();

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

    const config = competition.config as any;
    const maxParticipants = config.maxParticipants || 16;

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
 * Should be called when registration period ends.
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

    await trx
      .updateTable('arena_competitions')
      .set({ status: 'active', updated_at: new Date() })
      .where('id', '=', competitionId)
      .execute();

    return { participantCount: Number(count) };
  });
}

/**
 * Settle a Gauntlet — rank participants and create rewards for top 3.
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

    // Get ranked participants
    const participants = await trx
      .selectFrom('arena_participants')
      .where('competition_id', '=', competitionId)
      .where('status', '=', 'active')
      .orderBy('roi_percent', 'desc')
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
        round_number: 1,
        participant_scores: JSON.stringify(
          activeParticipants.map(p => ({
            pubkey: p.user_pubkey,
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

    return {
      rankings: activeParticipants.map((p, i) => ({
        rank: i + 1,
        pubkey: p.user_pubkey,
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
    .orderBy('roi_percent', 'desc')
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
