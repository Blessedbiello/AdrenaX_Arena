import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/connection.js';
import {
  createGauntlet,
  registerForGauntlet,
  getGauntletLeaderboard,
  GauntletError,
} from '../engine/gauntlet.js';

export const competitionRouter = Router();

// List competitions
const ListSchema = z.object({
  mode: z.enum(['gauntlet', 'duel', 'clan_war', 'season']).optional(),
  status: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
});

competitionRouter.get('/', async (req: Request, res: Response) => {
  try {
    const filters = ListSchema.parse(req.query);
    const db = getDb();

    let query = db
      .selectFrom('arena_competitions')
      .orderBy('created_at', 'desc')
      .limit(filters.limit)
      .offset(filters.offset)
      .selectAll();

    if (filters.mode) query = query.where('mode', '=', filters.mode);
    if (filters.status) query = query.where('status', '=', filters.status as any);

    const competitions = await query.execute();
    res.json({ success: true, data: competitions });
  } catch (err) {
    console.error('[Competitions] List error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// Get competition details
competitionRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const competitionId = req.params.id as string;
    const competition = await db
      .selectFrom('arena_competitions')
      .where('id', '=', competitionId)
      .selectAll()
      .executeTakeFirst();

    if (!competition) {
      res.status(404).json({ success: false, error: 'NOT_FOUND' });
      return;
    }

    const participants = await db
      .selectFrom('arena_participants')
      .where('competition_id', '=', competitionId)
      .orderBy('roi_percent', 'desc')
      .selectAll()
      .execute();

    res.json({ success: true, data: { competition, participants } });
  } catch (err) {
    console.error('[Competitions] Get error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// SSE leaderboard stream
competitionRouter.get('/:id/stream', async (req: Request, res: Response) => {
  const competitionId = req.params.id as string;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial snapshot
  try {
    const leaderboard = await getGauntletLeaderboard(competitionId);
    res.write(`event: snapshot\ndata: ${JSON.stringify({ board: leaderboard })}\n\n`);
  } catch {
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to load leaderboard' })}\n\n`);
  }

  // Poll for updates
  const interval = setInterval(async () => {
    try {
      const leaderboard = await getGauntletLeaderboard(competitionId);
      res.write(`event: update\ndata: ${JSON.stringify({ board: leaderboard })}\n\n`);
    } catch (err) {
      // Silently continue
    }
  }, 10_000);

  req.on('close', () => clearInterval(interval));
});

// Create Gauntlet
const CreateGauntletSchema = z.object({
  name: z.string().min(3).max(64),
  maxParticipants: z.number().min(2).max(128).optional().default(16),
  durationHours: z.number().min(1).max(168).optional().default(24),
});

competitionRouter.post('/gauntlet', requireAuth, async (req: Request, res: Response) => {
  try {
    const input = CreateGauntletSchema.parse(req.body);
    const competition = await createGauntlet(input);
    res.status(201).json({ success: true, data: competition });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    console.error('[Competitions] Create gauntlet error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// Register for Gauntlet
competitionRouter.post('/:id/register', requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).wallet as string;
    const participant = await registerForGauntlet(req.params.id as string, wallet);
    res.status(201).json({ success: true, data: participant });
  } catch (err) {
    if (err instanceof GauntletError) {
      res.status(400).json({ success: false, error: err.code, message: err.message });
      return;
    }
    console.error('[Competitions] Register error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});
