'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { api } from '../../../lib/api';

type Period = 'weekly' | 'monthly' | 'all';

interface LeaderboardRow {
  rank: number;
  wallet: string;
  wins: number;
  losses: number;
  winRate: number;
  totalROI: number;
  duelsPlayed: number;
}

function shortenPubkey(key: string): string {
  return key.slice(0, 4) + '...' + key.slice(-4);
}

const TABS: { label: string; value: Period }[] = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'All Time', value: 'all' },
];

function getRankStyle(rank: number): string {
  if (rank === 1) return 'border-l-4 border-l-[#ffd700] bg-[#ffd700]/5';
  if (rank === 2) return 'border-l-4 border-l-[#c0c0c0] bg-[#c0c0c0]/5';
  if (rank === 3) return 'border-l-4 border-l-[#cd7f32] bg-[#cd7f32]/5';
  return '';
}

function getRankBadge(rank: number): string {
  if (rank === 1) return '\uD83E\uDD47';
  if (rank === 2) return '\uD83E\uDD48';
  if (rank === 3) return '\uD83E\uDD49';
  return String(rank);
}

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>('weekly');
  const [entries, setEntries] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getLeaderboard(period)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err) => {
        console.error('Failed to load leaderboard:', err);
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [period]);

  return (
    <div className="min-h-screen bg-arena-bg">
      <header className="border-b border-arena-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/arena" className="text-arena-muted hover:text-arena-text">
              &larr; Arena
            </Link>
            <h1 className="text-xl font-bold text-arena-text">Arena Leaderboard</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Period tabs */}
        <div className="flex gap-2 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setPeriod(tab.value)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === tab.value
                  ? 'bg-arena-accent text-arena-bg'
                  : 'bg-arena-card text-arena-muted border border-arena-border hover:text-arena-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-arena-card border border-arena-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="text-center py-20 text-arena-muted">Loading leaderboard...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-20 text-arena-muted">
              No completed duels yet. Be the first to challenge someone!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-arena-border text-arena-muted text-sm">
                    <th className="px-4 py-3 font-medium">Rank</th>
                    <th className="px-4 py-3 font-medium">Wallet</th>
                    <th className="px-4 py-3 font-medium text-right">Wins</th>
                    <th className="px-4 py-3 font-medium text-right">Losses</th>
                    <th className="px-4 py-3 font-medium text-right">Win Rate (%)</th>
                    <th className="px-4 py-3 font-medium text-right">Total ROI (%)</th>
                    <th className="px-4 py-3 font-medium text-right">Duels</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.wallet}
                      className={`border-b border-arena-border/50 last:border-b-0 hover:bg-arena-bg/50 transition-colors ${getRankStyle(entry.rank)}`}
                    >
                      <td className="px-4 py-3 text-lg font-bold">
                        {getRankBadge(entry.rank)}
                      </td>
                      <td className="px-4 py-3 font-mono text-arena-text">
                        {shortenPubkey(entry.wallet)}
                      </td>
                      <td className="px-4 py-3 text-right text-arena-accent font-medium">
                        {entry.wins}
                      </td>
                      <td className="px-4 py-3 text-right text-arena-red font-medium">
                        {entry.losses}
                      </td>
                      <td className="px-4 py-3 text-right text-arena-text">
                        {entry.winRate.toFixed(1)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${
                        entry.totalROI >= 0 ? 'text-arena-accent' : 'text-arena-red'
                      }`}>
                        {entry.totalROI >= 0 ? '+' : ''}{entry.totalROI.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-right text-arena-muted">
                        {entry.duelsPlayed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
