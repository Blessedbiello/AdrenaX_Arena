import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

// ── Arena Seasons ──
export interface ArenaSeasonsTable {
  id: Generated<number>;
  name: string;
  start_time: ColumnType<Date, string | Date, string | Date>;
  end_time: ColumnType<Date, string | Date, string | Date>;
  status: 'upcoming' | 'active' | 'completed';
}

// ── Competition Config Types ──
export interface DuelConfig {
  asset: string;
  durationHours: number;
  isRevenge?: boolean;
  revengeMultiplier?: number;
  originalDuelId?: string;
}

export interface GauntletConfig {
  name: string;
  maxParticipants: number;
  durationHours: number;
  rounds?: number;
  roundDurations?: number[];
  intermissionMinutes?: number;
  registrationEnd?: string;
  currentRoundStart?: string;
  currentRoundEnd?: string;
  registrationExtended?: boolean;
}

export interface ClanWarConfig {
  name: string;
  durationHours: number;
  maxClans?: number;
}

export type CompetitionConfig = DuelConfig | GauntletConfig | ClanWarConfig;

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
  config: ColumnType<CompetitionConfig, string | CompetitionConfig, string | CompetitionConfig>;
  dispute_status: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// ── Arena Participants ──
export interface ArenaParticipantsTable {
  id: Generated<string>;
  competition_id: string;
  user_pubkey: string;
  team_id: ColumnType<string | null, string | null | undefined, string | null>;
  status: 'active' | 'eliminated' | 'withdrawn' | 'winner' | 'forfeited';
  eliminated_round: ColumnType<number | null, number | null | undefined, number | null>;
  pnl_usd: ColumnType<number, number | string | undefined, number | string>;
  roi_percent: ColumnType<number, number | string | undefined, number | string>;
  total_volume_usd: ColumnType<number, number | string | undefined, number | string>;
  positions_closed: ColumnType<number, number | undefined, number>;
  win_rate: ColumnType<number, number | string | undefined, number | string>;
  arena_score: ColumnType<number, number | string | undefined, number | string>;
  last_indexed_at: ColumnType<Date | null, string | Date | null | undefined, string | Date | null>;
  cursor_position_id: ColumnType<number | null, number | null | undefined, number | null>;
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
  escrow_state: 'not_required' | 'awaiting_challenger_deposit' | 'awaiting_defender_deposit' | 'funded' | 'settlement_pending' | 'settled' | 'refunded' | 'cancelled' | 'settlement_failed' | 'cancellation_failed';
  challenger_deposit_tx: string | null;
  defender_deposit_tx: string | null;
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
  mutagen_reward: ColumnType<number, number | string | undefined, number | string>;
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

export interface ArenaSeasonPassProgressTable {
  id: Generated<string>;
  season_id: number;
  user_pubkey: string;
  total_points: number;
  highest_milestone: number;
  unlocked_rewards: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  updated_at: Generated<Date>;
}

// ── Arena Clans ──
export interface ArenaClansTable {
  id: Generated<string>;
  name: string;
  tag: string;
  leader_pubkey: string;
  member_count: ColumnType<number, number | undefined, number>;
  total_war_score: ColumnType<number, number | string | undefined, number | string>;
  wars_won: ColumnType<number, number | undefined, number>;
  wars_played: ColumnType<number, number | undefined, number>;
  created_at: Generated<Date>;
}

// ── Arena Clan Members ──
export interface ArenaClanMembersTable {
  id: Generated<string>;
  clan_id: string;
  user_pubkey: string;
  role: 'leader' | 'officer' | 'member';
  joined_at: Generated<Date>;
  cooldown_until: ColumnType<Date | null, string | Date | null | undefined, string | Date | null>;
}

export interface ArenaClanWarsTable {
  id: Generated<string>;
  competition_id: string;
  challenger_clan_id: string;
  defender_clan_id: string;
  duration_hours: number;
  stake_amount: ColumnType<number, number | string | undefined, number | string>;
  stake_token: string | null;
  is_honor_war: boolean;
  status: 'pending' | 'active' | 'completed' | 'expired' | 'cancelled';
  winner_clan_id: string | null;
  escrow_state: 'not_required' | 'awaiting_challenger_deposit' | 'awaiting_defender_deposit' | 'funded' | 'settlement_pending' | 'settled' | 'refunded' | 'cancelled' | 'settlement_failed' | 'cancellation_failed';
  challenger_deposit_tx: string | null;
  defender_deposit_tx: string | null;
  escrow_tx: string | null;
  settlement_tx: string | null;
  accepted_at: ColumnType<Date | null, string | Date | null | undefined, string | Date | null>;
  expires_at: ColumnType<Date, string | Date, string | Date>;
  created_at: Generated<Date>;
}

export interface ArenaClanCooldownsTable {
  user_pubkey: string;
  last_clan_id: string | null;
  cooldown_until: ColumnType<Date, string | Date, string | Date>;
  created_at: Generated<Date>;
}

// ── Arena User Stats ──
export interface ArenaUserStatsTable {
  user_pubkey: string;
  current_streak: number;
  best_streak: number;
  streak_type: 'win' | 'loss' | 'none';
  total_wins: number;
  total_losses: number;
  title: string | null;
  mutagen_multiplier: ColumnType<number, number | string, number | string>;
  banned_at: ColumnType<Date | null, string | Date | null | undefined, string | Date | null>;
  banned_reason: string | null;
  updated_at: Generated<Date>;
}

// ── Arena Webhooks ──
export interface ArenaWebhooksTable {
  id: Generated<string>;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  created_at: Generated<Date>;
}

// ── Arena Webhook Deliveries ──
export interface ArenaWebhookDeliveriesTable {
  id: Generated<number>;
  webhook_id: string;
  event_type: string;
  payload: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  status: 'pending' | 'sent' | 'failed' | 'dead';
  attempts: number;
  last_attempt_at: ColumnType<Date | null, string | Date | null | undefined, string | Date | null>;
  next_retry_at: ColumnType<Date | null, string | Date | null | undefined, string | Date | null>;
  response_status: number | null;
  created_at: Generated<Date>;
}

// ── Arena Settlement Snapshots ──
export interface ArenaSettlementSnapshotsTable {
  id: Generated<string>;
  competition_id: string;
  snapshot_type: string;
  raw_positions: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  computed_scores: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  settlement_result: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>;
  created_at: Generated<Date>;
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
  arena_season_pass_progress: ArenaSeasonPassProgressTable;
  arena_user_stats: ArenaUserStatsTable;
  arena_clans: ArenaClansTable;
  arena_clan_members: ArenaClanMembersTable;
  arena_clan_wars: ArenaClanWarsTable;
  arena_clan_cooldowns: ArenaClanCooldownsTable;
  arena_webhooks: ArenaWebhooksTable;
  arena_webhook_deliveries: ArenaWebhookDeliveriesTable;
  arena_settlement_snapshots: ArenaSettlementSnapshotsTable;
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
export type SeasonPassProgress = Selectable<ArenaSeasonPassProgressTable>;
export type UserStats = Selectable<ArenaUserStatsTable>;
export type Clan = Selectable<ArenaClansTable>;
export type ClanMember = Selectable<ArenaClanMembersTable>;
export type ClanWar = Selectable<ArenaClanWarsTable>;
export type ClanCooldown = Selectable<ArenaClanCooldownsTable>;
export type Webhook = Selectable<ArenaWebhooksTable>;
export type WebhookDelivery = Selectable<ArenaWebhookDeliveriesTable>;
export type SettlementSnapshot = Selectable<ArenaSettlementSnapshotsTable>;
