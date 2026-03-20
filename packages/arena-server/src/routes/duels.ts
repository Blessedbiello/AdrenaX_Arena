import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { createDuel, acceptDuel, getDuelDetails, DuelError } from '../engine/duel.js';
import { requireAuth, generateNonce } from '../middleware/auth.js';
import { getDb } from '../db/connection.js';
import { arenaEvents } from '../adrena/integration.js';

export const duelRouter = Router();

// Create a duel challenge
const CreateDuelSchema = z.object({
  defenderPubkey: z.string().min(32).max(44),
  assetSymbol: z.enum(['SOL', 'BTC', 'ETH', 'BONK', 'JTO', 'JITOSOL']),
  durationHours: z.union([z.literal(24), z.literal(48)]),
  stakeAmount: z.number().min(0).optional().default(0),
  stakeToken: z.enum(['ADX', 'USDC']).optional().default('ADX'),
  isHonorDuel: z.boolean().optional().default(false),
});

duelRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).wallet as string;
    const input = CreateDuelSchema.parse(req.body);

    const result = await createDuel({
      challengerPubkey: wallet,
      defenderPubkey: input.defenderPubkey,
      assetSymbol: input.assetSymbol,
      durationHours: input.durationHours,
      stakeAmount: input.stakeAmount,
      stakeToken: input.stakeToken,
      isHonorDuel: input.isHonorDuel,
    });

    arenaEvents.emit('duel_created', {
      type: 'duel_created',
      timestamp: new Date(),
      payload: {
        duelId: result.duel.id,
        competitionId: result.competition.id,
        challengerPubkey: wallet,
        defenderPubkey: input.defenderPubkey,
        assetSymbol: input.assetSymbol,
        durationHours: input.durationHours,
        isHonorDuel: input.isHonorDuel,
        stakeAmount: input.stakeAmount,
        stakeToken: input.stakeToken,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        duel: result.duel,
        competition: result.competition,
        challengeUrl: `/arena/challenge/${result.duel.id}`,
        cardUrl: `/api/arena/challenge/${result.duel.id}/card.png`,
      },
    });
  } catch (err) {
    if (err instanceof DuelError) {
      res.status(400).json({ success: false, error: err.code, message: err.message });
      return;
    }
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    console.error('[Duels] Create error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// Accept a duel challenge
duelRouter.post('/:id/accept', requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).wallet as string;
    const duelId = req.params.id as string;

    const result = await acceptDuel(duelId, wallet);

    arenaEvents.emit('duel_accepted', {
      type: 'duel_accepted',
      timestamp: new Date(),
      payload: {
        duelId,
        competitionId: result.duel.competition_id,
        challengerPubkey: result.duel.challenger_pubkey,
        defenderPubkey: wallet,
        startTime: result.startTime,
        endTime: result.endTime,
      },
    });

    res.json({
      success: true,
      data: {
        duel: result.duel,
        startTime: result.startTime,
        endTime: result.endTime,
      },
    });
  } catch (err) {
    if (err instanceof DuelError) {
      const status = err.code === 'DUEL_NOT_AVAILABLE' ? 404 : 400;
      res.status(status).json({ success: false, error: err.code, message: err.message });
      return;
    }
    console.error('[Duels] Accept error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// Get duel details
duelRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await getDuelDetails(req.params.id as string);
    if (!result) {
      res.status(404).json({ success: false, error: 'DUEL_NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Duels] Get error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// List duels (with filters)
const ListDuelsSchema = z.object({
  status: z.enum(['pending', 'accepted', 'active', 'settling', 'completed', 'expired', 'cancelled']).optional(),
  wallet: z.string().optional(),
  asset: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
});

duelRouter.get('/', async (req: Request, res: Response) => {
  try {
    const filters = ListDuelsSchema.parse(req.query);
    const db = getDb();

    let query = db
      .selectFrom('arena_duels')
      .orderBy('created_at', 'desc')
      .limit(filters.limit)
      .offset(filters.offset)
      .selectAll();

    if (filters.status) {
      query = query.where('status', '=', filters.status);
    }
    if (filters.wallet) {
      query = query.where(eb =>
        eb.or([
          eb('challenger_pubkey', '=', filters.wallet!),
          eb('defender_pubkey', '=', filters.wallet!),
        ])
      );
    }
    if (filters.asset) {
      query = query.where('asset_symbol', '=', filters.asset);
    }

    const duels = await query.execute();
    res.json({ success: true, data: duels });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    console.error('[Duels] List error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// SSE stream for duel updates
duelRouter.get('/:id/stream', async (req: Request, res: Response) => {
  const duelId = req.params.id as string;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial state
  const details = await getDuelDetails(duelId);
  if (details) {
    res.write(`event: snapshot\ndata: ${JSON.stringify(details)}\n\n`);
  }

  // Poll for updates every 5 seconds
  const interval = setInterval(async () => {
    try {
      const updated = await getDuelDetails(duelId);
      if (updated) {
        res.write(`event: update\ndata: ${JSON.stringify(updated)}\n\n`);

        // Stop streaming if duel is complete
        if (['completed', 'expired', 'cancelled'].includes(updated.duel.status)) {
          res.write(`event: complete\ndata: ${JSON.stringify({ status: updated.duel.status })}\n\n`);
          clearInterval(interval);
          res.end();
        }
      }
    } catch (err) {
      console.error('[SSE] Duel stream error:', err);
    }
  }, 5000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// Submit prediction
const PredictionSchema = z.object({
  predictedWinner: z.string().min(32).max(44),
});

duelRouter.post('/:id/predict', requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).wallet as string;
    const duelId = req.params.id as string;
    const { predictedWinner } = PredictionSchema.parse(req.body);

    const db = getDb();

    // Check duel is active and prediction window is open
    const duel = await db
      .selectFrom('arena_duels')
      .where('id', '=', duelId)
      .where('status', '=', 'active')
      .selectAll()
      .executeTakeFirst();

    if (!duel) {
      res.status(400).json({ success: false, error: 'DUEL_NOT_ACTIVE' });
      return;
    }

    // Can't predict own duel
    if (wallet === duel.challenger_pubkey || wallet === duel.defender_pubkey) {
      res.status(400).json({ success: false, error: 'CANNOT_PREDICT_OWN_DUEL' });
      return;
    }

    // Must predict one of the two participants
    if (predictedWinner !== duel.challenger_pubkey && predictedWinner !== duel.defender_pubkey) {
      res.status(400).json({ success: false, error: 'INVALID_PREDICTION_TARGET' });
      return;
    }

    // Check prediction window (locked in last 10% of duration)
    const competition = await db
      .selectFrom('arena_competitions')
      .where('id', '=', duel.competition_id)
      .select(['start_time', 'end_time'])
      .executeTakeFirstOrThrow();

    const totalDuration = new Date(competition.end_time).getTime() - new Date(competition.start_time).getTime();
    const lockoutTime = new Date(competition.end_time).getTime() - totalDuration * 0.1;
    if (Date.now() > lockoutTime) {
      res.status(400).json({ success: false, error: 'PREDICTION_WINDOW_CLOSED' });
      return;
    }

    const prediction = await db
      .insertInto('arena_predictions')
      .values({
        duel_id: duelId,
        predictor_pubkey: wallet,
        predicted_winner: predictedWinner,
      })
      .onConflict(oc => oc.columns(['duel_id', 'predictor_pubkey']).doUpdateSet({
        predicted_winner: predictedWinner,
        prediction_locked_at: new Date(),
      }))
      .returningAll()
      .executeTakeFirstOrThrow();

    res.json({ success: true, data: prediction });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    console.error('[Duels] Prediction error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// Get prediction stats for a duel
duelRouter.get('/:id/predictions', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const duelId = req.params.id;

    const duel = await db
      .selectFrom('arena_duels')
      .where('id', '=', duelId)
      .selectAll()
      .executeTakeFirst();

    if (!duel) {
      res.status(404).json({ success: false, error: 'DUEL_NOT_FOUND' });
      return;
    }

    const predictions = await db
      .selectFrom('arena_predictions')
      .where('duel_id', '=', duelId)
      .selectAll()
      .execute();

    const challengerVotes = predictions.filter(p => p.predicted_winner === duel.challenger_pubkey).length;
    const defenderVotes = predictions.filter(p => p.predicted_winner === duel.defender_pubkey).length;

    res.json({
      success: true,
      data: {
        total: predictions.length,
        challenger: { pubkey: duel.challenger_pubkey, votes: challengerVotes },
        defender: { pubkey: duel.defender_pubkey, votes: defenderVotes },
      },
    });
  } catch (err) {
    console.error('[Duels] Predictions error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});
