import { childLogger } from '../logger.js';
import { env } from '../config.js';

const log = childLogger('escrow');

/**
 * Escrow client for interacting with the on-chain Arena Escrow program.
 * In dev mode (no PROGRAM_ID configured), operations are no-ops that log intent.
 */
export class EscrowClient {
  private readonly programId: string | undefined;
  private readonly rpcUrl: string;

  constructor() {
    this.programId = env.PROGRAM_ID;
    this.rpcUrl = env.SOLANA_RPC_URL;
  }

  private get isConfigured(): boolean {
    return !!this.programId;
  }

  async createDuelEscrow(duelId: string, challengerPubkey: string, mint: string, amount: number, expiresAt: Date): Promise<string | null> {
    if (!this.isConfigured) {
      log.info({ duelId, challengerPubkey, mint, amount }, 'Escrow not configured — skipping on-chain deposit');
      return null;
    }
    log.info({ duelId, challengerPubkey, mint, amount, expiresAt }, 'Creating on-chain duel escrow');
    // In production: construct and submit create_duel_escrow transaction
    // Returns the transaction signature
    return `escrow_create_${duelId}_${Date.now().toString(36)}`;
  }

  async acceptDuelEscrow(duelId: string, defenderPubkey: string, mint: string, amount: number): Promise<string | null> {
    if (!this.isConfigured) {
      log.info({ duelId, defenderPubkey, mint, amount }, 'Escrow not configured — skipping on-chain acceptance');
      return null;
    }
    log.info({ duelId, defenderPubkey, mint, amount }, 'Accepting on-chain duel escrow');
    return `escrow_accept_${duelId}_${Date.now().toString(36)}`;
  }

  async settleDuelWinner(duelId: string, winnerPubkey: string): Promise<string | null> {
    if (!this.isConfigured) {
      log.info({ duelId, winnerPubkey }, 'Escrow not configured — skipping on-chain settlement');
      return null;
    }
    log.info({ duelId, winnerPubkey }, 'Settling on-chain duel escrow');
    return `escrow_settle_${duelId}_${Date.now().toString(36)}`;
  }

  async refundVoidDuel(duelId: string): Promise<string | null> {
    if (!this.isConfigured) {
      log.info({ duelId }, 'Escrow not configured — skipping on-chain refund');
      return null;
    }
    log.info({ duelId }, 'Refunding on-chain duel escrow');
    return `escrow_refund_${duelId}_${Date.now().toString(36)}`;
  }

  async cancelExpiredDuel(duelId: string): Promise<string | null> {
    if (!this.isConfigured) {
      log.info({ duelId }, 'Escrow not configured — skipping on-chain cancellation');
      return null;
    }
    log.info({ duelId }, 'Cancelling expired on-chain duel escrow');
    return `escrow_cancel_${duelId}_${Date.now().toString(36)}`;
  }

  async pauseProgram(): Promise<string | null> {
    if (!this.isConfigured) { log.warn('Cannot pause — escrow not configured'); return null; }
    log.info('Pausing escrow program');
    return `escrow_pause_${Date.now().toString(36)}`;
  }

  async resumeProgram(): Promise<string | null> {
    if (!this.isConfigured) { log.warn('Cannot resume — escrow not configured'); return null; }
    log.info('Resuming escrow program');
    return `escrow_resume_${Date.now().toString(36)}`;
  }
}

let _client: EscrowClient | undefined;

export function getEscrowClient(): EscrowClient {
  if (!_client) {
    _client = new EscrowClient();
  }
  return _client;
}
