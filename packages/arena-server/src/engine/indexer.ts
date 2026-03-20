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
      const { competitionId, userPubkey } = job.data;
      await indexParticipantPositions(competitionId, userPubkey);
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
 * Index positions for a single participant in a competition.
 * Fetches from Adrena API and upserts into arena_trades.
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
    console.error(`[Indexer] Failed to fetch positions for ${userPubkey}:`, err);
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
        entry_size: pos.size ?? null,
        collateral_usd: pos.collateral_usd ?? pos.collateral_amount ?? null,
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

    await db
      .updateTable('arena_participants')
      .set({
        pnl_usd: totalPnl,
        roi_percent: roi,
        total_volume_usd: Number(scores.total_volume),
        positions_closed: totalTrades,
        win_rate: winRate,
        last_indexed_at: new Date(),
        updated_at: new Date(),
      })
      .where('competition_id', '=', competitionId)
      .where('user_pubkey', '=', userPubkey)
      .execute();
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
