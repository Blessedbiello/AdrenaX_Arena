'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWalletAuth } from '../../../hooks/useWalletAuth';
import { api } from '../../../lib/api';
import type { Clan } from '../../../lib/types';

export default function ClansPage() {
  const { connected, authenticate } = useWalletAuth();
  const { setVisible } = useWalletModal();
  const [clans, setClans] = useState<Clan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.getClanRankings().then(setClans).catch(console.error).finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!connected) { setVisible(true); return; }
    setCreating(true);
    try {
      const authed = await authenticate();
      if (!authed) { alert('Auth failed'); return; }
      await api.createClan(name, tag);
      const updated = await api.getClanRankings();
      setClans(updated);
      setShowCreate(false);
      setName('');
      setTag('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create clan');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-arena-bg">
      <header className="border-b border-arena-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/arena" className="text-arena-muted hover:text-arena-text">← Arena</Link>
            <h1 className="text-xl font-bold">Clans</h1>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-arena-accent hover:bg-arena-accent/80 text-arena-bg font-bold px-6 py-2 rounded-lg transition-colors"
          >
            {showCreate ? 'Close' : 'Create Clan'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {showCreate && (
          <div className="bg-arena-card border border-arena-border rounded-2xl p-6 mb-8">
            <h2 className="text-lg font-bold mb-4">Create a Clan</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-arena-muted mb-1">Clan Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alpha Traders"
                  className="w-full bg-arena-bg border border-arena-border rounded-lg px-4 py-2 text-arena-text focus:border-arena-accent outline-none" />
              </div>
              <div>
                <label className="block text-sm text-arena-muted mb-1">Tag (2-5 chars)</label>
                <input type="text" value={tag} onChange={e => setTag(e.target.value.toUpperCase())} placeholder="e.g. ALPHA" maxLength={5}
                  className="w-full bg-arena-bg border border-arena-border rounded-lg px-4 py-2 text-arena-text focus:border-arena-accent outline-none" />
              </div>
            </div>
            <button onClick={handleCreate} disabled={!name || !tag || creating}
              className="mt-4 w-full bg-arena-accent hover:bg-arena-accent/80 disabled:opacity-50 text-arena-bg font-bold py-3 rounded-lg transition-colors">
              {creating ? 'Creating...' : 'Create Clan'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-arena-muted">Loading clans...</div>
        ) : clans.length > 0 ? (
          <div className="space-y-3">
            {clans.map((clan, i) => (
              <Link key={clan.id} href={`/arena/clans/${clan.id}`}>
                <div className="bg-arena-card border border-arena-border rounded-xl p-5 hover:border-arena-accent/50 transition-colors flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold text-arena-muted w-8">#{i + 1}</span>
                    <div>
                      <div className="font-bold text-lg">{clan.name} <span className="text-arena-accent text-sm">[{clan.tag}]</span></div>
                      <div className="text-sm text-arena-muted">{clan.member_count} members</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-arena-gold font-bold">{Number(clan.total_war_score).toFixed(1)} pts</div>
                    <div className="text-sm text-arena-muted">{clan.wars_won}W / {clan.wars_played}P</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-arena-muted">No clans yet. Be the first to create one!</div>
        )}
      </main>
    </div>
  );
}
