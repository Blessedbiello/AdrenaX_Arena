'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import { useWalletAuth } from '../../../../hooks/useWalletAuth';
import { api } from '../../../../lib/api';
import type { Clan, ClanMember, ClanWar, EscrowTransactionIntent } from '../../../../lib/types';

function shortenPubkey(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function formatWarLabel(war: ClanWar, clanId: string): string {
  if (war.challenger_clan_id === clanId) return 'Issued';
  if (war.defender_clan_id === clanId) return 'Received';
  return 'War';
}

export default function ClanDetailPage() {
  const params = useParams();
  const clanId = params.id as string;
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { connected, authenticate, walletAddress } = useWalletAuth();
  const { setVisible } = useWalletModal();
  const [clan, setClan] = useState<Clan | null>(null);
  const [members, setMembers] = useState<ClanMember[]>([]);
  const [wars, setWars] = useState<ClanWar[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [warBusyId, setWarBusyId] = useState<string | null>(null);
  const [showChallenge, setShowChallenge] = useState(false);
  const [durationHours, setDurationHours] = useState<24 | 48 | 168>(24);
  const [isHonorWar, setIsHonorWar] = useState(true);
  const [stakeAmount, setStakeAmount] = useState(0);
  const [stakeToken, setStakeToken] = useState<'ADX' | 'USDC'>('ADX');

  async function refreshClan() {
    const [detail, clanWars] = await Promise.all([
      api.getClanDetails(clanId),
      api.getClanWars(clanId),
    ]);
    setClan(detail.clan);
    setMembers(detail.members);
    setWars(clanWars);
  }

  useEffect(() => {
    refreshClan().catch(console.error).finally(() => setLoading(false));
  }, [clanId]);

  async function ensureAuth(): Promise<boolean> {
    if (!connected) {
      setVisible(true);
      return false;
    }
    return authenticate();
  }

  async function sendEscrowIntent(intent: EscrowTransactionIntent): Promise<string> {
    if (!publicKey) {
      throw new Error('WALLET_NOT_CONNECTED');
    }

    const tx = Transaction.from(Buffer.from(intent.serializedTransaction, 'base64'));
    tx.recentBlockhash = intent.recentBlockhash;
    tx.lastValidBlockHeight = intent.lastValidBlockHeight;
    tx.feePayer = publicKey;
    return sendTransaction(tx, connection, { preflightCommitment: 'confirmed' });
  }

  async function handleCreateChallenge() {
    if (!(await ensureAuth())) return;
    setBusy(true);
    try {
      const result = await api.createClanWar({
        opponentClanId: clanId,
        durationHours,
        isHonorWar,
        stakeAmount: isHonorWar ? 0 : stakeAmount,
        stakeToken,
      });
      if (result.escrowAction) {
        const txSignature = await sendEscrowIntent(result.escrowAction);
        await api.confirmClanWarChallengerEscrow(result.war.id, txSignature);
      }
      await refreshClan();
      setShowChallenge(false);
      setDurationHours(24);
      setIsHonorWar(true);
      setStakeAmount(0);
      setStakeToken('ADX');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to challenge clan');
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptWar(war: ClanWar) {
    if (!(await ensureAuth())) return;
    setWarBusyId(war.id);
    try {
      let txSignature: string | undefined;
      if (!war.is_honor_war && Number(war.stake_amount) > 0) {
        const intent = await api.getClanWarDefenderEscrowIntent(war.id);
        txSignature = await sendEscrowIntent(intent);
      }
      await api.acceptClanWar(war.id, txSignature);
      await refreshClan();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to accept war');
    } finally {
      setWarBusyId(null);
    }
  }

  async function handleFundPendingWar(war: ClanWar) {
    if (!(await ensureAuth())) return;
    setWarBusyId(war.id);
    try {
      const intent = await api.getClanWarChallengerEscrowIntent(war.id);
      const txSignature = await sendEscrowIntent(intent);
      await api.confirmClanWarChallengerEscrow(war.id, txSignature);
      await refreshClan();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to fund war escrow');
    } finally {
      setWarBusyId(null);
    }
  }

  const isMember = walletAddress ? members.some((m) => m.user_pubkey === walletAddress) : false;
  const currentMember = walletAddress ? members.find((m) => m.user_pubkey === walletAddress) ?? null : null;
  const isLeader = currentMember?.role === 'leader';

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
          <div className="flex items-center gap-3">
            {!isMember ? (
              <button onClick={async () => {
                if (!(await ensureAuth())) return;
                try {
                  await api.joinClan(clanId);
                  await refreshClan();
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Failed to join');
                }
              }} className="bg-arena-accent hover:bg-arena-accent/80 text-arena-bg font-bold px-6 py-2 rounded-lg transition-colors">
                Join Clan
              </button>
            ) : (
              <button onClick={async () => {
                if (!(await ensureAuth())) return;
                try {
                  await api.leaveClan();
                  await refreshClan();
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Failed to leave');
                }
              }} className="bg-arena-card border border-arena-border text-arena-muted hover:text-arena-text px-6 py-2 rounded-lg transition-colors">
                Leave Clan
              </button>
            )}
            <button
              onClick={() => setShowChallenge((value) => !value)}
              className="bg-arena-card border border-arena-border text-arena-text hover:border-arena-accent/50 px-4 py-2 rounded-lg transition-colors"
            >
              Challenge Clan
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {showChallenge && (
          <div className="bg-arena-card border border-arena-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Issue Clan War</h2>
              <span className="text-sm text-arena-muted">Backend enforces leader and roster rules</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="text-sm text-arena-muted">
                Duration
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value) as 24 | 48 | 168)}
                  className="mt-1 w-full bg-arena-bg border border-arena-border rounded-lg px-4 py-2 text-arena-text"
                >
                  <option value={24}>24 Hours</option>
                  <option value={48}>48 Hours</option>
                  <option value={168}>7 Days</option>
                </select>
              </label>
              <label className="text-sm text-arena-muted">
                Format
                <select
                  value={isHonorWar ? 'honor' : 'staked'}
                  onChange={(e) => setIsHonorWar(e.target.value === 'honor')}
                  className="mt-1 w-full bg-arena-bg border border-arena-border rounded-lg px-4 py-2 text-arena-text"
                >
                  <option value="honor">Honor War</option>
                  <option value="staked">Staked War</option>
                </select>
              </label>
              <label className="text-sm text-arena-muted">
                Stake Token
                <select
                  value={stakeToken}
                  disabled={isHonorWar}
                  onChange={(e) => setStakeToken(e.target.value as 'ADX' | 'USDC')}
                  className="mt-1 w-full bg-arena-bg border border-arena-border rounded-lg px-4 py-2 text-arena-text disabled:opacity-50"
                >
                  <option value="ADX">ADX</option>
                  <option value="USDC">USDC</option>
                </select>
              </label>
            </div>
            {!isHonorWar && (
              <label className="block text-sm text-arena-muted">
                Stake Amount
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(Number(e.target.value))}
                  className="mt-1 w-full bg-arena-bg border border-arena-border rounded-lg px-4 py-2 text-arena-text"
                />
              </label>
            )}
            <button
              onClick={handleCreateChallenge}
              disabled={busy || (!isHonorWar && stakeAmount <= 0)}
              className="w-full bg-arena-accent hover:bg-arena-accent/80 disabled:opacity-50 text-arena-bg font-bold py-3 rounded-lg transition-colors"
            >
              {busy ? 'Submitting Challenge...' : 'Submit Challenge'}
            </button>
          </div>
        )}

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
            {members.map((m) => (
              <div key={m.id} className="flex justify-between items-center py-2 border-b border-arena-border last:border-0">
                <div className="font-mono">{shortenPubkey(m.user_pubkey)}</div>
                <span className={`text-sm px-2 py-0.5 rounded ${m.role === 'leader' ? 'bg-arena-gold/20 text-arena-gold' : 'bg-arena-card text-arena-muted'}`}>
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-arena-card border border-arena-border rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4">Wars</h2>
          {wars.length === 0 ? (
            <div className="text-arena-muted">No clan wars yet.</div>
          ) : (
            <div className="space-y-3">
              {wars.map((war) => {
                const canFund = isLeader && war.challenger_clan_id === clanId && war.status === 'pending' && war.escrow_state === 'awaiting_challenger_deposit';
                const canAccept = walletAddress === clan.leader_pubkey && war.defender_clan_id === clanId && war.status === 'pending' && (!war.is_honor_war ? war.escrow_state === 'awaiting_defender_deposit' : true);
                return (
                  <div key={war.id} className="border border-arena-border rounded-lg p-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <div className="font-semibold">{formatWarLabel(war, clanId)} {war.is_honor_war ? 'Honor War' : 'Staked War'}</div>
                        <div className="text-sm text-arena-muted">
                          {war.duration_hours}h
                          {' · '}
                          {war.status}
                          {' · '}
                          escrow {war.escrow_state}
                          {!war.is_honor_war ? ` · ${Number(war.stake_amount)} ${war.stake_token}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canFund && (
                          <button
                            onClick={() => handleFundPendingWar(war)}
                            disabled={warBusyId === war.id}
                            className="bg-arena-accent hover:bg-arena-accent/80 disabled:opacity-50 text-arena-bg font-bold px-4 py-2 rounded-lg transition-colors"
                          >
                            {warBusyId === war.id ? 'Funding...' : 'Fund Stake'}
                          </button>
                        )}
                        {canAccept && (
                          <button
                            onClick={() => handleAcceptWar(war)}
                            disabled={warBusyId === war.id}
                            className="bg-arena-accent hover:bg-arena-accent/80 disabled:opacity-50 text-arena-bg font-bold px-4 py-2 rounded-lg transition-colors"
                          >
                            {warBusyId === war.id ? 'Accepting...' : 'Accept War'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
