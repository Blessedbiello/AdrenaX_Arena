import { childLogger } from '../../logger.js';
import type { LeaderboardAdapter } from '../integration.js';
import { env } from '../../config.js';

const log = childLogger('adapter.leaderboard');

export class LeaderboardAdapterImpl implements LeaderboardAdapter {
  async syncUserStats(userPubkey: string, stats: {
    arenaWins: number; arenaLosses: number; arenaROI: number;
    arenaPnL: number; duelStreak: number; mutagenEarned: number;
  }): Promise<void> {
    log.info({ userPubkey, stats }, 'Syncing user stats to leaderboard');
    if (!env.ADRENA_LEADERBOARD_API_URL) {
      throw new Error('ADRENA_LEADERBOARD_API_URL not configured');
    }

    const response = await fetch(`${env.ADRENA_LEADERBOARD_API_URL.replace(/\/$/, '')}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userPubkey, ...stats }),
    });

    if (!response.ok) {
      throw new Error(`Leaderboard sync API returned ${response.status}`);
    }
  }

  async pushCompetitionResult(competitionId: string, mode: string, rankings: Array<{
    rank: number; pubkey: string; roi: number; pnl: number;
  }>): Promise<void> {
    log.info({ competitionId, mode, topRanked: rankings.slice(0, 3) }, 'Pushing competition result');
    if (!env.ADRENA_LEADERBOARD_API_URL) {
      throw new Error('ADRENA_LEADERBOARD_API_URL not configured');
    }

    const response = await fetch(`${env.ADRENA_LEADERBOARD_API_URL.replace(/\/$/, '')}/competitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competitionId, mode, rankings }),
    });

    if (!response.ok) {
      throw new Error(`Competition leaderboard API returned ${response.status}`);
    }
  }
}
