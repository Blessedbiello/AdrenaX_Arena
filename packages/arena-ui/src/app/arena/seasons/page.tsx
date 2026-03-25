'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';

interface SeasonPoints {
  user_pubkey: string;
  total_points: number;
  duel_points: number;
  gauntlet_points: number;
  clan_points: number;
}

function shortenPubkey(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export default function SeasonsPage() {
  const [leaderboard, setLeaderboard] = useState<SeasonPoints[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // For now, show a placeholder since we need an active season
    setLoading(false);
  }, []);

  return (
    <div className="min-h-screen bg-arena-bg">
      <header className="border-b border-arena-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/arena" className="text-arena-muted hover:text-arena-text">← Arena</Link>
          <h1 className="text-xl font-bold">Seasonal Championship</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-gradient-to-r from-arena-gold/10 to-arena-card border border-arena-gold/30 rounded-2xl p-8 mb-8">
          <h2 className="text-2xl font-black mb-2">Season 1</h2>
          <p className="text-arena-muted mb-4">Earn points from duels, gauntlets, and clan wars. Top traders get exclusive rewards.</p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-arena-accent font-bold text-lg">10 pts</div>
              <div className="text-sm text-arena-muted">Per Duel Win</div>
            </div>
            <div>
              <div className="text-arena-accent font-bold text-lg">15-50 pts</div>
              <div className="text-sm text-arena-muted">Gauntlet Placement</div>
            </div>
            <div>
              <div className="text-arena-accent font-bold text-lg">5 pts</div>
              <div className="text-sm text-arena-muted">Clan War Contribution</div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-arena-muted">Loading season data...</div>
        ) : leaderboard.length > 0 ? (
          <div className="bg-arena-card border border-arena-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-arena-border">
                <tr className="text-arena-muted text-sm">
                  <th className="py-3 px-4 text-left">Rank</th>
                  <th className="py-3 px-4 text-left">Wallet</th>
                  <th className="py-3 px-4 text-right">Duels</th>
                  <th className="py-3 px-4 text-right">Gauntlet</th>
                  <th className="py-3 px-4 text-right">Clan</th>
                  <th className="py-3 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, i) => (
                  <tr key={entry.user_pubkey} className="border-b border-arena-border last:border-0">
                    <td className="py-3 px-4 font-bold">{i + 1}</td>
                    <td className="py-3 px-4 font-mono">{shortenPubkey(entry.user_pubkey)}</td>
                    <td className="py-3 px-4 text-right">{entry.duel_points}</td>
                    <td className="py-3 px-4 text-right">{entry.gauntlet_points}</td>
                    <td className="py-3 px-4 text-right">{entry.clan_points}</td>
                    <td className="py-3 px-4 text-right font-bold text-arena-gold">{entry.total_points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-20 text-arena-muted">
            No season data yet. Start competing to earn season points!
          </div>
        )}
      </main>
    </div>
  );
}
