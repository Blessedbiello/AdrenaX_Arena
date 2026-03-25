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
  escrow_state: 'not_required' | 'awaiting_challenger_deposit' | 'awaiting_defender_deposit' | 'funded' | 'settled' | 'refunded' | 'cancelled';
  challenger_deposit_tx: string | null;
  defender_deposit_tx: string | null;
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

export interface UserStreak {
  current_streak: number;
  best_streak: number;
  streak_type: 'win' | 'loss' | 'none';
  total_wins: number;
  total_losses: number;
  title: string | null;
  mutagen_multiplier: number;
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
  streak?: {
    current: number;
    best: number;
    type: 'win' | 'loss' | 'none';
    title: string | null;
    multiplier: number;
  };
}

export interface RevengeWindow {
  opponentPubkey: string;
  originalDuelId: string;
  assetSymbol: string;
  ttlSeconds: number;
}

export interface Clan {
  id: string;
  name: string;
  tag: string;
  leader_pubkey: string;
  member_count: number;
  total_war_score: number;
  wars_won: number;
  wars_played: number;
  created_at: string;
}

export interface ClanMember {
  id: string;
  clan_id: string;
  user_pubkey: string;
  role: 'leader' | 'officer' | 'member';
  joined_at: string;
}

export interface ClanWar {
  id: string;
  competition_id: string;
  challenger_clan_id: string;
  defender_clan_id: string;
  duration_hours: number;
  stake_amount: number;
  stake_token: 'ADX' | 'USDC' | null;
  is_honor_war: boolean;
  status: 'pending' | 'active' | 'completed' | 'expired' | 'cancelled';
  winner_clan_id: string | null;
  escrow_state: 'not_required' | 'awaiting_challenger_deposit' | 'awaiting_defender_deposit' | 'funded' | 'settled' | 'refunded' | 'cancelled';
  challenger_deposit_tx: string | null;
  defender_deposit_tx: string | null;
  escrow_tx: string | null;
  settlement_tx: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface Season {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  status: 'upcoming' | 'active' | 'completed';
}

export interface SeasonStanding {
  user_pubkey: string;
  total_points: number;
  duel_points: number;
  gauntlet_points: number;
  clan_points: number;
}

export interface SeasonPassProgress {
  season: Season;
  wallet: string;
  totalPoints: number;
  unlockedMilestones: Array<{ name: string; threshold: number; unlock: string }>;
  nextMilestone: { name: string; threshold: number; unlock: string } | null;
}

export interface ApiResponse<T> {
  success: boolean;
  error?: string;
  message?: string;
  data?: T;
}

export interface EscrowTransactionIntent {
  role: 'challenger' | 'defender' | 'clan_challenger' | 'clan_defender';
  competitionType?: 'duel' | 'clan_war';
  competitionId?: string;
  duelId?: string;
  warId?: string;
  mint: 'ADX' | 'USDC';
  amount: number;
  rpcUrl: string;
  programId: string;
  serializedTransaction: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  escrowPda: string;
  escrowVaultAta: string;
  mintAddress: string;
  expiresAt: string;
}

export interface CreateDuelInput {
  defenderPubkey?: string;
  assetSymbol: string;
  durationHours: 24 | 48;
  stakeAmount?: number;
  stakeToken?: 'ADX' | 'USDC';
  isHonorDuel?: boolean;
}
