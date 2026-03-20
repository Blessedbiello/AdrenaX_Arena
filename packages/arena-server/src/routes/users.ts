import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { sql } from 'kysely';
import { generateNonce } from '../middleware/auth.js';
import { getUserStats } from '../engine/streaks.js';

export const userRouter = Router();

// Get nonce for wallet authentication
userRouter.get('/nonce/:wallet', async (req: Request, res: Response) => {
  const wallet = req.params.wallet as string;
  if (wallet.length < 32 || wallet.length > 44) {
    res.status(400).json({ success: false, error: 'INVALID_WALLET' });
    return;
  }
  const nonce = await generateNonce(wallet);
  res.json({ success: true, data: { nonce, message: `AdrenaX Arena Authentication\nNonce: ${nonce}` } });
});

// Get user streak stats
userRouter.get('/:wallet/streak', async (req: Request, res: Response) => {
  try {
    const stats = await getUserStats(req.params.wallet as string);
    res.json({
      success: true,
      data: stats || {
        current_streak: 0,
        best_streak: 0,
        streak_type: 'none',
        total_wins: 0,
        total_losses: 0,
        title: null,
        mutagen_multiplier: 1.0,
      },
    });
  } catch (err) {
    console.error('[Users] Streak error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// Get user arena profile
userRouter.get('/:wallet/profile', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const wallet = req.params.wallet as string;

    // Duel stats
    const duelStats = await db
      .selectFrom('arena_duels')
      .where(eb => eb.or([
        eb('challenger_pubkey', '=', wallet),
        eb('defender_pubkey', '=', wallet),
      ]))
      .where('status', '=', 'completed')
      .select([
        sql<number>`COUNT(*)`.as('total_duels'),
        sql<number>`COUNT(*) FILTER (WHERE winner_pubkey = ${wallet})`.as('wins'),
        sql<number>`COUNT(*) FILTER (WHERE winner_pubkey IS NOT NULL AND winner_pubkey != ${wallet})`.as('losses'),
      ])
      .executeTakeFirstOrThrow();

    // Gauntlet stats
    const gauntletStats = await db
      .selectFrom('arena_participants')
      .innerJoin('arena_competitions', 'arena_competitions.id', 'arena_participants.competition_id')
      .where('arena_participants.user_pubkey', '=', wallet)
      .where('arena_competitions.mode', '=', 'gauntlet')
      .where('arena_competitions.status', '=', 'completed')
      .select([
        sql<number>`COUNT(*)`.as('gauntlets_entered'),
        sql<number>`COUNT(*) FILTER (WHERE arena_participants.status = 'winner')`.as('gauntlets_won'),
      ])
      .executeTakeFirstOrThrow();

    // Streak stats
    const streak = await getUserStats(wallet);

    // Recent duels
    const recentDuels = await db
      .selectFrom('arena_duels')
      .where(eb => eb.or([
        eb('challenger_pubkey', '=', wallet),
        eb('defender_pubkey', '=', wallet),
      ]))
      .orderBy('created_at', 'desc')
      .limit(10)
      .selectAll()
      .execute();

    res.json({
      success: true,
      data: {
        wallet,
        duels: {
          total: Number(duelStats.total_duels),
          wins: Number(duelStats.wins),
          losses: Number(duelStats.losses),
          winRate: Number(duelStats.total_duels) > 0
            ? Number(duelStats.wins) / Number(duelStats.total_duels)
            : 0,
        },
        gauntlets: {
          entered: Number(gauntletStats.gauntlets_entered),
          won: Number(gauntletStats.gauntlets_won),
        },
        recentDuels,
        streak: {
          current: streak?.current_streak ?? 0,
          best: streak?.best_streak ?? 0,
          type: streak?.streak_type ?? 'none',
          title: streak?.title ?? null,
          multiplier: Number(streak?.mutagen_multiplier ?? 1.0),
        },
      },
    });
  } catch (err) {
    console.error('[Users] Profile error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});
