'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import LiveLeaderboard from '../../../../components/LiveLeaderboard';
import CountdownTimer from '../../../../components/CountdownTimer';
import { api } from '../../../../lib/api';
import type { Competition } from '../../../../lib/types';

export default function GauntletPage() {
  const params = useParams();
  const competitionId = params.id as string;
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getCompetition(competitionId);
        setCompetition(data.competition);
      } catch (err) {
        console.error('Failed to load gauntlet:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [competitionId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-arena-bg flex items-center justify-center">
        <div className="text-arena-muted">Loading gauntlet...</div>
      </div>
    );
  }

  if (!competition) {
    return (
      <div className="min-h-screen bg-arena-bg flex items-center justify-center">
        <div className="text-arena-muted">Gauntlet not found</div>
      </div>
    );
  }

  const config = competition.config as any;
  const isActive = competition.status === 'active';
  const isRegistration = competition.status === 'registration';

  return (
    <div className="min-h-screen bg-arena-bg">
      <header className="border-b border-arena-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/arena" className="text-arena-muted hover:text-arena-text">← Arena</Link>
            <h1 className="text-xl font-bold">{config?.name || 'The Gauntlet'}</h1>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            isActive ? 'bg-arena-accent/20 text-arena-accent' :
            isRegistration ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-arena-muted/20 text-arena-muted'
          }`}>
            {competition.status.toUpperCase()}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Info banner */}
        <div className="bg-arena-card border border-arena-border rounded-xl p-6 flex justify-between items-center">
          <div>
            <div className="text-sm text-arena-muted">
              {config?.maxParticipants || 16} max participants | {config?.durationHours || 24}h duration
            </div>
            <div className="text-sm text-arena-muted mt-1">
              Round {competition.current_round} of {competition.total_rounds}
            </div>
          </div>
          {isActive && (
            <CountdownTimer targetDate={competition.end_time} label="Ends in" />
          )}
          {isRegistration && (
            <button
              onClick={async () => {
                try {
                  await api.registerForGauntlet(competitionId);
                  alert('Registered!');
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Registration failed');
                }
              }}
              className="bg-arena-accent hover:bg-arena-accent/80 text-arena-bg font-bold px-6 py-2 rounded-lg transition-colors"
            >
              Register
            </button>
          )}
        </div>

        {/* Live Leaderboard */}
        <LiveLeaderboard competitionId={competitionId} />
      </main>
    </div>
  );
}
