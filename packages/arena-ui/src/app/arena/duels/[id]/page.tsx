'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import DuelBattle from '../../../../components/DuelBattle';
import PredictionWidget from '../../../../components/PredictionWidget';
import ChallengeCard from '../../../../components/ChallengeCard';
import { useWalletAuth } from '../../../../hooks/useWalletAuth';
import { api } from '../../../../lib/api';
import type { DuelDetails, UserStreak } from '../../../../lib/types';

export default function DuelPage() {
  const params = useParams();
  const duelId = params.id as string;
  const { connected, authenticate } = useWalletAuth();
  const { setVisible } = useWalletModal();
  const [details, setDetails] = useState<DuelDetails | null>(null);
  const [winnerStreak, setWinnerStreak] = useState<UserStreak | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetails = useCallback(async () => {
    try {
      const data = await api.getDuel(duelId);
      setDetails(data);
      // Fetch winner streak if duel is completed
      if (data.duel.status === 'completed' && data.duel.winner_pubkey) {
        api.getUserStreak(data.duel.winner_pubkey).then(setWinnerStreak).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to load duel:', err);
    } finally {
      setLoading(false);
    }
  }, [duelId]);

  useEffect(() => {
    fetchDetails();
    // Poll for updates on active duels
    const interval = setInterval(fetchDetails, 5000);
    return () => clearInterval(interval);
  }, [fetchDetails]);

  if (loading) {
    return (
      <div className="min-h-screen bg-arena-bg flex items-center justify-center">
        <div className="text-arena-muted">Loading duel...</div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="min-h-screen bg-arena-bg flex items-center justify-center">
        <div className="text-arena-muted">Duel not found</div>
      </div>
    );
  }

  const { duel } = details;
  const isActive = duel.status === 'active';
  const isPending = duel.status === 'pending';

  return (
    <div className="min-h-screen bg-arena-bg">
      <header className="border-b border-arena-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/arena/duels" className="text-arena-muted hover:text-arena-text">← Duels</Link>
            <h1 className="text-xl font-bold">{duel.asset_symbol} Duel</h1>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            isActive ? 'bg-arena-accent/20 text-arena-accent' :
            isPending ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-arena-muted/20 text-arena-muted'
          }`}>
            {duel.status.toUpperCase()}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Battle view */}
        <DuelBattle details={details} />

        {/* Streak badge for winner */}
        {duel.status === 'completed' && duel.winner_pubkey && winnerStreak && winnerStreak.current_streak >= 3 && (
          <div className="bg-arena-card border border-arena-gold/30 rounded-xl p-4 text-center">
            <span className="text-2xl mr-2">
              {winnerStreak.title === 'legendary_duelist' ? '👑' : winnerStreak.title === 'arena_champion' ? '⚔' : '🔥'}
            </span>
            <span className="text-arena-gold font-bold text-lg">
              {winnerStreak.title === 'legendary_duelist' ? 'Legendary Duelist' :
               winnerStreak.title === 'arena_champion' ? 'Arena Champion' : 'Hot Streak'}
            </span>
            <span className="text-arena-muted ml-2">
              ({winnerStreak.current_streak} wins) — {winnerStreak.mutagen_multiplier.toFixed(2)}x Mutagen
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Predictions */}
          {(isActive || duel.status === 'completed') && (
            <PredictionWidget
              duelId={duel.id}
              challengerPubkey={duel.challenger_pubkey}
              defenderPubkey={duel.defender_pubkey}
              isActive={isActive}
            />
          )}

          {/* Share card */}
          <ChallengeCard duel={duel} />
        </div>

        {/* Accept button for pending duels */}
        {isPending && (
          <div className="bg-arena-card border border-arena-accent/50 rounded-xl p-6 text-center">
            <p className="text-arena-muted mb-4">This duel is waiting for the defender to accept.</p>
            <button
              onClick={async () => {
                if (!connected) {
                  setVisible(true);
                  return;
                }
                try {
                  const authed = await authenticate();
                  if (!authed) {
                    alert('Wallet authentication failed. Please try again.');
                    return;
                  }
                  await api.acceptDuel(duel.id);
                  fetchDetails();
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Failed to accept');
                }
              }}
              className="bg-arena-accent hover:bg-arena-accent/80 text-arena-bg font-bold px-8 py-3 rounded-lg transition-colors"
            >
              {connected ? 'Accept Challenge' : 'Connect Wallet to Accept'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
