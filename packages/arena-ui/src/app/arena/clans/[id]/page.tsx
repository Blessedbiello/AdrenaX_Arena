'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWalletAuth } from '../../../../hooks/useWalletAuth';
import { api } from '../../../../lib/api';
import type { Clan, ClanMember } from '../../../../lib/types';

function shortenPubkey(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export default function ClanDetailPage() {
  const params = useParams();
  const clanId = params.id as string;
  const { connected, authenticate, walletAddress } = useWalletAuth();
  const { setVisible } = useWalletModal();
  const [clan, setClan] = useState<Clan | null>(null);
  const [members, setMembers] = useState<ClanMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getClanDetails(clanId).then(data => {
      setClan(data.clan);
      setMembers(data.members);
    }).catch(console.error).finally(() => setLoading(false));
  }, [clanId]);

  const isMember = walletAddress && members.some(m => m.user_pubkey === walletAddress);

  if (loading) return <div className="min-h-screen bg-arena-bg flex items-center justify-center"><div className="text-arena-muted">Loading clan...</div></div>;
  if (!clan) return <div className="min-h-screen bg-arena-bg flex items-center justify-center"><div className="text-arena-muted">Clan not found</div></div>;

  return (
    <div className="min-h-screen bg-arena-bg">
      <header className="border-b border-arena-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/arena/clans" className="text-arena-muted hover:text-arena-text">← Clans</Link>
            <h1 className="text-xl font-bold">{clan.name} <span className="text-arena-accent">[{clan.tag}]</span></h1>
          </div>
          {!isMember ? (
            <button onClick={async () => {
              if (!connected) { setVisible(true); return; }
              try {
                const authed = await authenticate();
                if (!authed) return;
                await api.joinClan(clanId);
                const data = await api.getClanDetails(clanId);
                setClan(data.clan);
                setMembers(data.members);
              } catch (err) { alert(err instanceof Error ? err.message : 'Failed to join'); }
            }} className="bg-arena-accent hover:bg-arena-accent/80 text-arena-bg font-bold px-6 py-2 rounded-lg transition-colors">
              Join Clan
            </button>
          ) : (
            <button onClick={async () => {
              try {
                await api.leaveClan();
                const data = await api.getClanDetails(clanId);
                setClan(data.clan);
                setMembers(data.members);
              } catch (err) { alert(err instanceof Error ? err.message : 'Failed to leave'); }
            }} className="bg-arena-card border border-arena-border text-arena-muted hover:text-arena-text px-6 py-2 rounded-lg transition-colors">
              Leave Clan
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-arena-card border border-arena-border rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-arena-accent">{clan.member_count}</div>
            <div className="text-sm text-arena-muted">Members</div>
          </div>
          <div className="bg-arena-card border border-arena-border rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-arena-gold">{Number(clan.total_war_score).toFixed(1)}</div>
            <div className="text-sm text-arena-muted">War Score</div>
          </div>
          <div className="bg-arena-card border border-arena-border rounded-xl p-4 text-center">
            <div className="text-2xl font-bold">{clan.wars_won}</div>
            <div className="text-sm text-arena-muted">Wars Won</div>
          </div>
          <div className="bg-arena-card border border-arena-border rounded-xl p-4 text-center">
            <div className="text-2xl font-bold">{clan.wars_played}</div>
            <div className="text-sm text-arena-muted">Wars Played</div>
          </div>
        </div>

        <div className="bg-arena-card border border-arena-border rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4">Members ({members.length}/5)</h2>
          <div className="space-y-3">
            {members.map(m => (
              <div key={m.id} className="flex justify-between items-center py-2 border-b border-arena-border last:border-0">
                <div className="font-mono">{shortenPubkey(m.user_pubkey)}</div>
                <span className={`text-sm px-2 py-0.5 rounded ${m.role === 'leader' ? 'bg-arena-gold/20 text-arena-gold' : 'bg-arena-card text-arena-muted'}`}>
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
