import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { listWebhooks, registerWebhook, removeWebhook } from '../adrena/integration.js';
import { requireAdmin } from '../middleware/admin-auth.js';

export const webhookRouter = Router();

webhookRouter.use(requireAdmin);

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum([
    'duel_created',
    'duel_accepted',
    'duel_settled',
    'gauntlet_created',
    'gauntlet_activated',
    'gauntlet_settled',
    'participant_registered',
    'reward_distributed',
    'prediction_made',
  ])).min(1),
  // secret: used for outgoing HMAC-SHA256 signing of webhook payloads.
  // The server signs each delivery body with this secret and includes the
  // signature in the X-Arena-Signature header so consumers can verify authenticity.
  secret: z.string().min(8).max(128),
  active: z.boolean().optional().default(true),
});

webhookRouter.post('/', async (req: Request, res: Response) => {
  try {
    const payload = CreateWebhookSchema.parse(req.body);
    const subscription = await registerWebhook(payload);
    res.status(201).json({ success: true, data: subscription });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    console.error('[Webhooks] Create error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

webhookRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const subscriptions = await listWebhooks();
    res.json({ success: true, data: subscriptions });
  } catch (err) {
    console.error('[Webhooks] List error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

webhookRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const removed = await removeWebhook(id);
    if (!removed) {
      res.status(404).json({ success: false, error: 'WEBHOOK_NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: { id, removed: true } });
  } catch (err) {
    console.error('[Webhooks] Delete error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});
