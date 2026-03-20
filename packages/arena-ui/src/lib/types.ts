export interface Duel {
  id: string;
  competition_id: string;
  challenger_pubkey: string;
  defender_pubkey: string | null;
  asset_symbol: string;
  stake_amount: number;
  stake_token: string;
  is_honor_duel: boolean;
  duration_hours: 24 | 48;
  status: 'pending' | 'accepted' | 'active' | 'settling' | 'completed' | 'expired' | 'cancelled';
  winner_pubkey: string | null;
  challenger_roi: number | null;
  defender_roi: number | null;
  escrow_tx: string | null;
  settlement_tx: string | null;
  challenge_card_url: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface DuelDetails {
  duel: Duel;
  participants: Participant[];
  predictions: Prediction[];
  competition?: {
    start_time: string;
    end_time: string;
  };
}

export interface Participant {
  id: string;
  competition_id: string;
  user_pubkey: string;
  status: 'active' | 'eliminated' | 'withdrawn' | 'winner' | 'forfeited';
  pnl_usd: number;
  roi_percent: number;
  total_volume_usd: number;
  positions_closed: number;
  win_rate: number;
  arena_score: number;
}

export interface Competition {
  id: string;
  mode: 'gauntlet' | 'duel' | 'clan_war' | 'season';
  status: string;
  start_time: string;
  end_time: string;
  current_round: number;
  total_rounds: number;
  config: Record<string, unknown>;
  created_at: string;
}

export interface Prediction {
  id: string;
  duel_id: string;
  predictor_pubkey: string;
  predicted_winner: string;
  is_correct: boolean | null;
  mutagen_reward: number;
}

export interface PredictionStats {
  total: number;
  challenger: { pubkey: string; votes: number };
  defender: { pubkey: string; votes: number };
}

export interface LeaderboardEntry {
  rank: number;
  pubkey: string;
  roi: number;
  pnl: number;
  volume: number;
  trades: number;
  winRate: number;
  arenaScore: number;
  status: string;
}

export interface UserProfile {
  wallet: string;
  duels: {
    total: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  gauntlets: {
    entered: number;
    won: number;
  };
  recentDuels: Duel[];
}

export interface ApiResponse<T> {
  success: boolean;
  error?: string;
  message?: string;
  data?: T;
}

export interface CreateDuelInput {
  defenderPubkey?: string;
  assetSymbol: string;
  durationHours: 24 | 48;
  stakeAmount?: number;
  stakeToken?: 'ADX' | 'USDC';
  isHonorDuel?: boolean;
}
