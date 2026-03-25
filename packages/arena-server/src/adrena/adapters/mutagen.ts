import { childLogger } from '../../logger.js';
import type { MutagenAdapter } from '../integration.js';
import { env } from '../../config.js';

const log = childLogger('adapter.mutagen');

export class MutagenAdapterImpl implements MutagenAdapter {
  async awardMutagen(userPubkey: string, amount: number, reason: string, metadata: Record<string, unknown>): Promise<void> {
    log.info({ userPubkey, amount, reason, metadata }, 'Awarding Mutagen');
    if (env.ADRENA_MUTAGEN_API_URL) {
      try {
        await fetch(env.ADRENA_MUTAGEN_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userPubkey, amount, reason, metadata }),
        });
      } catch (err) {
        log.error({ err, userPubkey, amount }, 'Failed to call Adrena Mutagen API');
      }
    }
  }

  async getMutagenBalance(userPubkey: string): Promise<number> {
    log.debug({ userPubkey }, 'Getting Mutagen balance');
    return 0; // Placeholder — Adrena provides this via their API
  }

  async applyMultiplier(userPubkey: string, multiplier: number, expiresAt: Date): Promise<void> {
    log.info({ userPubkey, multiplier, expiresAt }, 'Applying Mutagen multiplier');
  }
}
