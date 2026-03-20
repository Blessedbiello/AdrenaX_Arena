'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { PredictionStats } from '../lib/types';

function shortenPubkey(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export default function PredictionWidget({
  duelId,
  challengerPubkey,
  defenderPubkey,
  isActive,
}: {
  duelId: string;
  challengerPubkey: string;
  defenderPubkey: string | null;
  isActive: boolean;
}) {
  const [stats, setStats] = useState<PredictionStats | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getPredictionStats(duelId);
      setStats(data);
    } catch {}
  }, [duelId]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handlePredict = async (winner: string) => {
    setSelectedWinner(winner);
    try {
      await api.submitPrediction(duelId, winner);
      setSubmitted(true);
      fetchStats();
    } catch (err) {
      setSelectedWinner(null);
    }
  };

  if (!defenderPubkey) return null;

  const total = stats?.total || 0;
  const challengerPct = total > 0 ? ((stats?.challenger.votes || 0) / total) * 100 : 50;
  const defenderPct = total > 0 ? ((stats?.defender.votes || 0) / total) * 100 : 50;

  return (
    <div className="bg-arena-card border border-arena-border rounded-xl p-5">
      <h3 className="font-bold mb-4">Who will win?</h3>

      <div className="space-y-3">
        {/* Challenger prediction */}
        <button
          onClick={() => isActive && !submitted && handlePredict(challengerPubkey)}
          disabled={!isActive || submitted}
          className={`w-full relative overflow-hidden rounded-lg p-3 border transition-colors ${
            selectedWinner === challengerPubkey
              ? 'border-arena-accent bg-arena-accent/10'
              : 'border-arena-border hover:border-arena-accent/50'
          } ${!isActive || submitted ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className="absolute left-0 top-0 bottom-0 bg-arena-accent/10 transition-all"
            style={{ width: `${challengerPct}%` }} />
          <div className="relative flex justify-between items-center">
            <span className="font-mono text-sm">{shortenPubkey(challengerPubkey)}</span>
            <span className="font-bold">{challengerPct.toFixed(0)}%</span>
          </div>
        </button>

        {/* Defender prediction */}
        <button
          onClick={() => isActive && !submitted && handlePredict(defenderPubkey)}
          disabled={!isActive || submitted}
          className={`w-full relative overflow-hidden rounded-lg p-3 border transition-colors ${
            selectedWinner === defenderPubkey
              ? 'border-arena-red bg-arena-red/10'
              : 'border-arena-border hover:border-arena-red/50'
          } ${!isActive || submitted ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className="absolute left-0 top-0 bottom-0 bg-arena-red/10 transition-all"
            style={{ width: `${defenderPct}%` }} />
          <div className="relative flex justify-between items-center">
            <span className="font-mono text-sm">{shortenPubkey(defenderPubkey)}</span>
            <span className="font-bold">{defenderPct.toFixed(0)}%</span>
          </div>
        </button>
      </div>

      <div className="mt-3 text-xs text-arena-muted text-center">
        {total} prediction{total !== 1 ? 's' : ''}
        {submitted && ' — Your prediction is locked in!'}
        {!isActive && ' — Predictions closed'}
      </div>
    </div>
  );
}
