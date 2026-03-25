import { sql } from 'kysely';
import { getDb } from '../db/connection.js';

export const PASS_MILESTONES = [
  { name: 'First Blood', threshold: 1, unlock: 'Arena profile badge' },
  { name: 'Contender', threshold: 50, unlock: '1.1x Mutagen multiplier' },
  { name: 'Warrior', threshold: 150, unlock: 'Challenge card skin' },
  { name: 'Elite', threshold: 300, unlock: '1.25x Mutagen multiplier' },
  { name: 'Champion', threshold: 500, unlock: 'Seasonal title + 1.5x Mutagen multiplier' },
] as const;

/**
 * Award season points after a competition result.
 * No-op if the competition is not linked to a season.
 */
export async function awardSeasonPoints(
  competitionId: string,
  userPubkey: string,
  points: number,
  mode: 'duel' | 'gauntlet' | 'clan'
): Promise<void> {
  const db = getDb();

  // Look up competition's season_id
  const competition = await db
    .selectFrom('arena_competitions')
    .where('id', '=', competitionId)
    .select('season_id')
    .executeTakeFirst();

  if (!competition?.season_id) return; // Not part of a season

  const modeColumn = mode === 'duel' ? 'duel_points'
    : mode === 'gauntlet' ? 'gauntlet_points'
    : 'clan_points';

  await db
    .insertInto('arena_season_points')
    .values({
      season_id: competition.season_id,
      user_pubkey: userPubkey,
      total_points: points,
      duel_points: mode === 'duel' ? points : 0,
      gauntlet_points: mode === 'gauntlet' ? points : 0,
      clan_points: mode === 'clan' ? points : 0,
    })
    .onConflict(oc =>
      oc.columns(['season_id', 'user_pubkey']).doUpdateSet({
        total_points: sql`arena_season_points.total_points + ${points}`,
        [modeColumn]: sql`arena_season_points.${sql.ref(modeColumn)} + ${points}`,
      })
    )
    .execute();

  const updatedPoints = await db
    .selectFrom('arena_season_points')
    .where('season_id', '=', competition.season_id)
    .where('user_pubkey', '=', userPubkey)
    .select('total_points')
    .executeTakeFirstOrThrow();

  const totalPoints = Number(updatedPoints.total_points);
  const unlockedRewards = PASS_MILESTONES.filter((milestone) => totalPoints >= milestone.threshold);

  await db
    .insertInto('arena_season_pass_progress')
    .values({
      season_id: competition.season_id,
      user_pubkey: userPubkey,
      total_points: totalPoints,
      highest_milestone: unlockedRewards.length,
      unlocked_rewards: unlockedRewards as unknown as Record<string, unknown>,
    })
    .onConflict((oc) =>
      oc.columns(['season_id', 'user_pubkey']).doUpdateSet({
        total_points: totalPoints,
        highest_milestone: unlockedRewards.length,
        unlocked_rewards: unlockedRewards as unknown as Record<string, unknown>,
        updated_at: sql`NOW()`,
      })
    )
    .execute();
}

/**
 * Get season leaderboard.
 */
export async function getSeasonLeaderboard(seasonId: number) {
  const db = getDb();
  return db
    .selectFrom('arena_season_points')
    .where('season_id', '=', seasonId)
    .orderBy('total_points', 'desc')
    .limit(50)
    .selectAll()
    .execute();
}
