import { EventEmitter } from 'events';
import { getDb } from '../db/connection.js';
import type { Webhook } from '../db/types.js';

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

/** Map a DB row to the domain WebhookSubscription type. */
function rowToSubscription(row: Webhook): WebhookSubscription {
  return {
    id: row.id,
    url: row.url,
    events: row.events as Array<keyof ArenaEventMap>,
    secret: row.secret,
    active: row.active,
    createdAt: row.created_at,
  };
}

/**
 * Register a webhook endpoint to receive Arena events.
 * Persists the subscription to the database so it survives restarts.
 */
export async function registerWebhook(
  subscription: Omit<WebhookSubscription, 'id' | 'createdAt'>,
): Promise<WebhookSubscription> {
  const db = getDb();
  const row = await db
    .insertInto('arena_webhooks')
    .values({
      url: subscription.url,
      events: subscription.events as string[],
      secret: subscription.secret,
      active: subscription.active,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return rowToSubscription(row);
}

/**
 * Soft-delete a webhook by setting active = false.
 * Returns false when no matching row is found.
 */
export async function removeWebhook(id: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .updateTable('arena_webhooks')
    .set({ active: false })
    .where('id', '=', id)
    .executeTakeFirst();

  return (result.numUpdatedRows ?? BigInt(0)) > BigInt(0);
}

/** Return all webhook subscriptions from the database. */
export async function listWebhooks(): Promise<WebhookSubscription[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('arena_webhooks')
    .selectAll()
    .execute();

  return rows.map(rowToSubscription);
}

/**
 * Retry intervals (seconds) indexed by attempt number (0-based).
 * After attempt 4 (5th total) the delivery is marked dead.
 */
const RETRY_DELAYS_SECONDS = [60, 300, 1800, 3600, 7200] as const;
const MAX_ATTEMPTS = 5;

/**
 * Deliver an event to a single webhook subscriber.
 *
 * Inserts a delivery row with status='pending', attempts the HTTP POST,
 * then updates the row to 'sent' on success or advances retry scheduling
 * on failure. After MAX_ATTEMPTS the delivery is marked 'dead'.
 */
async function deliverWebhook(webhook: Webhook, event: ArenaEvent): Promise<void> {
  const db = getDb();
  const body = JSON.stringify(event);

  // Insert a delivery record before attempting so we have a row to update.
  const delivery = await db
    .insertInto('arena_webhook_deliveries')
    .values({
      webhook_id: webhook.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
      status: 'pending',
      attempts: 0,
      last_attempt_at: null,
      next_retry_at: null,
      response_status: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await attemptDelivery(delivery.id, webhook, body, event.type);
}

/**
 * Execute a single HTTP delivery attempt for an existing delivery row.
 * Shared by the initial delivery path and the retry processor.
 */
async function attemptDelivery(
  deliveryId: number,
  webhook: Webhook,
  body: string,
  eventType: string,
): Promise<void> {
  const db = getDb();
  const { createHmac } = await import('crypto');
  const signature = createHmac('sha256', webhook.secret).update(body).digest('hex');

  // Fetch current attempt count so the retry math is always accurate.
  const current = await db
    .selectFrom('arena_webhook_deliveries')
    .select(['attempts'])
    .where('id', '=', deliveryId)
    .executeTakeFirstOrThrow();

  const newAttempts = current.attempts + 1;
  const now = new Date();

  let responseStatus: number | null = null;
  let success = false;

  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Arena-Signature': signature,
        'X-Arena-Event': eventType,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);
    responseStatus = response.status;
    success = response.ok;
  } catch (err) {
    console.error(`[Webhook] HTTP error for ${webhook.url}:`, (err as Error).message);
  }

  if (success) {
    await db
      .updateTable('arena_webhook_deliveries')
      .set({
        status: 'sent',
        attempts: newAttempts,
        last_attempt_at: now,
        next_retry_at: null,
        response_status: responseStatus,
      })
      .where('id', '=', deliveryId)
      .execute();
    return;
  }

  // Delivery failed — decide whether to schedule a retry or mark dead.
  const isDead = newAttempts >= MAX_ATTEMPTS;
  const delaySeconds = RETRY_DELAYS_SECONDS[Math.min(newAttempts, RETRY_DELAYS_SECONDS.length - 1)];
  const nextRetryAt = isDead
    ? null
    : new Date(now.getTime() + delaySeconds * 1000);

  await db
    .updateTable('arena_webhook_deliveries')
    .set({
      status: isDead ? 'dead' : 'failed',
      attempts: newAttempts,
      last_attempt_at: now,
      next_retry_at: nextRetryAt,
      response_status: responseStatus,
    })
    .where('id', '=', deliveryId)
    .execute();

  console.error(
    `[Webhook] Delivery ${deliveryId} to ${webhook.url} failed (attempt ${newAttempts}/${MAX_ATTEMPTS}).` +
    (isDead ? ' Marked dead.' : ` Next retry at ${nextRetryAt?.toISOString()}.`),
  );
}

/**
 * Process pending and failed webhook deliveries whose retry window has elapsed.
 *
 * Intended to be called periodically (e.g. every 60 s) by the server's
 * background task runner.
 */
export async function processWebhookRetries(): Promise<void> {
  const db = getDb();
  const now = new Date();

  const due = await db
    .selectFrom('arena_webhook_deliveries as d')
    .innerJoin('arena_webhooks as w', 'w.id', 'd.webhook_id')
    .where('d.status', 'in', ['pending', 'failed'])
    .where('d.next_retry_at', '<=', now)
    .where('d.attempts', '<', MAX_ATTEMPTS)
    .where('w.active', '=', true)
    .select([
      'd.id as delivery_id',
      'd.payload',
      'd.event_type',
      'd.attempts',
      'w.id as webhook_id',
      'w.url',
      'w.secret',
      'w.events',
      'w.active',
      'w.created_at',
    ])
    .execute();

  for (const row of due) {
    const webhook: Webhook = {
      id: row.webhook_id,
      url: row.url,
      secret: row.secret,
      events: row.events,
      active: row.active,
      created_at: row.created_at,
    };

    const body = JSON.stringify(row.payload);
    await attemptDelivery(row.delivery_id, webhook, body, row.event_type).catch(err =>
      console.error(`[Webhook] Retry failed for delivery ${row.delivery_id}:`, err),
    );
  }
}

/**
 * Dispatch an Arena event to all active webhook subscribers that have
 * registered interest in that event type.
 */
async function dispatchToWebhooks(event: ArenaEvent): Promise<void> {
  const db = getDb();
  const webhooks = await db
    .selectFrom('arena_webhooks')
    .where('active', '=', true)
    .selectAll()
    .execute();

  for (const webhook of webhooks) {
    if (webhook.events.includes(event.type)) {
      await deliverWebhook(webhook, event);
    }
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

// ── Webhook Dispatch ──
// All Arena events are fanned out to active DB-backed webhook subscribers.

for (const eventName of [
  'duel_created',
  'duel_accepted',
  'duel_settled',
  'gauntlet_created',
  'gauntlet_activated',
  'gauntlet_settled',
  'participant_registered',
  'reward_distributed',
  'prediction_made',
] as const) {
  arenaEvents.on(eventName, (event) => {
    dispatchToWebhooks(event).catch(err =>
      console.error('[Webhook] Dispatch failed:', err),
    );
  });
}
