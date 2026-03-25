'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, Transaction } from '@solana/web3.js';
import DuelCard from '../../../components/DuelCard';
import ChallengeCard from '../../../components/ChallengeCard';
import { useWalletAuth } from '../../../hooks/useWalletAuth';
import { api } from '../../../lib/api';
import type { Duel, EscrowTransactionIntent } from '../../../lib/types';

const ASSETS = ['SOL', 'BTC', 'ETH', 'BONK', 'JTO', 'JITOSOL', 'ANY'] as const;

export default function DuelsPageClient() {
  const searchParams = useSearchParams();
  const { connected, authenticate, authenticating } = useWalletAuth();
  const { setVisible } = useWalletModal();
  const { sendTransaction } = useWallet();
  const [duels, setDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createdDuel, setCreatedDuel] = useState<Duel | null>(null);

  const [isOpenChallenge, setIsOpenChallenge] = useState(false);
  const [defenderPubkey, setDefenderPubkey] = useState('');
  const [assetSymbol, setAssetSymbol] = useState<string>('SOL');
  const [durationHours, setDurationHours] = useState<24 | 48>(24);
  const [isHonorDuel, setIsHonorDuel] = useState(true);
  const [stakeAmount, setStakeAmount] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setFilter(searchParams.get('status') || '');
    setShowCreate(searchParams.get('create') === 'true');
  }, [searchParams]);

  useEffect(() => {
    void loadDuels();
  }, [filter]);

  async function sendEscrowIntent(intent: EscrowTransactionIntent): Promise<string> {
    const connection = new Connection(intent.rpcUrl, 'confirmed');
    const tx = Transaction.from(Uint8Array.from(atob(intent.serializedTransaction), (char) => char.charCodeAt(0)));
    const signature = await sendTransaction(tx, connection);
    await connection.confirmTransaction({
      signature,
      blockhash: intent.recentBlockhash,
      lastValidBlockHeight: intent.lastValidBlockHeight,
    }, 'confirmed');
    return signature;
  }

  async function loadDuels() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filter) params.status = filter;
      const data = await api.listDuels(params);
      setDuels(data);
    } catch (err) {
      console.error('Failed to load duels:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!isOpenChallenge && !defenderPubkey) return;

    if (!connected) {
      setVisible(true);
      return;
    }

    setCreating(true);
    try {
      const authed = await authenticate();
      if (!authed) {
        alert('Wallet authentication failed. Please try again.');
        return;
      }

      const result = await api.createDuel({
        defenderPubkey: isOpenChallenge ? undefined : defenderPubkey,
        assetSymbol,
        durationHours,
        isHonorDuel,
        stakeAmount: isHonorDuel ? 0 : stakeAmount,
      });
      if (result.escrowAction) {
        const txSignature = await sendEscrowIntent(result.escrowAction);
        const fundedDuel = await api.confirmChallengerEscrow(result.duel.id, txSignature);
        setCreatedDuel(fundedDuel);
      } else {
        setCreatedDuel(result.duel);
        if (!isHonorDuel) {
          alert('Duel created, but the escrow funding transaction could not be prepared automatically. Open the duel page and fund the challenger stake there.');
        }
      }
      await loadDuels();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create duel');
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
            <h1 className="text-xl font-bold">Duels</h1>
          </div>
          <button
            onClick={() => { setShowCreate(!showCreate); setCreatedDuel(null); }}
            className="bg-arena-accent hover:bg-arena-accent/80 text-arena-bg font-bold px-6 py-2 rounded-lg transition-colors"
          >
            {showCreate ? 'Close' : 'Challenge Someone'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {showCreate && !createdDuel && (
          <div className="bg-arena-card border border-arena-border rounded-2xl p-6 mb-8">
            <h2 className="text-lg font-bold mb-4">Create a Challenge</h2>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setIsOpenChallenge(false)}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  !isOpenChallenge
                    ? 'border-arena-accent bg-arena-accent/10 text-arena-accent'
                    : 'border-arena-border text-arena-muted hover:border-arena-accent/50'
                }`}
              >
                Direct Challenge
              </button>
              <button
                onClick={() => setIsOpenChallenge(true)}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  isOpenChallenge
                    ? 'border-arena-accent bg-arena-accent/10 text-arena-accent'
                    : 'border-arena-border text-arena-muted hover:border-arena-accent/50'
                }`}
              >
                Open Challenge
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!isOpenChallenge && (
                <div>
                  <label className="block text-sm text-arena-muted mb-1">Opponent Wallet</label>
                  <input
                    type="text"
                    value={defenderPubkey}
                    onChange={e => setDefenderPubkey(e.target.value)}
                    placeholder="Paste Solana wallet address"
                    className="w-full bg-arena-bg border border-arena-border rounded-lg px-4 py-2 text-arena-text focus:border-arena-accent outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm text-arena-muted mb-1">Asset</label>
                <select
                  value={assetSymbol}
                  onChange={e => setAssetSymbol(e.target.value)}
                  className="w-full bg-arena-bg border border-arena-border rounded-lg px-4 py-2 text-arena-text focus:border-arena-accent outline-none"
                >
                  {ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-arena-muted mb-1">Duration</label>
                <div className="flex gap-2">
                  {([24, 48] as const).map(h => (
                    <button
                      key={h}
                      onClick={() => setDurationHours(h)}
                      className={`flex-1 py-2 rounded-lg border transition-colors ${
                        durationHours === h
                          ? 'border-arena-accent bg-arena-accent/10 text-arena-accent'
                          : 'border-arena-border text-arena-muted hover:border-arena-accent/50'
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-arena-muted mb-1">Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsHonorDuel(true)}
                    className={`flex-1 py-2 rounded-lg border transition-colors ${
                      isHonorDuel
                        ? 'border-arena-accent bg-arena-accent/10 text-arena-accent'
                        : 'border-arena-border text-arena-muted hover:border-arena-accent/50'
                    }`}
                  >
                    Honor Duel
                  </button>
                  <button
                    onClick={() => setIsHonorDuel(false)}
                    className={`flex-1 py-2 rounded-lg border transition-colors ${
                      !isHonorDuel
                        ? 'border-arena-gold bg-arena-gold/10 text-arena-gold'
                        : 'border-arena-border text-arena-muted hover:border-arena-gold/50'
                    }`}
                  >
                    Staked
                  </button>
                </div>
              </div>
              {!isHonorDuel && (
                <div>
                  <label className="block text-sm text-arena-muted mb-1">Stake Amount (ADX)</label>
                  <input
                    type="number"
                    value={stakeAmount}
                    onChange={e => setStakeAmount(Number(e.target.value))}
                    min={0}
                    className="w-full bg-arena-bg border border-arena-border rounded-lg px-4 py-2 text-arena-text focus:border-arena-accent outline-none"
                  />
                </div>
              )}
            </div>
            <button
              onClick={handleCreate}
              disabled={(!isOpenChallenge && !defenderPubkey) || creating || authenticating}
              className="mt-4 w-full bg-arena-accent hover:bg-arena-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-arena-bg font-bold py-3 rounded-lg transition-colors"
            >
              {!connected ? 'Connect Wallet to Challenge' : authenticating ? 'Signing...' : creating ? 'Creating...' : 'Send Challenge'}
            </button>
          </div>
        )}

        {createdDuel && (
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-4">Challenge Created</h2>
            <ChallengeCard duel={createdDuel} />
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">Live Challenges</h2>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="bg-arena-card border border-arena-border rounded-lg px-4 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="pending">Open Challenges</option>
            <option value="active">Active Duels</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-20 text-arena-muted">Loading duels...</div>
        ) : duels.length === 0 ? (
          <div className="text-center py-20 text-arena-muted">No duels found.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {duels.map(duel => (
              <DuelCard key={duel.id} duel={duel} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
