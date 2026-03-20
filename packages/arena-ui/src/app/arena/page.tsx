'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DuelCard from '../../components/DuelCard';
import { api } from '../../lib/api';
import type { Duel, Competition } from '../../lib/types';

export default function ArenaHub() {
  const [activeDuels, setActiveDuels] = useState<Duel[]>([]);
  const [recentDuels, setRecentDuels] = useState<Duel[]>([]);
  const [gauntlets, setGauntlets] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [active, recent, comps] = await Promise.all([
          api.listDuels({ status: 'active', limit: 6 }),
          api.listDuels({ status: 'completed', limit: 6 }),
          api.listCompetitions({ mode: 'gauntlet', status: 'active' }),
        ]);
        setActiveDuels(active);
        setRecentDuels(recent);
        setGauntlets(comps);
      } catch (err) {
        console.error('Failed to load arena data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen bg-arena-bg">
      {/* Header */}
      <header className="border-b border-arena-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              <span className="text-arena-accent">AdrenaX</span> Arena
            </h1>
            <p className="text-sm text-arena-muted">Peer-to-peer trading duels on Solana</p>
          </div>
          <nav className="flex gap-4 items-center">
            <Link href="/arena/duels" className="text-arena-muted hover:text-arena-text transition-colors">
              Duels
            </Link>
            <Link href="/arena" className="text-arena-muted hover:text-arena-text transition-colors">
              Gauntlet
            </Link>
            <button className="bg-arena-accent hover:bg-arena-accent/80 text-arena-bg font-bold px-4 py-2 rounded-lg transition-colors">
              Connect Wallet
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero CTA */}
        <div className="bg-gradient-to-r from-arena-accent/10 to-arena-card border border-arena-accent/30 rounded-2xl p-8 mb-10">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-black mb-2">Challenge Anyone to a Trade-Off</h2>
              <p className="text-arena-muted max-w-lg">
                Pick an opponent, choose an asset, set the stakes. The trader with the higher ROI wins.
                No perp DEX has ever done this.
              </p>
            </div>
            <Link
              href="/arena/duels?create=true"
              className="bg-arena-accent hover:bg-arena-accent/80 text-arena-bg font-bold px-8 py-4 rounded-xl text-lg transition-colors whitespace-nowrap"
            >
              Challenge Someone
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-arena-muted">Loading arena data...</div>
        ) : (
          <>
            {/* Active Duels */}
            <section className="mb-10">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Live Duels</h2>
                <Link href="/arena/duels?status=active" className="text-arena-accent text-sm hover:underline">
                  View all
                </Link>
              </div>
              {activeDuels.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeDuels.map(duel => (
                    <DuelCard key={duel.id} duel={duel} />
                  ))}
                </div>
              ) : (
                <div className="bg-arena-card border border-arena-border rounded-xl p-8 text-center text-arena-muted">
                  No active duels. Be the first to challenge someone!
                </div>
              )}
            </section>

            {/* Active Gauntlets */}
            {gauntlets.length > 0 && (
              <section className="mb-10">
                <h2 className="text-xl font-bold mb-4">Active Gauntlets</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {gauntlets.map(comp => (
                    <Link key={comp.id} href={`/arena/gauntlet/${comp.id}`}>
                      <div className="bg-arena-card border border-arena-border rounded-xl p-5 hover:border-arena-accent/50 transition-colors">
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="font-bold">{(comp.config as any).name || 'The Gauntlet'}</h3>
                            <p className="text-sm text-arena-muted">{comp.status}</p>
                          </div>
                          <span className="text-arena-accent font-bold">Enter</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Recent Duels */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Recent Results</h2>
                <Link href="/arena/duels?status=completed" className="text-arena-accent text-sm hover:underline">
                  View all
                </Link>
              </div>
              {recentDuels.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recentDuels.map(duel => (
                    <DuelCard key={duel.id} duel={duel} />
                  ))}
                </div>
              ) : (
                <div className="bg-arena-card border border-arena-border rounded-xl p-8 text-center text-arena-muted">
                  No completed duels yet.
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
