import { Queue, Worker, type Job } from 'bullmq';
import { getDb } from '../db/connection.js';
import { sql } from 'kysely';
import { adapters, arenaEvents } from '../adrena/integration.js';
import { env } from '../config.js';

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

      arenaEvents.emit('reward_distributed', {
        type: 'reward_distributed',
        timestamp: new Date(),
        payload: {
          competitionId,
          userPubkey: reward.user_pubkey,
          amount: Number(reward.amount),
          token: reward.token,
          rewardType: reward.reward_type,
        },
      });
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
 * Process a Mutagen reward through the configured Adrena adapter.
 */
async function processMutagenReward(reward: {
  id: number;
  competition_id: string | null;
  user_pubkey: string;
  amount: number;
  reward_type: string;
}): Promise<void> {
  const db = getDb();
  if (!adapters.mutagen) {
    if (env.NODE_ENV === 'production') {
      throw new Error('MUTAGEN_ADAPTER_NOT_CONFIGURED');
    }
  } else {
    await adapters.mutagen.awardMutagen(
      reward.user_pubkey,
      Number(reward.amount),
      reward.reward_type,
      { competitionId: reward.competition_id, rewardId: reward.id },
    );
  }

  const receipt = `${adapters.mutagen ? 'mutagen_api' : 'mutagen_local'}:${reward.id}:${Date.now()}`;

  await db
    .updateTable('arena_rewards')
    .set({ tx_signature: receipt })
    .where('id', '=', reward.id)
    .where('tx_signature', 'is', null) // Idempotent check
    .execute();

  console.log(
    `[Rewards] Mutagen reward processed: ${reward.amount} to ${reward.user_pubkey} (${reward.reward_type})`
  );
}

/**
 * Process a token reward (SPL transfer).
 * Token rewards must have a real transfer path. We only auto-close protocol fee
 * records because those are settled on-chain during escrow settlement itself.
 */
async function processTokenReward(reward: {
  id: number;
  competition_id: string | null;
  user_pubkey: string;
  amount: number;
  token: string;
  reward_type: string;
}): Promise<void> {
  const db = getDb();

  if (reward.reward_type === 'protocol_fee') {
    const receipt = `onchain_fee_recorded:${reward.competition_id ?? reward.id}:${Date.now()}`;
    await db
      .updateTable('arena_rewards')
      .set({ tx_signature: receipt })
      .where('id', '=', reward.id)
      .where('tx_signature', 'is', null)
      .execute();
    console.log(`[Rewards] Protocol fee recorded: ${reward.amount} ${reward.token}`);
    return;
  }
  throw new Error(`TOKEN_REWARD_TRANSFER_NOT_IMPLEMENTED:${reward.token}`);
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
