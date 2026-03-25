import type { ApiResponse, Duel, DuelDetails, Competition, Participant, PredictionStats, UserProfile, CreateDuelInput, LeaderboardEntry, UserStreak, RevengeWindow, Clan, ClanMember } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

if (typeof window !== 'undefined' && API_BASE.includes('localhost') && window.location.hostname !== 'localhost') {
  console.warn('[Arena] API_BASE points to localhost but app is running on', window.location.hostname);
}

class ArenaAPI {
  private authHeaders: Record<string, string> = {};

  setAuth(wallet: string, signature: string, nonce: string) {
    this.authHeaders = {
      'x-wallet': wallet,
      'x-signature': signature,
      'x-nonce': nonce,
    };
  }

  clearAuth() {
    this.authHeaders = {};
  }

  private async fetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders,
        ...opts.headers,
      },
    });

    const json: ApiResponse<T> = await res.json();
    if (!json.success) {
      throw new Error(json.message || json.error || 'API request failed');
    }
    return json.data as T;
  }

  // Auth
  async getNonce(wallet: string): Promise<{ nonce: string; message: string }> {
    return this.fetch(`/api/arena/users/nonce/${wallet}`);
  }

  // Duels
  async listDuels(params?: { status?: string; wallet?: string; asset?: string; type?: 'open' | 'direct' | 'all'; limit?: number }): Promise<Duel[]> {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.wallet) search.set('wallet', params.wallet);
    if (params?.asset) search.set('asset', params.asset);
    if (params?.type) search.set('type', params.type);
    if (params?.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    return this.fetch(`/api/arena/duels${qs ? `?${qs}` : ''}`);
  }

  async getDuel(id: string): Promise<DuelDetails> {
    return this.fetch(`/api/arena/duels/${id}`);
  }

  async createDuel(input: CreateDuelInput): Promise<{ duel: Duel; challengeUrl: string; cardUrl: string }> {
    return this.fetch('/api/arena/duels', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async acceptDuel(id: string): Promise<{ duel: Duel; startTime: string; endTime: string }> {
    return this.fetch(`/api/arena/duels/${id}/accept`, { method: 'POST' });
  }

  async submitPrediction(duelId: string, predictedWinner: string): Promise<unknown> {
    return this.fetch(`/api/arena/duels/${duelId}/predict`, {
      method: 'POST',
      body: JSON.stringify({ predictedWinner }),
    });
  }

  async getPredictionStats(duelId: string): Promise<PredictionStats> {
    return this.fetch(`/api/arena/duels/${duelId}/predictions`);
  }

  // Competitions
  async listCompetitions(params?: { mode?: string; status?: string }): Promise<Competition[]> {
    const search = new URLSearchParams();
    if (params?.mode) search.set('mode', params.mode);
    if (params?.status) search.set('status', params.status);
    const qs = search.toString();
    return this.fetch(`/api/arena/competitions${qs ? `?${qs}` : ''}`);
  }

  async getCompetition(id: string): Promise<{ competition: Competition; participants: Participant[] }> {
    return this.fetch(`/api/arena/competitions/${id}`);
  }

  async createGauntlet(name: string, maxParticipants?: number): Promise<Competition> {
    return this.fetch('/api/arena/competitions/gauntlet', {
      method: 'POST',
      body: JSON.stringify({ name, maxParticipants }),
    });
  }

  async registerForGauntlet(competitionId: string): Promise<Participant> {
    return this.fetch(`/api/arena/competitions/${competitionId}/register`, { method: 'POST' });
  }

  // Users
  async getUserProfile(wallet: string): Promise<UserProfile> {
    return this.fetch(`/api/arena/users/${wallet}/profile`);
  }

  async getUserStreak(wallet: string): Promise<UserStreak> {
    return this.fetch(`/api/arena/users/${wallet}/streak`);
  }

  async getLeaderboard(period?: 'weekly' | 'monthly' | 'all'): Promise<Array<{ rank: number; wallet: string; wins: number; losses: number; winRate: number; totalROI: number; duelsPlayed: number }>> {
    const qs = period ? `?period=${period}` : '';
    return this.fetch(`/api/arena/users/leaderboard${qs}`);
  }

  // Revenge
  async createRevengeDuel(opponentPubkey: string): Promise<{ duel: Duel; competition: Competition }> {
    return this.fetch('/api/arena/duels/revenge', {
      method: 'POST',
      body: JSON.stringify({ opponentPubkey }),
    });
  }

  async getRevengeWindows(wallet: string): Promise<RevengeWindow[]> {
    return this.fetch(`/api/arena/duels/revenge/${wallet}`);
  }

  // Challenge card URL (for images)
  getChallengeCardUrl(duelId: string): string {
    return `${API_BASE}/api/arena/challenge/${duelId}/card.png`;
  }

  // SSE stream URL
  getDuelStreamUrl(duelId: string): string {
    return `${API_BASE}/api/arena/duels/${duelId}/stream`;
  }

  getLeaderboardStreamUrl(competitionId: string): string {
    return `${API_BASE}/api/arena/competitions/${competitionId}/stream`;
  }

  // Clans
  async createClan(name: string, tag: string): Promise<Clan> {
    return this.fetch('/api/arena/clans', {
      method: 'POST',
      body: JSON.stringify({ name, tag }),
    });
  }

  async joinClan(clanId: string): Promise<ClanMember> {
    return this.fetch(`/api/arena/clans/${clanId}/join`, { method: 'POST' });
  }

  async leaveClan(): Promise<{ disbanded: boolean }> {
    return this.fetch('/api/arena/clans/membership', { method: 'DELETE' });
  }

  async getClanRankings(): Promise<Clan[]> {
    return this.fetch('/api/arena/clans/rankings');
  }

  async getClanDetails(clanId: string): Promise<{ clan: Clan; members: ClanMember[] }> {
    return this.fetch(`/api/arena/clans/${clanId}`);
  }
}

export const api = new ArenaAPI();
