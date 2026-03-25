import { childLogger } from '../../logger.js';
import type { MutagenAdapter } from '../integration.js';
import { env } from '../../config.js';

const log = childLogger('adapter.mutagen');

export class MutagenAdapterImpl implements MutagenAdapter {
  async awardMutagen(userPubkey: string, amount: number, reason: string, metadata: Record<string, unknown>): Promise<void> {
    log.info({ userPubkey, amount, reason, metadata }, 'Awarding Mutagen');
    if (!env.ADRENA_MUTAGEN_API_URL) {
      throw new Error('ADRENA_MUTAGEN_API_URL not configured');
    }

    const response = await fetch(env.ADRENA_MUTAGEN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userPubkey, amount, reason, metadata }),
    });

    if (!response.ok) {
      throw new Error(`Mutagen API returned ${response.status}`);
    }
  }

  async getMutagenBalance(userPubkey: string): Promise<number> {
    log.debug({ userPubkey }, 'Getting Mutagen balance');
    if (!env.ADRENA_MUTAGEN_API_URL) {
      return 0;
    }

    const response = await fetch(`${env.ADRENA_MUTAGEN_API_URL.replace(/\/$/, '')}/balance/${userPubkey}`);
    if (!response.ok) {
      throw new Error(`Mutagen balance API returned ${response.status}`);
    }

    const payload = await response.json() as { balance?: number };
    return Number(payload.balance ?? 0);
  }

  async applyMultiplier(userPubkey: string, multiplier: number, expiresAt: Date): Promise<void> {
    log.info({ userPubkey, multiplier, expiresAt }, 'Applying Mutagen multiplier');
    if (!env.ADRENA_MUTAGEN_API_URL) {
      throw new Error('ADRENA_MUTAGEN_API_URL not configured');
    }

    const response = await fetch(`${env.ADRENA_MUTAGEN_API_URL.replace(/\/$/, '')}/multiplier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userPubkey, multiplier, expiresAt }),
    });

    if (!response.ok) {
      throw new Error(`Mutagen multiplier API returned ${response.status}`);
    }
  }
}
