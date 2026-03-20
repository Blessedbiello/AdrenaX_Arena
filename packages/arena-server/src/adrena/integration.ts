import { EventEmitter } from 'events';

/**
 * AdrenaX Arena Integration Layer
 *
 * Provides event-driven hooks for Adrena's existing infrastructure to
 * connect with Arena competitions. This module emits lifecycle events
 * that Adrena's systems (Mutagen, leaderboard, quests, streaks, raffles)
 * can subscribe to.
 */

// ── Event Types ──

export interface ArenaEvent {
  type: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

export interface DuelCreatedEvent extends ArenaEvent {
  type: 'duel_created';
  payload: {
    duelId: string;
    competitionId: string;
    challengerPubkey: string;
    defenderPubkey: string;
    assetSymbol: string;
    durationHours: number;
    isHonorDuel: boolean;
    stakeAmount: number;
    stakeToken: string;
  };
}

export interface DuelAcceptedEvent extends ArenaEvent {
  type: 'duel_accepted';
  payload: {
    duelId: string;
    competitionId: string;
    challengerPubkey: string;
    defenderPubkey: string;
    startTime: Date;
    endTime: Date;
  };
}

export interface DuelSettledEvent extends ArenaEvent {
  type: 'duel_settled';
  payload: {
    duelId: string;
    competitionId: string;
    winnerPubkey: string | null;
    loserPubkey: string | null;
    challengerROI: number;
    defenderROI: number;
    isDraw: boolean;
  };
}

export interface GauntletCreatedEvent extends ArenaEvent {
  type: 'gauntlet_created';
  payload: {
    competitionId: string;
    name: string;
    maxParticipants: number;
    durationHours: number;
    registrationEnd: Date;
    endTime: Date;
  };
}

export interface GauntletActivatedEvent extends ArenaEvent {
  type: 'gauntlet_activated';
  payload: {
    competitionId: string;
    participantCount: number;
    participantPubkeys: string[];
  };
}

export interface GauntletSettledEvent extends ArenaEvent {
  type: 'gauntlet_settled';
  payload: {
    competitionId: string;
    rankings: Array<{
      rank: number;
      pubkey: string;
      roi: number;
      pnl: number;
      trades: number;
    }>;
  };
}

export interface ParticipantRegisteredEvent extends ArenaEvent {
  type: 'participant_registered';
  payload: {
    competitionId: string;
    userPubkey: string;
    competitionMode: string;
  };
}

export interface RewardDistributedEvent extends ArenaEvent {
  type: 'reward_distributed';
  payload: {
    competitionId: string;
    userPubkey: string;
    amount: number;
    token: string;
    rewardType: string;
  };
}

export interface PredictionMadeEvent extends ArenaEvent {
  type: 'prediction_made';
  payload: {
    duelId: string;
    predictorPubkey: string;
    predictedWinner: string;
  };
}

export type ArenaEventMap = {
  duel_created: DuelCreatedEvent;
  duel_accepted: DuelAcceptedEvent;
  duel_settled: DuelSettledEvent;
  gauntlet_created: GauntletCreatedEvent;
  gauntlet_activated: GauntletActivatedEvent;
  gauntlet_settled: GauntletSettledEvent;
  participant_registered: ParticipantRegisteredEvent;
  reward_distributed: RewardDistributedEvent;
  prediction_made: PredictionMadeEvent;
};

// ── Event Emitter ──

class ArenaEventBus extends EventEmitter {
  emit<K extends keyof ArenaEventMap>(event: K, data: ArenaEventMap[K]): boolean {
    return super.emit(event, data);
  }

  on<K extends keyof ArenaEventMap>(event: K, listener: (data: ArenaEventMap[K]) => void): this {
    return super.on(event, listener);
  }
}

export const arenaEvents = new ArenaEventBus();

// ── Adapter Interfaces ──

/**
 * Mutagen Integration Adapter
 *
 * Adrena implements this interface to connect their Mutagen reward system.
 * Arena calls these methods when competition events warrant Mutagen rewards.
 */
export interface MutagenAdapter {
  /** Award Mutagen points for a competition result */
  awardMutagen(userPubkey: string, amount: number, reason: string, metadata: Record<string, unknown>): Promise<void>;

  /** Query a user's current Mutagen balance (for display) */
  getMutagenBalance(userPubkey: string): Promise<number>;

  /** Apply a Mutagen multiplier based on Arena performance */
  applyMultiplier(userPubkey: string, multiplier: number, expiresAt: Date): Promise<void>;
}

/**
 * Leaderboard Sync Adapter
 *
 * Adrena implements this to sync Arena competition results with their
 * existing leaderboard system.
 */
export interface LeaderboardAdapter {
  /** Update user's Arena-specific stats on the global leaderboard */
  syncUserStats(userPubkey: string, stats: {
    arenaWins: number;
    arenaLosses: number;
    arenaROI: number;
    arenaPnL: number;
    duelStreak: number;
    mutagenEarned: number;
  }): Promise<void>;

  /** Push a completed competition result to the leaderboard */
  pushCompetitionResult(competitionId: string, mode: string, rankings: Array<{
    rank: number;
    pubkey: string;
    roi: number;
    pnl: number;
  }>): Promise<void>;
}

/**
 * Quest System Adapter
 *
 * Adrena implements this to trigger quest progress from Arena activities.
 * Arena emits events; Adrena's quest engine evaluates quest conditions.
 */
export interface QuestAdapter {
  /** Notify quest system of an Arena action */
  trackAction(userPubkey: string, action: string, metadata: Record<string, unknown>): Promise<void>;
}

/**
 * Streak System Adapter
 *
 * Maps Arena duel wins/losses to Adrena's existing streak mechanic.
 */
export interface StreakAdapter {
  /** Record a duel result for streak tracking */
  recordDuelResult(userPubkey: string, won: boolean, opponentPubkey: string): Promise<void>;

  /** Get current streak for display */
  getStreak(userPubkey: string): Promise<{ current: number; best: number; type: 'win' | 'loss' }>;
}

// ── Webhook System ──

export interface WebhookSubscription {
  id: string;
  url: string;
  events: Array<keyof ArenaEventMap>;
  secret: string;
  active: boolean;
  createdAt: Date;
}

const webhookSubscriptions: WebhookSubscription[] = [];

/**
 * Register a webhook endpoint to receive Arena events.
 * Adrena's backend registers webhooks to receive real-time competition events.
 */
export function registerWebhook(subscription: Omit<WebhookSubscription, 'id' | 'createdAt'>): WebhookSubscription {
  const webhook: WebhookSubscription = {
    ...subscription,
    id: `wh_${Date.now().toString(36)}`,
    createdAt: new Date(),
  };
  webhookSubscriptions.push(webhook);

  // Subscribe to all requested events
  for (const eventName of subscription.events) {
    arenaEvents.on(eventName, async (event) => {
      if (!webhook.active) return;
      await deliverWebhook(webhook, event);
    });
  }

  return webhook;
}

export function removeWebhook(id: string): boolean {
  const idx = webhookSubscriptions.findIndex(w => w.id === id);
  if (idx === -1) return false;
  webhookSubscriptions[idx].active = false;
  webhookSubscriptions.splice(idx, 1);
  return true;
}

export function listWebhooks(): WebhookSubscription[] {
  return [...webhookSubscriptions];
}

async function deliverWebhook(webhook: WebhookSubscription, event: ArenaEvent): Promise<void> {
  try {
    const { createHmac } = await import('crypto');
    const body = JSON.stringify(event);
    const signature = createHmac('sha256', webhook.secret).update(body).digest('hex');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Arena-Signature': signature,
        'X-Arena-Event': event.type,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
  } catch (err) {
    console.error(`[Webhook] Delivery failed to ${webhook.url}:`, (err as Error).message);
  }
}

// ── Default Adapter Registry ──

/**
 * Adapter registry for Adrena to plug in their implementations.
 * Defaults are no-ops that log the action — replaced at boot time
 * when Adrena provides their adapter implementations.
 */
export const adapters = {
  mutagen: null as MutagenAdapter | null,
  leaderboard: null as LeaderboardAdapter | null,
  quest: null as QuestAdapter | null,
  streak: null as StreakAdapter | null,
};

export function setAdapter<K extends keyof typeof adapters>(
  name: K,
  adapter: NonNullable<typeof adapters[K]>
): void {
  (adapters as any)[name] = adapter;
  console.log(`[Integration] ${name} adapter registered`);
}

// ── Built-in Event Handlers ──

// When a duel settles, notify all registered adapters
arenaEvents.on('duel_settled', async (event) => {
  const { winnerPubkey, loserPubkey, competitionId } = event.payload;

  // Mutagen rewards
  if (adapters.mutagen && winnerPubkey) {
    await adapters.mutagen.awardMutagen(winnerPubkey, 50, 'duel_win', { competitionId }).catch(err =>
      console.error('[Integration] Mutagen award failed:', err)
    );
  }

  // Quest tracking
  if (adapters.quest) {
    if (winnerPubkey) {
      await adapters.quest.trackAction(winnerPubkey, 'duel_won', { competitionId }).catch(() => {});
    }
    if (loserPubkey) {
      await adapters.quest.trackAction(loserPubkey, 'duel_lost', { competitionId }).catch(() => {});
    }
  }

  // Streak tracking
  if (adapters.streak && winnerPubkey && loserPubkey) {
    await adapters.streak.recordDuelResult(winnerPubkey, true, loserPubkey).catch(() => {});
    await adapters.streak.recordDuelResult(loserPubkey, false, winnerPubkey).catch(() => {});
  }
});

// When a gauntlet settles, sync leaderboard
arenaEvents.on('gauntlet_settled', async (event) => {
  if (adapters.leaderboard) {
    await adapters.leaderboard.pushCompetitionResult(
      event.payload.competitionId,
      'gauntlet',
      event.payload.rankings
    ).catch(err => console.error('[Integration] Leaderboard sync failed:', err));
  }
});
