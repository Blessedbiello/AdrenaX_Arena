'use client';

import type { DuelDetails, Participant } from '../lib/types';
import CountdownTimer from './CountdownTimer';

function shortenPubkey(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function getParticipant(details: DuelDetails, pubkey: string): Participant | undefined {
  return details.participants.find(p => p.user_pubkey === pubkey);
}

export default function DuelBattle({ details }: { details: DuelDetails }) {
  const { duel } = details;
  const challenger = getParticipant(details, duel.challenger_pubkey);
  const defender = duel.defender_pubkey ? getParticipant(details, duel.defender_pubkey) : null;

  const isActive = duel.status === 'active';
  const isCompleted = duel.status === 'completed';

  return (
    <div className="bg-arena-card border border-arena-border rounded-2xl p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold">{duel.asset_symbol} Duel</h2>
          <span className={`text-sm ${duel.is_honor_duel ? 'text-arena-accent' : 'text-arena-gold'}`}>
            {duel.is_honor_duel ? 'Honor Duel' : `${duel.stake_amount} ${duel.stake_token} Staked`}
          </span>
        </div>
        {isActive && details.competition?.end_time && (
          <CountdownTimer
            targetDate={details.competition.end_time}
            label="Time Remaining"
          />
        )}
        {duel.status === 'pending' && (
          <CountdownTimer
            targetDate={duel.expires_at}
            label="Accept Before"
          />
        )}
        {isCompleted && (
          <span className="bg-arena-accent/20 text-arena-accent px-4 py-2 rounded-full text-sm font-bold">
            COMPLETED
          </span>
        )}
      </div>

      {/* Battle area */}
      <div className="flex items-stretch gap-6">
        {/* Challenger */}
        <div className={`flex-1 rounded-xl p-6 text-center ${
          isCompleted && duel.winner_pubkey === duel.challenger_pubkey
            ? 'bg-arena-accent/10 border-2 border-arena-accent'
            : 'bg-arena-bg border border-arena-border'
        }`}>
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-arena-accent to-blue-500 flex items-center justify-center text-3xl mx-auto mb-4">
            ⚔
          </div>
          <div className="text-xs text-arena-muted mb-1">CHALLENGER</div>
          <div className="font-mono font-bold mb-3">{shortenPubkey(duel.challenger_pubkey)}</div>

          {challenger && (
            <div className="space-y-2">
              <div className={`text-3xl font-bold ${
                challenger.roi_percent >= 0 ? 'text-arena-accent' : 'text-arena-red'
              }`}>
                {challenger.roi_percent >= 0 ? '+' : ''}{challenger.roi_percent.toFixed(2)}%
              </div>
              <div className="text-sm text-arena-muted">
                PnL: ${challenger.pnl_usd.toFixed(2)} | Trades: {challenger.positions_closed}
              </div>
            </div>
          )}

          {isCompleted && duel.winner_pubkey === duel.challenger_pubkey && (
            <div className="mt-3 text-arena-gold font-bold">WINNER</div>
          )}
        </div>

        {/* VS */}
        <div className="flex items-center">
          <div className="text-4xl font-black text-arena-gold" style={{ textShadow: '0 0 20px rgba(255,215,0,0.3)' }}>
            VS
          </div>
        </div>

        {/* Defender */}
        <div className={`flex-1 rounded-xl p-6 text-center ${
          isCompleted && duel.winner_pubkey === duel.defender_pubkey
            ? 'bg-arena-accent/10 border-2 border-arena-accent'
            : 'bg-arena-bg border border-arena-border'
        }`}>
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 ${
            defender ? 'bg-gradient-to-br from-arena-red to-pink-500' : 'bg-arena-border'
          }`}>
            {defender ? '🛡' : '?'}
          </div>
          <div className="text-xs text-arena-muted mb-1">DEFENDER</div>
          <div className="font-mono font-bold mb-3">
            {duel.defender_pubkey ? shortenPubkey(duel.defender_pubkey) : 'Awaiting...'}
          </div>

          {defender && (
            <div className="space-y-2">
              <div className={`text-3xl font-bold ${
                defender.roi_percent >= 0 ? 'text-arena-accent' : 'text-arena-red'
              }`}>
                {defender.roi_percent >= 0 ? '+' : ''}{defender.roi_percent.toFixed(2)}%
              </div>
              <div className="text-sm text-arena-muted">
                PnL: ${defender.pnl_usd.toFixed(2)} | Trades: {defender.positions_closed}
              </div>
            </div>
          )}

          {isCompleted && duel.winner_pubkey === duel.defender_pubkey && (
            <div className="mt-3 text-arena-gold font-bold">WINNER</div>
          )}
        </div>
      </div>
    </div>
  );
}
