import { childLogger } from '../../logger.js';
import type { QuestAdapter } from '../integration.js';
import { env } from '../../config.js';

const log = childLogger('adapter.quest');

export class QuestAdapterImpl implements QuestAdapter {
  async trackAction(userPubkey: string, action: string, metadata: Record<string, unknown>): Promise<void> {
    log.info({ userPubkey, action, metadata }, 'Tracking quest action');
    if (env.ADRENA_QUEST_WEBHOOK_URL) {
      try {
        await fetch(env.ADRENA_QUEST_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userPubkey, action, metadata, timestamp: new Date() }),
        });
      } catch (err) {
        log.error({ err, userPubkey, action }, 'Failed to track quest action');
      }
    }
  }
}
