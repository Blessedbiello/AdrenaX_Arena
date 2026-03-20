import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { sql } from 'kysely';
import { generateNonce } from '../middleware/auth.js';

export const userRouter = Router();

// Get nonce for wallet authentication
userRouter.get('/nonce/:wallet', async (req: Request, res: Response) => {
  const wallet = req.params.wallet as string;
  if (wallet.length < 32 || wallet.length > 44) {
    res.status(400).json({ success: false, error: 'INVALID_WALLET' });
    return;
  }
  const nonce = generateNonce(wallet);
  res.json({ success: true, data: { nonce, message: `AdrenaX Arena Authentication\nNonce: ${nonce}` } });
});

// Get user arena profile
userRouter.get('/:wallet/profile', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const wallet = req.params.wallet;

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
      },
    });
  } catch (err) {
    console.error('[Users] Profile error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});
