'use client';

import { useSSELeaderboard } from '../hooks/useSSELeaderboard';
import type { LeaderboardEntry } from '../lib/types';

function shortenPubkey(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function rankBadge(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

export default function LiveLeaderboard({ competitionId }: { competitionId: string }) {
  const { leaderboard, connected } = useSSELeaderboard(competitionId);

  return (
    <div className="bg-arena-card border border-arena-border rounded-xl">
      <div className="flex justify-between items-center p-4 border-b border-arena-border">
        <h3 className="font-bold text-lg">Leaderboard</h3>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-arena-accent' : 'bg-arena-red'}`} />
          <span className="text-xs text-arena-muted">{connected ? 'Live' : 'Reconnecting...'}</span>
        </div>
      </div>

      {leaderboard.length === 0 ? (
        <div className="p-8 text-center text-arena-muted">No participants yet</div>
      ) : (
        <div className="divide-y divide-arena-border">
          {leaderboard.map((entry) => (
            <div key={entry.pubkey} className="flex items-center gap-4 px-4 py-3 hover:bg-arena-bg/50">
              <span className="w-10 text-center font-bold">{rankBadge(entry.rank)}</span>
              <div className="flex-1">
                <div className="font-mono text-sm">{shortenPubkey(entry.pubkey)}</div>
                <div className="text-xs text-arena-muted">
                  {entry.trades} trades | Win rate: {(entry.winRate * 100).toFixed(0)}%
                </div>
              </div>
              <div className="text-right">
                <div className={`font-bold ${entry.roi >= 0 ? 'text-arena-accent' : 'text-arena-red'}`}>
                  {entry.roi >= 0 ? '+' : ''}{entry.roi.toFixed(2)}%
                </div>
                <div className="text-xs text-arena-muted">${entry.pnl.toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
