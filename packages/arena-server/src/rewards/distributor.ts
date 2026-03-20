import { Queue, Worker, type Job } from 'bullmq';
import { getDb } from '../db/connection.js';
import { sql } from 'kysely';

const QUEUE_NAME = 'reward-distributor';

let rewardQueue: Queue | undefined;
let rewardWorker: Worker | undefined;

function parseRedisUrl(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
  };
}

export function getRewardQueue(redisUrl: string): Queue {
  if (!rewardQueue) {
    const opts = parseRedisUrl(redisUrl);
    rewardQueue = new Queue(QUEUE_NAME, { connection: opts });
  }
  return rewardQueue;
}

/**
 * Schedule reward processing for a competition.
 */
export async function scheduleRewardProcessing(
  redisUrl: string,
  competitionId: string
): Promise<void> {
  const queue = getRewardQueue(redisUrl);
  await queue.add(
    'process-rewards',
    { competitionId },
    {
      jobId: `rewards-${competitionId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

/**
 * Start the reward distributor worker.
 */
export function startRewardWorker(redisUrl: string): Worker {
  if (rewardWorker) return rewardWorker;

  const opts = parseRedisUrl(redisUrl);

  rewardWorker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { competitionId } = job.data;
      await processCompetitionRewards(competitionId);
    },
    {
      connection: opts,
      concurrency: 2,
    }
  );

  rewardWorker.on('completed', (job) => {
    console.log(`[Rewards] Job ${job.id} completed`);
  });

  rewardWorker.on('failed', (job, err) => {
    console.error(`[Rewards] Job ${job?.id} failed:`, err.message);
  });

  console.log('[Rewards] Worker started');
  return rewardWorker;
}

/**
 * Process all pending rewards for a competition.
 * For each reward without a tx_signature:
 * - Staked duels (ADX/USDC): Log the transfer intent (actual SPL transfer
 *   requires server keypair, implemented in escrow program)
 * - Honor duels (MUTAGEN): Record Mutagen points directly
 */
async function processCompetitionRewards(competitionId: string): Promise<void> {
  const db = getDb();

  // Get all unprocessed rewards for this competition
  const rewards = await db
    .selectFrom('arena_rewards')
    .where('competition_id', '=', competitionId)
    .where('tx_signature', 'is', null)
    .selectAll()
    .execute();

  if (rewards.length === 0) {
    console.log(`[Rewards] No pending rewards for competition ${competitionId}`);
    return;
  }

  for (const reward of rewards) {
    try {
      if (reward.token === 'MUTAGEN') {
        // Mutagen rewards: mark as processed with a sentinel signature
        await processMutagenReward(reward);
      } else {
        // Token rewards (ADX, USDC): process SPL transfer
        await processTokenReward(reward);
      }
    } catch (err) {
      console.error(
        `[Rewards] Failed to process reward ${reward.id}:`,
        (err as Error).message
      );
      // Don't rethrow — process remaining rewards
    }
  }
}

/**
 * Process a Mutagen reward (off-chain points).
 * In production, this would call Adrena's Mutagen API.
 */
async function processMutagenReward(reward: {
  id: number;
  user_pubkey: string;
  amount: number;
  reward_type: string;
}): Promise<void> {
  const db = getDb();

  // Mark as processed with a sentinel "mutagen:" prefix signature
  // This prevents double-processing while indicating it's a Mutagen reward
  const sentinel = `mutagen:${reward.id}:${Date.now()}`;

  await db
    .updateTable('arena_rewards')
    .set({ tx_signature: sentinel })
    .where('id', '=', reward.id)
    .where('tx_signature', 'is', null) // Idempotent check
    .execute();

  console.log(
    `[Rewards] Mutagen reward processed: ${reward.amount} to ${reward.user_pubkey} (${reward.reward_type})`
  );
}

/**
 * Process a token reward (SPL transfer).
 * In the prototype, this logs the intent and marks as processed.
 * In production, this calls the Anchor escrow program's settle instruction.
 */
async function processTokenReward(reward: {
  id: number;
  user_pubkey: string;
  amount: number;
  token: string;
  reward_type: string;
}): Promise<void> {
  const db = getDb();

  // Protocol fee rewards don't need a transfer
  if (reward.reward_type === 'protocol_fee') {
    const sentinel = `protocol_fee:${reward.id}:${Date.now()}`;
    await db
      .updateTable('arena_rewards')
      .set({ tx_signature: sentinel })
      .where('id', '=', reward.id)
      .where('tx_signature', 'is', null)
      .execute();
    console.log(`[Rewards] Protocol fee recorded: ${reward.amount} ${reward.token}`);
    return;
  }

  // In production: execute SPL transfer via escrow program
  // For prototype: simulate the transfer
  console.log(
    `[Rewards] Token transfer pending: ${reward.amount} ${reward.token} to ${reward.user_pubkey}`
  );

  // Simulate transaction signature (in production, this comes from the blockchain)
  const simulatedTxSig = `sim_${reward.id}_${Date.now().toString(36)}`;

  // Mark as processed — the tx_signature column's UNIQUE constraint
  // prevents double-payment even if the worker crashes and retries
  await db
    .updateTable('arena_rewards')
    .set({ tx_signature: simulatedTxSig })
    .where('id', '=', reward.id)
    .where('tx_signature', 'is', null) // Critical: idempotent check
    .execute();

  console.log(
    `[Rewards] Token reward processed: ${reward.amount} ${reward.token} to ${reward.user_pubkey} (tx: ${simulatedTxSig})`
  );
}

/**
 * Get count of unprocessed rewards.
 */
export async function getUnprocessedRewardCount(): Promise<number> {
  const db = getDb();
  const result = await db
    .selectFrom('arena_rewards')
    .where('tx_signature', 'is', null)
    .select(sql<number>`COUNT(*)`.as('count'))
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

/**
 * Gracefully close the reward worker.
 */
export async function closeRewardWorker(): Promise<void> {
  await rewardWorker?.close();
  await rewardQueue?.close();
  rewardWorker = undefined;
  rewardQueue = undefined;
}
