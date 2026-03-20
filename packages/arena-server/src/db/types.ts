import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

// ── Arena Seasons ──
export interface ArenaSeasonsTable {
  id: Generated<number>;
  name: string;
  start_time: ColumnType<Date, string | Date, string | Date>;
  end_time: ColumnType<Date, string | Date, string | Date>;
  status: 'upcoming' | 'active' | 'completed';
}

// ── Arena Competitions ──
export interface ArenaCompetitionsTable {
  id: Generated<string>;
  mode: 'gauntlet' | 'duel' | 'clan_war' | 'season';
  status: 'pending' | 'registration' | 'active' | 'round_transition' | 'settling' | 'completed' | 'rewards_distributed' | 'cancelled';
  season_id: number | null;
  start_time: ColumnType<Date, string | Date, string | Date>;
  end_time: ColumnType<Date, string | Date, string | Date>;
  current_round: number;
  total_rounds: number;
  config: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// ── Arena Participants ──
export interface ArenaParticipantsTable {
  id: Generated<string>;
  competition_id: string;
  user_pubkey: string;
  team_id: string | null;
  status: 'active' | 'eliminated' | 'withdrawn' | 'winner' | 'forfeited';
  eliminated_round: number | null;
  pnl_usd: ColumnType<number, number | string, number | string>;
  roi_percent: ColumnType<number, number | string, number | string>;
  total_volume_usd: ColumnType<number, number | string, number | string>;
  positions_closed: number;
  win_rate: ColumnType<number, number | string, number | string>;
  arena_score: ColumnType<number, number | string, number | string>;
  last_indexed_at: ColumnType<Date | null, string | Date | null, string | Date | null>;
  cursor_position_id: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// ── Arena Trades ──
export interface ArenaTradesTable {
  id: Generated<string>;
  competition_id: string;
  user_pubkey: string;
  position_id: number;
  symbol: string;
  side: 'long' | 'short';
  entry_price: ColumnType<number | null, number | string | null, number | string | null>;
  exit_price: ColumnType<number | null, number | string | null, number | string | null>;
  entry_size: ColumnType<number | null, number | string | null, number | string | null>;
  collateral_usd: ColumnType<number | null, number | string | null, number | string | null>;
  pnl_usd: ColumnType<number | null, number | string | null, number | string | null>;
  fees_usd: ColumnType<number | null, number | string | null, number | string | null>;
  entry_date: ColumnType<Date | null, string | Date | null, string | Date | null>;
  exit_date: ColumnType<Date | null, string | Date | null, string | Date | null>;
  is_liquidated: boolean;
}

// ── Arena Duels ──
export interface ArenaDuelsTable {
  id: Generated<string>;
  competition_id: string;
  challenger_pubkey: string;
  defender_pubkey: string | null;
  asset_symbol: string;
  stake_amount: ColumnType<number, number | string, number | string>;
  stake_token: string;
  is_honor_duel: boolean;
  duration_hours: 24 | 48;
  status: 'pending' | 'accepted' | 'active' | 'settling' | 'completed' | 'expired' | 'cancelled';
  winner_pubkey: string | null;
  challenger_roi: ColumnType<number | null, number | string | null, number | string | null>;
  defender_roi: ColumnType<number | null, number | string | null, number | string | null>;
  escrow_tx: string | null;
  settlement_tx: string | null;
  challenge_card_url: string | null;
  accepted_at: ColumnType<Date | null, string | Date | null, string | Date | null>;
  expires_at: ColumnType<Date, string | Date, string | Date>;
  created_at: Generated<Date>;
}

// ── Arena Predictions ──
export interface ArenaPredictionsTable {
  id: Generated<string>;
  duel_id: string;
  predictor_pubkey: string;
  predicted_winner: string;
  prediction_locked_at: Generated<Date>;
  is_correct: boolean | null;
  mutagen_reward: ColumnType<number, number | string, number | string>;
}

// ── Arena Round Snapshots ──
export interface ArenaRoundSnapshotsTable {
  id: Generated<string>;
  competition_id: string;
  round_number: number;
  snapshot_time: Generated<Date>;
  participant_scores: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  eliminated_pubkeys: string[];
}

// ── Arena Rewards ──
export interface ArenaRewardsTable {
  id: Generated<number>;
  competition_id: string | null;
  user_pubkey: string;
  amount: ColumnType<number, number | string, number | string>;
  token: string;
  reward_type: 'prize' | 'mutagen_bonus' | 'prediction' | 'protocol_fee';
  tx_signature: string | null;
  created_at: Generated<Date>;
}

// ── Arena Season Points ──
export interface ArenaSeasonPointsTable {
  id: Generated<string>;
  season_id: number;
  user_pubkey: string;
  total_points: number;
  gauntlet_points: number;
  duel_points: number;
  clan_points: number;
}

// ── Database Interface ──
export interface DB {
  arena_seasons: ArenaSeasonsTable;
  arena_competitions: ArenaCompetitionsTable;
  arena_participants: ArenaParticipantsTable;
  arena_trades: ArenaTradesTable;
  arena_duels: ArenaDuelsTable;
  arena_predictions: ArenaPredictionsTable;
  arena_round_snapshots: ArenaRoundSnapshotsTable;
  arena_rewards: ArenaRewardsTable;
  arena_season_points: ArenaSeasonPointsTable;
}

// Export helper types
export type Season = Selectable<ArenaSeasonsTable>;
export type NewSeason = Insertable<ArenaSeasonsTable>;
export type Competition = Selectable<ArenaCompetitionsTable>;
export type NewCompetition = Insertable<ArenaCompetitionsTable>;
export type Participant = Selectable<ArenaParticipantsTable>;
export type NewParticipant = Insertable<ArenaParticipantsTable>;
export type Trade = Selectable<ArenaTradesTable>;
export type NewTrade = Insertable<ArenaTradesTable>;
export type Duel = Selectable<ArenaDuelsTable>;
export type NewDuel = Insertable<ArenaDuelsTable>;
export type Prediction = Selectable<ArenaPredictionsTable>;
export type Reward = Selectable<ArenaRewardsTable>;
