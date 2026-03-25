import { childLogger } from '../../logger.js';
import type { StreakAdapter } from '../integration.js';
import { getUserStats } from '../../engine/streaks.js';

const log = childLogger('adapter.streak');

export class StreakAdapterImpl implements StreakAdapter {
  async recordDuelResult(userPubkey: string, won: boolean, opponentPubkey: string): Promise<void> {
    log.info({ userPubkey, won, opponentPubkey }, 'Recording duel result for streak');
    // Actual streak tracking is handled by updateStreaks() in the settlement flow
    // This adapter is for Adrena's external streak system sync
  }

  async getStreak(userPubkey: string): Promise<{ current: number; best: number; type: 'win' | 'loss' }> {
    const stats = await getUserStats(userPubkey);
    return {
      current: stats?.current_streak ?? 0,
      best: stats?.best_streak ?? 0,
      type: (stats?.streak_type === 'win' || stats?.streak_type === 'loss') ? stats.streak_type : 'win',
    };
  }
}
