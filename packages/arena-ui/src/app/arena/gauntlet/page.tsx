'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import type { Competition } from '../../../lib/types';
import CountdownTimer from '../../../components/CountdownTimer';

export default function GauntletListPage() {
  const [gauntlets, setGauntlets] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listCompetitions({ mode: 'gauntlet' })
      .then(setGauntlets)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-arena-bg">
      <header className="border-b border-arena-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/arena" className="text-arena-muted hover:text-arena-text">← Arena</Link>
            <h1 className="text-xl font-bold">The Gauntlet</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-gradient-to-r from-red-500/10 to-arena-card border border-red-500/30 rounded-2xl p-8 mb-8">
          <h2 className="text-2xl font-black mb-2">Progressive Elimination Tournament</h2>
          <p className="text-arena-muted max-w-lg">
            Multi-round gauntlet where the bottom 50% are eliminated each round.
            Only the strongest traders survive to claim the top prizes.
          </p>
          <div className="flex gap-6 mt-4 text-sm">
            <div><span className="text-arena-accent font-bold">64-128</span> <span className="text-arena-muted">players</span></div>
            <div><span className="text-arena-accent font-bold">3-5</span> <span className="text-arena-muted">rounds</span></div>
            <div><span className="text-arena-accent font-bold">4-component</span> <span className="text-arena-muted">Arena Score</span></div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-arena-muted">Loading gauntlets...</div>
        ) : gauntlets.length > 0 ? (
          <div className="space-y-4">
            {gauntlets.map(comp => {
              const config = comp.config as any;
              return (
                <Link key={comp.id} href={`/arena/gauntlet/${comp.id}`}>
                  <div className="bg-arena-card border border-arena-border rounded-xl p-5 hover:border-arena-accent/50 transition-colors">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-lg">{config?.name || 'The Gauntlet'}</h3>
                        <p className="text-sm text-arena-muted">
                          {config?.rounds || 1} rounds · {config?.maxParticipants || 128} max participants
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          comp.status === 'active' ? 'bg-arena-accent/20 text-arena-accent' :
                          comp.status === 'registration' ? 'bg-yellow-500/20 text-yellow-400' :
                          comp.status === 'completed' ? 'bg-blue-400/20 text-blue-400' :
                          'bg-arena-muted/20 text-arena-muted'
                        }`}>
                          {comp.status.toUpperCase()}
                        </span>
                        {comp.status === 'active' && (
                          <div className="mt-2">
                            <CountdownTimer targetDate={comp.end_time} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 text-arena-muted">
            No gauntlets yet. Check back soon!
          </div>
        )}
      </main>
    </div>
  );
}
