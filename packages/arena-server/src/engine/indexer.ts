import { Queue, Worker, type Job } from 'bullmq';
import { getDb } from '../db/connection.js';
import { getAdrenaClient } from '../adrena/client.js';
import type { AdrenaPosition } from '../adrena/client.js';
import { sql } from 'kysely';

const QUEUE_NAME = 'position-indexer';

let indexerQueue: Queue | undefined;
let indexerWorker: Worker | undefined;

export function getIndexerQueue(redisUrl: string): Queue {
  if (!indexerQueue) {
    const opts = parseRedisUrl(redisUrl);
    indexerQueue = new Queue(QUEUE_NAME, { connection: opts });
  }
  return indexerQueue;
}

/**
 * Start indexing positions for a participant in a competition.
 */
export async function startIndexingParticipant(
  redisUrl: string,
  competitionId: string,
  userPubkey: string,
  intervalMs: number = 30_000
): Promise<void> {
  const queue = getIndexerQueue(redisUrl);
  const jobId = `index-${competitionId}-${userPubkey}`;

  // Remove existing repeatable job if any
  await queue.removeRepeatableByKey(`${jobId}:::${intervalMs}`).catch(() => {});

  await queue.add(
    'index-positions',
    { competitionId, userPubkey },
    {
      jobId,
      repeat: { every: intervalMs },
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );
}

/**
 * Stop indexing for a participant.
 */
export async function stopIndexingParticipant(
  redisUrl: string,
  competitionId: string,
  userPubkey: string
): Promise<void> {
  const queue = getIndexerQueue(redisUrl);
  // Remove all repeatable jobs for this participant
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.id === `index-${competitionId}-${userPubkey}`) {
      await queue.removeRepeatableByKey(job.key);
    }
  }
}

/**
 * Initialize the indexer worker.
 */
export function startIndexerWorker(redisUrl: string): Worker {
  if (indexerWorker) return indexerWorker;

  const opts = parseRedisUrl(redisUrl);

  indexerWorker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      switch (job.name) {
        case 'settle-duel': {
          const { duelId } = job.data;
          const { settleDuel } = await import('./duel.js');
          console.log(`[Worker] Settling duel ${duelId}`);
          await settleDuel(duelId);
          break;
        }
        case 'activate-gauntlet': {
          const { competitionId } = job.data;
          const { activateGauntlet } = await import('./gauntlet.js');
          console.log(`[Worker] Activating gauntlet ${competitionId}`);
          await activateGauntlet(competitionId);
          break;
        }
        case 'settle-gauntlet': {
          const { competitionId } = job.data;
          const { settleGauntlet } = await import('./gauntlet.js');
          console.log(`[Worker] Settling gauntlet ${competitionId}`);
          await settleGauntlet(competitionId);
          break;
        }
        case 'settle-gauntlet-round': {
          const { competitionId } = job.data;
          const { settleGauntletRound } = await import('./gauntlet.js');
          console.log(`[Worker] Settling gauntlet round for ${competitionId}`);
          await settleGauntletRound(competitionId);
          break;
        }
        case 'activate-gauntlet-round': {
          const { competitionId } = job.data;
          const { activateGauntletRound } = await import('./gauntlet.js');
          console.log(`[Worker] Activating gauntlet round for ${competitionId}`);
          await activateGauntletRound(competitionId);
          break;
        }
        case 'index-positions':
        default: {
          const { competitionId, userPubkey } = job.data;
          await indexParticipantPositions(competitionId, userPubkey);
          break;
        }
      }
    },
    {
      connection: opts,
      concurrency: 5,
      limiter: { max: 20, duration: 1000 }, // 20 jobs/sec
    }
  );

  indexerWorker.on('failed', (job, err) => {
    console.error(`[Indexer] Job ${job?.id} failed:`, err.message);
  });

  return indexerWorker;
}

/**
 * Calculate adaptive polling interval based on time remaining.
 * - Last 5 minutes: 10s (high frequency for exciting finishes)
 * - Last 30 minutes: 15s
 * - Normal: 30s (default)
 * - Idle (no trades in last 3 polls): 60s
 */
function getAdaptiveInterval(endTime: Date): number {
  const remaining = endTime.getTime() - Date.now();
  if (remaining <= 5 * 60_000) return 10_000;    // Last 5 min → 10s
  if (remaining <= 30 * 60_000) return 15_000;    // Last 30 min → 15s
  return 30_000;                                   // Default → 30s
}

/**
 * Index positions for a single participant in a competition.
 * Fetches from Adrena API and upserts into arena_trades.
 * Dynamically adjusts polling interval based on time remaining.
 */
async function indexParticipantPositions(
  competitionId: string,
  userPubkey: string
): Promise<void> {
  const db = getDb();
  const client = getAdrenaClient();

  // Get competition window
  const competition = await db
    .selectFrom('arena_competitions')
    .where('id', '=', competitionId)
    .where('status', 'in', ['active', 'settling'])
    .select(['start_time', 'end_time'])
    .executeTakeFirst();

  if (!competition) return; // Competition no longer active

  const startTime = new Date(competition.start_time);
  const endTime = new Date(competition.end_time);

  // Fetch positions from Adrena
  let positions: AdrenaPosition[];
  try {
    positions = await client.fetchPositions(userPubkey);
  } catch (err) {
    console.error(`[Indexer] Failed to fetch positions for ${userPubkey}:`, (err as Error).message);
    return;
  }

  if (positions.length === 0) {
    // No positions yet — normal for new wallets, don't spam logs
    return;
  }

  // Filter to closed positions within competition window
  const closedPositions = positions.filter(p => {
    if (p.status !== 'close' && p.status !== 'liquidated') return false;
    if (!p.entry_date || !p.exit_date) return false;
    const entry = new Date(p.entry_date);
    const exit = new Date(p.exit_date);
    return entry >= startTime && exit <= endTime;
  });

  // Upsert trades (idempotent)
  for (const pos of closedPositions) {
    await db
      .insertInto('arena_trades')
      .values({
        competition_id: competitionId,
        user_pubkey: userPubkey,
        position_id: pos.position_id,
        symbol: pos.symbol,
        side: pos.side,
        entry_price: pos.entry_price ?? null,
        exit_price: pos.exit_price ?? null,
        entry_size: pos.entry_size ?? null,
        collateral_usd: pos.collateral_amount ?? null,
        pnl_usd: pos.pnl ?? null,
        fees_usd: pos.fees ?? null,
        entry_date: pos.entry_date ? new Date(pos.entry_date) : null,
        exit_date: pos.exit_date ? new Date(pos.exit_date) : null,
        is_liquidated: pos.status === 'liquidated',
      })
      .onConflict(oc =>
        oc.columns(['competition_id', 'position_id']).doUpdateSet({
          exit_price: (eb) => eb.ref('excluded.exit_price'),
          pnl_usd: (eb) => eb.ref('excluded.pnl_usd'),
          fees_usd: (eb) => eb.ref('excluded.fees_usd'),
          exit_date: (eb) => eb.ref('excluded.exit_date'),
          is_liquidated: (eb) => eb.ref('excluded.is_liquidated'),
        })
      )
      .execute();
  }

  // Recalculate participant scores via aggregation query
  const scores = await db
    .selectFrom('arena_trades')
    .where('competition_id', '=', competitionId)
    .where('user_pubkey', '=', userPubkey)
    .where('exit_date', 'is not', null)
    .where('entry_date', '>=', startTime)
    .where('exit_date', '<=', endTime)
    .where('collateral_usd', '>=', 50)
    .where(sql`EXTRACT(EPOCH FROM (exit_date - entry_date))`, '>=', 60)
    .select([
      sql<number>`COALESCE(SUM(pnl_usd), 0)`.as('total_pnl'),
      sql<number>`COALESCE(SUM(collateral_usd), 0)`.as('total_collateral'),
      sql<number>`COALESCE(SUM(collateral_usd), 0)`.as('total_volume'),
      sql<number>`COUNT(*)`.as('total_trades'),
      sql<number>`COUNT(*) FILTER (WHERE pnl_usd > 0)`.as('wins'),
    ])
    .executeTakeFirst();

  if (scores) {
    const totalPnl = Number(scores.total_pnl);
    const totalCollateral = Number(scores.total_collateral);
    const totalTrades = Number(scores.total_trades);
    const wins = Number(scores.wins);
    const roi = totalCollateral > 0 ? (totalPnl / totalCollateral) * 100 : 0;
    const winRate = totalTrades > 0 ? wins / totalTrades : 0;

    // Compute arena_score from eligible trades for this competition window
    const { calculateArenaScore } = await import('./scoring.js');
    const eligibleTradesForScore = closedPositions.map(pos => ({
      pnl_usd: Number(pos.pnl) || 0,
      fees_usd: Number(pos.fees) || 0,
      collateral_usd: Number(pos.collateral_amount) || 0,
      entry_date: new Date(pos.entry_date!),
      exit_date: new Date(pos.exit_date!),
    }));
    const arenaScore = calculateArenaScore(eligibleTradesForScore);

    await db
      .updateTable('arena_participants')
      .set({
        pnl_usd: totalPnl,
        roi_percent: roi,
        total_volume_usd: Number(scores.total_volume),
        positions_closed: totalTrades,
        win_rate: winRate,
        arena_score: arenaScore,
        last_indexed_at: new Date(),
        updated_at: new Date(),
      })
      .where('competition_id', '=', competitionId)
      .where('user_pubkey', '=', userPubkey)
      .execute();
  }

  // Adaptive interval: reschedule with different frequency based on time remaining
  const newInterval = getAdaptiveInterval(endTime);
  const queue = indexerQueue;
  if (queue) {
    const jobId = `index-${competitionId}-${userPubkey}`;
    // Check if current repeatable job has a different interval
    const repeatableJobs = await queue.getRepeatableJobs();
    const currentJob = repeatableJobs.find(j => j.id === jobId);
    if (currentJob && Number(currentJob.every) !== newInterval) {
      // Remove old repeatable and add new one with updated interval
      await queue.removeRepeatableByKey(currentJob.key).catch(() => {});
      await queue.add(
        'index-positions',
        { competitionId, userPubkey },
        {
          jobId,
          repeat: { every: newInterval },
          removeOnComplete: 100,
          removeOnFail: 50,
        }
      );
    }
  }
}

/**
 * Schedule duel settlement as a delayed job.
 */
export async function scheduleDuelSettlement(
  redisUrl: string,
  duelId: string,
  settleAt: Date
): Promise<void> {
  const queue = getIndexerQueue(redisUrl);
  const delay = Math.max(0, settleAt.getTime() - Date.now());

  await queue.add(
    'settle-duel',
    { duelId },
    {
      jobId: `settle-${duelId}`,
      delay,
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

/**
 * Schedule gauntlet activation as a delayed job.
 */
export async function scheduleGauntletActivation(
  redisUrl: string,
  competitionId: string,
  activateAt: Date
): Promise<void> {
  const queue = getIndexerQueue(redisUrl);
  const delay = Math.max(0, activateAt.getTime() - Date.now());

  await queue.add(
    'activate-gauntlet',
    { competitionId },
    {
      jobId: `activate-gauntlet-${competitionId}`,
      delay,
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

/**
 * Schedule gauntlet settlement as a delayed job.
 */
export async function scheduleGauntletSettlement(
  redisUrl: string,
  competitionId: string,
  settleAt: Date
): Promise<void> {
  const queue = getIndexerQueue(redisUrl);
  const delay = Math.max(0, settleAt.getTime() - Date.now());

  await queue.add(
    'settle-gauntlet',
    { competitionId },
    {
      jobId: `settle-gauntlet-${competitionId}`,
      delay,
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

/**
 * Schedule a gauntlet round settlement as a delayed job.
 * Uses a timestamp-scoped jobId to avoid conflicts across rounds.
 */
export async function scheduleGauntletRoundSettlement(
  redisUrl: string,
  competitionId: string,
  settleAt: Date
): Promise<void> {
  const queue = getIndexerQueue(redisUrl);
  const delay = Math.max(0, settleAt.getTime() - Date.now());

  await queue.add(
    'settle-gauntlet-round',
    { competitionId },
    {
      jobId: `settle-round-${competitionId}-${Date.now()}`,
      delay,
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

/**
 * Schedule a gauntlet round activation (post-intermission) as a delayed job.
 * Uses a timestamp-scoped jobId to avoid conflicts across rounds.
 */
export async function scheduleGauntletRoundActivation(
  redisUrl: string,
  competitionId: string,
  activateAt: Date
): Promise<void> {
  const queue = getIndexerQueue(redisUrl);
  const delay = Math.max(0, activateAt.getTime() - Date.now());

  await queue.add(
    'activate-gauntlet-round',
    { competitionId },
    {
      jobId: `activate-round-${competitionId}-${Date.now()}`,
      delay,
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

// ── Helpers ──

function parseRedisUrl(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
  };
}

export async function closeIndexer(): Promise<void> {
  await indexerWorker?.close();
  await indexerQueue?.close();
  indexerWorker = undefined;
  indexerQueue = undefined;
}
