import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  createClan,
  joinClan,
  leaveClan,
  getClanRankings,
  getClanDetails,
  createClanWar,
  acceptClanWar,
  confirmChallengerClanWarDeposit,
  getClanWars,
  ClanError,
} from '../engine/clan.js';
import { getDb } from '../db/connection.js';
import { getEscrowClient } from '../solana/escrow-client.js';

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

const CreateClanWarSchema = z.object({
  opponentClanId: z.string().uuid(),
  durationHours: z.union([z.literal(24), z.literal(48), z.literal(168)]),
  isHonorWar: z.boolean().optional().default(true),
  stakeAmount: z.number().min(0).optional().default(0),
  stakeToken: z.enum(['ADX', 'USDC']).optional().default('ADX'),
});

const AcceptClanWarSchema = z.object({
  txSignature: z.string().min(32).max(128).optional(),
});

const ConfirmEscrowSchema = z.object({
  txSignature: z.string().min(32).max(128),
});

clanRouter.post('/:id/challenge', requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).wallet as string;
    const { durationHours, isHonorWar, stakeAmount, stakeToken } = CreateClanWarSchema.parse({
      ...req.body,
      opponentClanId: req.params.id,
    });
    const result = await createClanWar(wallet, req.params.id as string, durationHours, isHonorWar, stakeAmount, stakeToken);

    let escrowAction = null;
    if (!isHonorWar && Number(stakeAmount ?? 0) > 0) {
      const war = await getDb()
        .selectFrom('arena_clan_wars')
        .where('id', '=', result.war.id)
        .selectAll()
        .executeTakeFirst();

      const clans = await getDb()
        .selectFrom('arena_clans')
        .where('id', 'in', [result.war.challenger_clan_id, result.war.defender_clan_id])
        .select(['id', 'leader_pubkey'])
        .execute();

      const defenderLeader = clans.find((clan) => clan.id === result.war.defender_clan_id)?.leader_pubkey;
      if (war && defenderLeader) {
        escrowAction = await getEscrowClient().buildClanChallengerDepositIntent(
          war.id,
          wallet,
          stakeToken,
          Number(stakeAmount ?? 0),
          new Date(war.expires_at),
          defenderLeader,
        );
      }
    }

    res.status(201).json({ success: true, data: { ...result, escrowAction } });
  } catch (err) {
    if (err instanceof ClanError) {
      res.status(400).json({ success: false, error: err.code, message: err.message });
      return;
    }
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    console.error('[Clans] Challenge error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

clanRouter.post('/wars/:warId/accept', requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).wallet as string;
    const { txSignature } = AcceptClanWarSchema.parse(req.body ?? {});
    const war = await acceptClanWar(req.params.warId as string, wallet, txSignature);
    res.json({ success: true, data: war });
  } catch (err) {
    if (err instanceof ClanError) {
      res.status(400).json({ success: false, error: err.code, message: err.message });
      return;
    }
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    console.error('[Clans] Accept war error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

clanRouter.post('/wars/:warId/escrow/challenger-intent', requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).wallet as string;
    const war = await getDb()
      .selectFrom('arena_clan_wars')
      .where('id', '=', req.params.warId as string)
      .selectAll()
      .executeTakeFirst();

    if (!war) {
      res.status(404).json({ success: false, error: 'WAR_NOT_FOUND' });
      return;
    }

    const clans = await getDb()
      .selectFrom('arena_clans')
      .where('id', 'in', [war.challenger_clan_id, war.defender_clan_id])
      .select(['id', 'leader_pubkey'])
      .execute();

    const challengerLeader = clans.find((clan) => clan.id === war.challenger_clan_id)?.leader_pubkey;
    const defenderLeader = clans.find((clan) => clan.id === war.defender_clan_id)?.leader_pubkey;
    if (challengerLeader !== wallet) {
      res.status(403).json({ success: false, error: 'FORBIDDEN' });
      return;
    }
    if (war.is_honor_war || Number(war.stake_amount) <= 0 || !war.stake_token) {
      res.status(400).json({ success: false, error: 'ESCROW_NOT_REQUIRED' });
      return;
    }
    if (!defenderLeader) {
      res.status(400).json({ success: false, error: 'INVALID_WAR_SETUP' });
      return;
    }

    const intent = await getEscrowClient().buildClanChallengerDepositIntent(
      war.id,
      wallet,
      war.stake_token as 'ADX' | 'USDC',
      Number(war.stake_amount),
      new Date(war.expires_at),
      defenderLeader,
    );
    res.json({ success: true, data: intent });
  } catch (err) {
    console.error('[Clans] Challenger war intent error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

clanRouter.post('/wars/:warId/escrow/challenger-confirm', requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).wallet as string;
    const { txSignature } = ConfirmEscrowSchema.parse(req.body);
    const war = await confirmChallengerClanWarDeposit(req.params.warId as string, wallet, txSignature);
    res.json({ success: true, data: war });
  } catch (err) {
    if (err instanceof ClanError) {
      res.status(400).json({ success: false, error: err.code, message: err.message });
      return;
    }
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: err.errors });
      return;
    }
    console.error('[Clans] Challenger war confirm error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

clanRouter.post('/wars/:warId/escrow/defender-intent', requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = (req as any).wallet as string;
    const war = await getDb()
      .selectFrom('arena_clan_wars')
      .where('id', '=', req.params.warId as string)
      .selectAll()
      .executeTakeFirst();

    if (!war) {
      res.status(404).json({ success: false, error: 'WAR_NOT_FOUND' });
      return;
    }

    const defenderClan = await getDb()
      .selectFrom('arena_clans')
      .where('id', '=', war.defender_clan_id)
      .select(['leader_pubkey'])
      .executeTakeFirst();

    if (!defenderClan || defenderClan.leader_pubkey !== wallet) {
      res.status(403).json({ success: false, error: 'FORBIDDEN' });
      return;
    }
    if (war.is_honor_war || Number(war.stake_amount) <= 0 || !war.stake_token) {
      res.status(400).json({ success: false, error: 'ESCROW_NOT_REQUIRED' });
      return;
    }

    const intent = await getEscrowClient().buildClanDefenderDepositIntent(
      war.id,
      wallet,
      war.stake_token as 'ADX' | 'USDC',
      Number(war.stake_amount),
      new Date(war.expires_at),
    );
    res.json({ success: true, data: intent });
  } catch (err) {
    console.error('[Clans] Defender war intent error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

clanRouter.get('/:id/wars', async (req: Request, res: Response) => {
  try {
    const wars = await getClanWars(req.params.id as string);
    res.json({ success: true, data: wars });
  } catch (err) {
    console.error('[Clans] List wars error:', err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});
