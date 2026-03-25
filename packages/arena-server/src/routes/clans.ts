import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { createClan, joinClan, leaveClan, getClanRankings, getClanDetails, ClanError } from '../engine/clan.js';

export const clanRouter = Router();

const CreateClanSchema = z.object({
  name: z.string().min(3).max(32),
  tag: z.string().min(2).max(5),
});

clanRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).wallet as string;
    const { name, tag } = CreateClanSchema.parse(req.body);
    const clan = await createClan(name, tag, wallet);
    res.status(201).json({ success: true, data: clan });
  } catch (err) {
    if (err instanceof ClanError) {
      res.status(400).json({ success: false, error: err.code, message: err.message });
      return;
    }
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    console.error('[Clans] Create error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

clanRouter.post('/:id/join', requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).wallet as string;
    const member = await joinClan(req.params.id as string, wallet);
    res.status(201).json({ success: true, data: member });
  } catch (err) {
    if (err instanceof ClanError) {
      res.status(400).json({ success: false, error: err.code, message: err.message });
      return;
    }
    console.error('[Clans] Join error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

clanRouter.delete('/membership', requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).wallet as string;
    const result = await leaveClan(wallet);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof ClanError) {
      res.status(400).json({ success: false, error: err.code, message: err.message });
      return;
    }
    console.error('[Clans] Leave error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

clanRouter.get('/rankings', async (_req: Request, res: Response) => {
  try {
    const rankings = await getClanRankings();
    res.json({ success: true, data: rankings });
  } catch (err) {
    console.error('[Clans] Rankings error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

clanRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await getClanDetails(req.params.id as string);
    if (!result) {
      res.status(404).json({ success: false, error: 'CLAN_NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Clans] Details error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});
