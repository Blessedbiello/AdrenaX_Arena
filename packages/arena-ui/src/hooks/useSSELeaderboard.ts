'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import type { LeaderboardEntry } from '../lib/types';

export function useSSELeaderboard(competitionId: string | null) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!competitionId) return;

    const url = api.getLeaderboardStreamUrl(competitionId);
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('snapshot', (e) => {
      try {
        const data = JSON.parse(e.data);
        setLeaderboard(data.board || []);
        setConnected(true);
      } catch {}
    });

    es.addEventListener('update', (e) => {
      try {
        const data = JSON.parse(e.data);
        setLeaderboard(data.board || []);
      } catch {}
    });

    es.addEventListener('error', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        console.error('[SSE] Leaderboard error:', data.error);
      } catch {}
    });

    es.onerror = () => {
      setConnected(false);
    };

    es.onopen = () => {
      setConnected(true);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [competitionId]);

  return { leaderboard, connected };
}
