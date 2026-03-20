'use client';

import type { Duel } from '../lib/types';
import { api } from '../lib/api';

function shortenPubkey(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export default function ChallengeCard({ duel }: { duel: Duel }) {
  const stakeDisplay = duel.is_honor_duel
    ? 'Honor Duel'
    : `${duel.stake_amount} ${duel.stake_token}`;

  const shareText = `I just challenged ${
    duel.defender_pubkey ? shortenPubkey(duel.defender_pubkey) : 'someone'
  } to a ${duel.asset_symbol} trading duel on AdrenaX Arena! ${stakeDisplay} | ${duel.duration_hours}h`;

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/arena/challenge/${duel.id}`
    : '';

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="bg-gradient-to-br from-arena-card to-arena-bg border border-arena-border rounded-2xl overflow-hidden">
      {/* Card image preview */}
      <div className="relative aspect-[1200/630] bg-arena-bg">
        <img
          src={api.getChallengeCardUrl(duel.id)}
          alt="Challenge Card"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Actions */}
      <div className="p-5 space-y-3">
        <div className="flex gap-3">
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white text-center py-3 rounded-lg font-bold transition-colors"
          >
            Share on Twitter
          </a>
          <button
            onClick={() => {
              navigator.clipboard.writeText(shareUrl);
            }}
            className="px-4 bg-arena-border hover:bg-arena-muted/30 rounded-lg transition-colors"
          >
            Copy Link
          </button>
        </div>
      </div>
    </div>
  );
}
