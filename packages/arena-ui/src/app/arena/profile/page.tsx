'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { useWalletAuth } from '../../../hooks/useWalletAuth';
import { api } from '../../../lib/api';
import AssetIcon from '../../../components/AssetIcon';
import type { UserProfile, UserStreak, Duel } from '../../../lib/types';

function shortenPubkey(key: string): string {
  return key.slice(0, 4) + '...' + key.slice(-4);
}

function getStreakIcon(type: string): string {
  switch (type) {
    case 'hot_streak': return '\uD83D\uDD25';
    case 'arena_champion': return '\u2694';
    case 'legendary_duelist': return '\uD83D\uDC51';
    default: return '\uD83D\uDD25';
  }
}

function getStreakGradient(title: string | null): string {
  if (!title) return '';
  if (title === 'legendary_duelist') return 'from-arena-gold via-yellow-600 to-amber-500';
  if (title === 'arena_champion') return 'from-purple-500 via-indigo-500 to-blue-500';
  return 'from-orange-500 via-red-500 to-pink-500';
}

function formatStreakTitle(title: string | null): string {
  if (!title) return '';
  return title
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function duelResult(duel: Duel, wallet: string): 'win' | 'loss' | 'pending' {
  if (duel.status !== 'completed' || !duel.winner_pubkey) return 'pending';
  return duel.winner_pubkey === wallet ? 'win' : 'loss';
}

function duelROI(duel: Duel, wallet: string): number | null {
  if (duel.challenger_pubkey === wallet) return duel.challenger_roi;
  if (duel.defender_pubkey === wallet) return duel.defender_roi;
  return null;
}

function duelOpponent(duel: Duel, wallet: string): string {
  if (duel.challenger_pubkey === wallet) {
    return duel.defender_pubkey ? shortenPubkey(duel.defender_pubkey) : 'Open';
  }
  return shortenPubkey(duel.challenger_pubkey);
}

export default function ProfilePage() {
  const { walletAddress, connected } = useWalletAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [streak, setStreak] = useState<UserStreak | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setProfile(null);
      setStreak(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      api.getUserProfile(walletAddress),
      api.getUserStreak(walletAddress),
    ])
      .then(([profileData, streakData]) => {
        if (!cancelled) {
          setProfile(profileData);
          setStreak(streakData);
        }
      })
      .catch((err) => {
        console.error('Failed to load profile:', err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load profile');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [walletAddress]);

  if (!connected || !walletAddress) {
    return (
      <div className="min-h-screen bg-arena-bg">
        <header className="border-b border-arena-border">
          <div className="max-w-5xl mx-auto px-6 py-4">
            <Link href="/arena" className="text-arena-muted hover:text-arena-text">
              &larr; Arena
            </Link>
          </div>
        </header>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-arena-muted text-lg">
            Connect your wallet to view your Arena profile
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-arena-bg">
      <header className="border-b border-arena-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/arena" className="text-arena-muted hover:text-arena-text">
            &larr; Arena
          </Link>
          <h1 className="text-xl font-bold text-arena-text">Profile</h1>
          <span className="ml-auto font-mono text-arena-muted text-sm">
            {shortenPubkey(walletAddress)}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {loading && (
          <div className="text-center py-20 text-arena-muted">Loading profile...</div>
        )}

        {error && (
          <div className="text-center py-20 text-arena-red">{error}</div>
        )}

        {profile && streak && (
          <>
            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-arena-card border border-arena-border rounded-xl p-5 text-center">
                <div className="text-3xl font-bold text-arena-text">{profile.duels.total}</div>
                <div className="text-sm text-arena-muted mt-1">Played</div>
              </div>
              <div className="bg-arena-card border border-arena-border rounded-xl p-5 text-center">
                <div className="text-3xl font-bold text-arena-text">
                  {profile.duels.winRate.toFixed(1)}%
                </div>
                <div className="text-sm text-arena-muted mt-1">Win Rate</div>
              </div>
              <div className="bg-arena-card border border-arena-border rounded-xl p-5 text-center">
                <div className="text-3xl font-bold text-arena-text">
                  {streak.current_streak}
                </div>
                <div className="text-sm text-arena-muted mt-1">
                  {streak.streak_type !== 'none'
                    ? `${getStreakIcon(streak.streak_type === 'win' ? 'hot_streak' : '')} Current Streak`
                    : 'Current Streak'}
                </div>
              </div>
              <div className="bg-arena-card border border-arena-border rounded-xl p-5 text-center">
                <div className="text-3xl font-bold text-arena-text">{streak.best_streak}</div>
                <div className="text-sm text-arena-muted mt-1">Personal Best</div>
              </div>
            </div>

            {/* Streak title banner */}
            {streak.title && (
              <div className={`bg-gradient-to-r ${getStreakGradient(streak.title)} rounded-xl p-4 text-center`}>
                <span className="text-lg font-bold text-white">
                  {getStreakIcon(streak.title)} {formatStreakTitle(streak.title)}
                </span>
              </div>
            )}

            {/* Mutagen multiplier */}
            {streak.mutagen_multiplier > 1 && (
              <div className="text-center">
                <span className="text-arena-accent font-bold text-lg">
                  {streak.mutagen_multiplier.toFixed(2)}x Mutagen Bonus
                </span>
              </div>
            )}

            {/* Recent duels */}
            <div>
              <h2 className="text-lg font-bold text-arena-text mb-4">Recent Duels</h2>
              {profile.recentDuels.length === 0 ? (
                <div className="bg-arena-card border border-arena-border rounded-xl p-8 text-center text-arena-muted">
                  No duels yet. Head to the arena and challenge someone!
                </div>
              ) : (
                <div className="space-y-3">
                  {profile.recentDuels.slice(0, 10).map((duel) => {
                    const result = duelResult(duel, walletAddress);
                    const roi = duelROI(duel, walletAddress);
                    const opponent = duelOpponent(duel, walletAddress);

                    return (
                      <Link
                        key={duel.id}
                        href={`/arena/duels/${duel.id}`}
                        className="block bg-arena-card border border-arena-border rounded-xl p-4 hover:border-arena-accent/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <AssetIcon symbol={duel.asset_symbol} className="text-xl" />
                            <div>
                              <span className="font-medium text-arena-text">
                                {duel.asset_symbol}
                              </span>
                              <span className="text-arena-muted ml-2 text-sm">
                                vs {opponent}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {roi !== null && (
                              <span className={`font-mono text-sm ${
                                roi >= 0 ? 'text-arena-accent' : 'text-arena-red'
                              }`}>
                                {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
                              </span>
                            )}
                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                              result === 'win'
                                ? 'bg-arena-accent/20 text-arena-accent'
                                : result === 'loss'
                                  ? 'bg-arena-red/20 text-arena-red'
                                  : 'bg-arena-muted/20 text-arena-muted'
                            }`}>
                              {result}
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
