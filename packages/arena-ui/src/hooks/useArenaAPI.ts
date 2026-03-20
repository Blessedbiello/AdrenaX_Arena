'use client';

import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { Duel, DuelDetails, UserProfile, CreateDuelInput, Competition, LeaderboardEntry } from '../lib/types';

export function useDuels() {
  const [duels, setDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDuels = useCallback(async (params?: { status?: string; wallet?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listDuels(params);
      setDuels(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch duels');
    } finally {
      setLoading(false);
    }
  }, []);

  return { duels, loading, error, fetchDuels };
}

export function useDuelDetails(duelId: string) {
  const [details, setDetails] = useState<DuelDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDuel(duelId);
      setDetails(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch duel');
    } finally {
      setLoading(false);
    }
  }, [duelId]);

  return { details, loading, error, fetchDetails };
}

export function useCreateDuel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createDuel = useCallback(async (input: CreateDuelInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.createDuel(input);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create duel';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createDuel, loading, error };
}

export function useUserProfile(wallet: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const data = await api.getUserProfile(wallet);
      setProfile(data);
    } catch {
      // Silently fail for profile
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  return { profile, loading, fetchProfile };
}
