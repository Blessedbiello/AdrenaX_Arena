import { sql } from 'kysely';
import { getDb } from '../db/connection.js';
import type { UserStats } from '../db/types.js';

/**
 * Calculate title based on current win streak.
 */
function calculateTitle(streak: number): string | null {
  if (streak >= 10) return 'legendary_duelist';
  if (streak >= 5) return 'arena_champion';
  if (streak >= 3) return 'hot_streak';
  return null;
}

/**
 * Calculate mutagen multiplier based on current win streak.
 * Formula: 1.0 + (streak * 0.05), capped at 2.0
 */
function calculateMultiplier(streak: number): number {
  return Math.min(2.0, 1.0 + streak * 0.05);
}

/**
 * Update streak stats after a duel settles.
 * Winner's win streak increments, loser's resets.
 */
export async function updateStreaks(winnerPubkey: string, loserPubkey: string): Promise<void> {
  const db = getDb();

  // Upsert winner stats
  const winnerExisting = await db
    .selectFrom('arena_user_stats')
    .where('user_pubkey', '=', winnerPubkey)
    .selectAll()
    .executeTakeFirst();

  const winStreak = winnerExisting?.streak_type === 'win'
    ? winnerExisting.current_streak + 1
    : 1;
  const winBest = Math.max(winStreak, winnerExisting?.best_streak ?? 0);
  const winTitle = calculateTitle(winStreak);
  const winMultiplier = calculateMultiplier(winStreak);

  await db
    .insertInto('arena_user_stats')
    .values({
      user_pubkey: winnerPubkey,
      current_streak: winStreak,
      best_streak: winBest,
      streak_type: 'win',
      total_wins: 1,
      total_losses: 0,
      title: winTitle,
      mutagen_multiplier: winMultiplier,
      updated_at: new Date(),
    })
    .onConflict(oc =>
      oc.column('user_pubkey').doUpdateSet({
        current_streak: winStreak,
        best_streak: winBest,
        streak_type: 'win',
        total_wins: sql`arena_user_stats.total_wins + 1`,
        title: winTitle,
        mutagen_multiplier: winMultiplier,
        updated_at: new Date(),
      })
    )
    .execute();

  // Upsert loser stats
  await db
    .insertInto('arena_user_stats')
    .values({
      user_pubkey: loserPubkey,
      current_streak: 1,
      best_streak: 0,
      streak_type: 'loss',
      total_wins: 0,
      total_losses: 1,
      title: null,
      mutagen_multiplier: 1.0,
      updated_at: new Date(),
    })
    .onConflict(oc =>
      oc.column('user_pubkey').doUpdateSet({
        current_streak: sql`CASE WHEN arena_user_stats.streak_type = 'loss' THEN arena_user_stats.current_streak + 1 ELSE 1 END`,
        streak_type: 'loss',
        total_losses: sql`arena_user_stats.total_losses + 1`,
        title: null,
        mutagen_multiplier: 1.0,
        updated_at: new Date(),
      })
    )
    .execute();
}

/**
 * Get user stats for display.
 */
export async function getUserStats(userPubkey: string): Promise<UserStats | null> {
  const db = getDb();
  const result = await db
    .selectFrom('arena_user_stats')
    .where('user_pubkey', '=', userPubkey)
    .selectAll()
    .executeTakeFirst();
  return result ?? null;
}
