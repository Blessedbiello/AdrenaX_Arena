import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { PASS_MILESTONES } from '../engine/season.js';

export const seasonRouter = Router();

seasonRouter.get('/current', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const season = await db
      .selectFrom('arena_seasons')
      .where('status', 'in', ['active', 'upcoming'])
      .orderBy('status', 'asc')
      .orderBy('start_time', 'asc')
      .selectAll()
      .executeTakeFirst();

    if (!season) {
      res.status(404).json({ success: false, error: 'SEASON_NOT_FOUND' });
      return;
    }

    res.json({ success: true, data: season });
  } catch (err) {
    console.error('[Season] Current season error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

seasonRouter.get('/standings', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
    const season = seasonId
      ? await db.selectFrom('arena_seasons').where('id', '=', seasonId).selectAll().executeTakeFirst()
      : await db
          .selectFrom('arena_seasons')
          .where('status', 'in', ['active', 'upcoming'])
          .orderBy('status', 'asc')
          .orderBy('start_time', 'asc')
          .selectAll()
          .executeTakeFirst();

    if (!season) {
      res.status(404).json({ success: false, error: 'SEASON_NOT_FOUND' });
      return;
    }

    const standings = await db
      .selectFrom('arena_season_points')
      .where('season_id', '=', season.id)
      .orderBy('total_points', 'desc')
      .orderBy('duel_points', 'desc')
      .orderBy('gauntlet_points', 'desc')
      .limit(100)
      .selectAll()
      .execute();

    res.json({ success: true, data: { season, standings } });
  } catch (err) {
    console.error('[Season] Standings error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

seasonRouter.get('/pass/:wallet', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const wallet = z.string().min(32).max(44).parse(req.params.wallet);
    const season = await db
      .selectFrom('arena_seasons')
      .where('status', 'in', ['active', 'upcoming'])
      .orderBy('status', 'asc')
      .orderBy('start_time', 'asc')
      .selectAll()
      .executeTakeFirst();

    if (!season) {
      res.status(404).json({ success: false, error: 'SEASON_NOT_FOUND' });
      return;
    }

    const progress = await db
      .selectFrom('arena_season_pass_progress')
      .where('season_id', '=', season.id)
      .where('user_pubkey', '=', wallet)
      .selectAll()
      .executeTakeFirst();

    const totalPoints = Number(progress?.total_points ?? 0);
    const unlockedMilestones = Array.isArray(progress?.unlocked_rewards)
      ? progress.unlocked_rewards
      : PASS_MILESTONES.filter((milestone) => totalPoints >= milestone.threshold);
    const nextMilestone = PASS_MILESTONES.find((milestone) => totalPoints < milestone.threshold) ?? null;

    res.json({
      success: true,
      data: {
        season,
        wallet,
        totalPoints,
        unlockedMilestones,
        nextMilestone,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    console.error('[Season] Pass progress error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});
