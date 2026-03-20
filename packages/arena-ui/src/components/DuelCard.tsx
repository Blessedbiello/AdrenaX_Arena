'use client';

import Link from 'next/link';
import type { Duel } from '../lib/types';
import CountdownTimer from './CountdownTimer';

function shortenPubkey(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'pending': return 'text-yellow-400';
    case 'active': return 'text-arena-accent';
    case 'completed': return 'text-blue-400';
    case 'expired': case 'cancelled': return 'text-arena-muted';
    default: return 'text-arena-text';
  }
}

export default function DuelCard({ duel }: { duel: Duel }) {
  const stakeDisplay = duel.is_honor_duel
    ? 'Honor Duel'
    : `${duel.stake_amount} ${duel.stake_token}`;

  return (
    <Link href={`/arena/duels/${duel.id}`}>
      <div className="bg-arena-card border border-arena-border rounded-xl p-5 hover:border-arena-accent/50 transition-colors cursor-pointer">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{duel.asset_symbol}</span>
            <span className={`text-sm ${statusColor(duel.status)} uppercase font-medium`}>
              {duel.status}
            </span>
          </div>
          <span className="text-sm text-arena-muted">{duel.duration_hours}h</span>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="text-center">
            <div className="text-xs text-arena-muted mb-1">Challenger</div>
            <div className="font-mono text-sm">{shortenPubkey(duel.challenger_pubkey)}</div>
            {duel.challenger_roi != null && (
              <div className={`text-sm font-bold mt-1 ${duel.challenger_roi >= 0 ? 'text-arena-accent' : 'text-arena-red'}`}>
                {duel.challenger_roi >= 0 ? '+' : ''}{duel.challenger_roi.toFixed(2)}%
              </div>
            )}
          </div>

          <div className="text-arena-gold font-bold text-xl">VS</div>

          <div className="text-center">
            <div className="text-xs text-arena-muted mb-1">Defender</div>
            <div className="font-mono text-sm">
              {duel.defender_pubkey ? shortenPubkey(duel.defender_pubkey) : 'Awaiting...'}
            </div>
            {duel.defender_roi != null && (
              <div className={`text-sm font-bold mt-1 ${duel.defender_roi >= 0 ? 'text-arena-accent' : 'text-arena-red'}`}>
                {duel.defender_roi >= 0 ? '+' : ''}{duel.defender_roi.toFixed(2)}%
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center pt-3 border-t border-arena-border">
          <span className={`text-sm ${duel.is_honor_duel ? 'text-arena-accent' : 'text-arena-gold'}`}>
            {stakeDisplay}
          </span>
          {duel.status === 'active' && (
            <CountdownTimer targetDate={duel.expires_at} />
          )}
          {duel.winner_pubkey && (
            <span className="text-arena-gold text-sm font-bold">
              Winner: {shortenPubkey(duel.winner_pubkey)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
