'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DuelDetails } from '../lib/types';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000';

export function useDuelWS(duelId: string | null) {
  const [duelState, setDuelState] = useState<DuelDetails | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!duelId) return;

    const ws = new WebSocket(`${WS_BASE}/ws/duels`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: 'subscribe', duelId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'duel_update') {
          setDuelState(msg.data);
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 3s
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [duelId]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { duelState, connected };
}
