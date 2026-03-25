import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/admin-auth.js';
import { getDb } from '../db/connection.js';
import { getEscrowClient } from '../solana/escrow-client.js';

export const adminRouter = Router();

// All admin routes require admin auth
adminRouter.use(requireAdmin);

// Season management
adminRouter.post('/seasons', async (req: Request, res: Response) => {
  try {
    const { name, start_time, end_time } = z.object({
      name: z.string().min(3).max(64),
      start_time: z.string(),
      end_time: z.string(),
    }).parse(req.body);

    const db = getDb();
    const season = await db
      .insertInto('arena_seasons')
      .values({
        name,
        start_time: new Date(start_time),
        end_time: new Date(end_time),
        status: 'upcoming',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    res.status(201).json({ success: true, data: season });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    console.error('[Admin] Create season error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

adminRouter.patch('/seasons/:id', async (req: Request, res: Response) => {
  try {
    const { status } = z.object({
      status: z.enum(['upcoming', 'active', 'completed']),
    }).parse(req.body);

    const db = getDb();
    const season = await db
      .updateTable('arena_seasons')
      .set({ status })
      .where('id', '=', Number(req.params.id))
      .returningAll()
      .executeTakeFirst();

    if (!season) {
      res.status(404).json({ success: false, error: 'SEASON_NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: season });
  } catch (err) {
    console.error('[Admin] Update season error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

adminRouter.get('/seasons', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const seasons = await db
      .selectFrom('arena_seasons')
      .orderBy('start_time', 'desc')
      .selectAll()
      .execute();
    res.json({ success: true, data: seasons });
  } catch (err) {
    console.error('[Admin] List seasons error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// Competition management
adminRouter.post('/competitions/:id/cancel', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const competition = await db
      .updateTable('arena_competitions')
      .set({ status: 'cancelled', updated_at: new Date() })
      .where('id', '=', req.params.id as string)
      .returningAll()
      .executeTakeFirst();

    if (!competition) {
      res.status(404).json({ success: false, error: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: competition });
  } catch (err) {
    console.error('[Admin] Cancel competition error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// User management
adminRouter.post('/users/:wallet/ban', async (req: Request, res: Response) => {
  try {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
    const wallet = req.params.wallet as string;
    const db = getDb();

    await db
      .insertInto('arena_user_stats')
      .values({
        user_pubkey: wallet,
        current_streak: 0,
        best_streak: 0,
        streak_type: 'none',
        total_wins: 0,
        total_losses: 0,
        title: null,
        mutagen_multiplier: 1.0,
        banned_at: new Date(),
        banned_reason: reason,
      })
      .onConflict(oc =>
        oc.column('user_pubkey').doUpdateSet({
          banned_at: new Date(),
          banned_reason: reason,
        })
      )
      .execute();

    res.json({ success: true, data: { wallet, banned: true, reason } });
  } catch (err) {
    console.error('[Admin] Ban user error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

adminRouter.post('/users/:wallet/unban', async (req: Request, res: Response) => {
  try {
    const wallet = req.params.wallet as string;
    const db = getDb();

    await db
      .updateTable('arena_user_stats')
      .set({ banned_at: null, banned_reason: null })
      .where('user_pubkey', '=', wallet)
      .execute();

    res.json({ success: true, data: { wallet, banned: false } });
  } catch (err) {
    console.error('[Admin] Unban user error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// Escrow management
adminRouter.post('/escrow/pause', async (_req: Request, res: Response) => {
  try {
    const client = getEscrowClient();
    const tx = await client.pauseProgram();
    res.json({ success: true, data: { tx } });
  } catch (err) {
    console.error('[Admin] Escrow pause error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

adminRouter.post('/escrow/resume', async (_req: Request, res: Response) => {
  try {
    const client = getEscrowClient();
    const tx = await client.resumeProgram();
    res.json({ success: true, data: { tx } });
  } catch (err) {
    console.error('[Admin] Escrow resume error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// Force-settle a duel (for testing — bypasses scheduled settlement)
// If the Adrena API has no positions for test wallets, the admin can
// pass ?useDbTrades=true to use arena_trades table instead of live API
adminRouter.post('/duels/:id/settle', async (req: Request, res: Response) => {
  try {
    const { settleDuel } = await import('../engine/duel.js');
    const result = await settleDuel(req.params.id as string);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Admin] Force-settle duel error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: (err as Error).message });
  }
});

// Force-settle a clan war (for testing)
adminRouter.post('/clan-wars/:id/settle', async (req: Request, res: Response) => {
  try {
    const { settleClanWar } = await import('../engine/clan.js');
    const result = await settleClanWar(req.params.id as string);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Admin] Force-settle clan war error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: (err as Error).message });
  }
});

// Webhook management
adminRouter.get('/webhooks', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const webhooks = await db
      .selectFrom('arena_webhooks')
      .selectAll()
      .execute();
    res.json({ success: true, data: webhooks });
  } catch (err) {
    console.error('[Admin] List webhooks error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});
