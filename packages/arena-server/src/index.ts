import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { WebSocketServer, type WebSocket } from 'ws';
import { createServer } from 'http';
import { env } from './config.js';
import { duelRouter } from './routes/duels.js';
import { competitionRouter } from './routes/competitions.js';
import { userRouter } from './routes/users.js';
import { clanRouter } from './routes/clans.js';
import { adminRouter } from './routes/admin.js';
import { generalLimiter } from './middleware/rate-limit.js';
import { getDb, closeDb } from './db/connection.js';
import { startIndexerWorker, closeIndexer } from './engine/indexer.js';
import { startRewardWorker, closeRewardWorker } from './rewards/distributor.js';
import { closeAuthRedis } from './middleware/auth.js';
import { expireStaleDuels } from './engine/duel.js';
import { initDiscordBot, destroyDiscordBot, postDuelChallenge, postDuelAccepted, postDuelResult } from './discord/bot.js';
import { arenaEvents, setAdapter } from './adrena/integration.js';
import { MutagenAdapterImpl } from './adrena/adapters/mutagen.js';
import { LeaderboardAdapterImpl } from './adrena/adapters/leaderboard.js';
import { QuestAdapterImpl } from './adrena/adapters/quest.js';
import { StreakAdapterImpl } from './adrena/adapters/streak.js';

const app = express();

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(generalLimiter);

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    const db = getDb();
    await db.selectFrom('arena_seasons').select('id').limit(1).execute();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

// API routes
app.use('/api/arena/duels', duelRouter);
app.use('/api/arena/competitions', competitionRouter);
app.use('/api/arena/users', userRouter);
app.use('/api/arena/clans', clanRouter);
app.use('/api/admin', adminRouter);

// Challenge card image endpoint (placeholder — will be replaced with satori)
app.get('/api/arena/challenge/:id/card.png', async (req, res) => {
  try {
    const db = getDb();
    const duel = await db
      .selectFrom('arena_duels')
      .where('id', '=', req.params.id)
      .selectAll()
      .executeTakeFirst();

    if (!duel) {
      res.status(404).json({ error: 'Duel not found' });
      return;
    }

    // Generate card using satori (imported lazily)
    try {
      const { generateChallengeCard } = await import('./cards/challenge-card.js');
      const pngBuffer = await generateChallengeCard(duel);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(pngBuffer);
    } catch {
      // Fallback: return JSON if card generation fails
      res.json({
        challenger: duel.challenger_pubkey,
        defender: duel.defender_pubkey,
        asset: duel.asset_symbol,
        duration: duel.duration_hours,
        stake: duel.is_honor_duel ? 'Honor Duel' : `${duel.stake_amount} ${duel.stake_token}`,
      });
    }
  } catch (err) {
    console.error('[Card] Generation error:', err);
    res.status(500).json({ error: 'Card generation failed' });
  }
});

// Create HTTP server
const server = createServer(app);

// WebSocket for live duel updates
const wss = new WebSocketServer({ server, path: '/ws/duels' });

const duelSubscriptions = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws: WebSocket) => {
  let subscribedDuelId: string | null = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'subscribe' && msg.duelId) {
        // Unsubscribe from previous
        if (subscribedDuelId) {
          duelSubscriptions.get(subscribedDuelId)?.delete(ws);
        }
        subscribedDuelId = msg.duelId;
        if (!duelSubscriptions.has(msg.duelId)) {
          duelSubscriptions.set(msg.duelId, new Set());
        }
        duelSubscriptions.get(msg.duelId)!.add(ws);
        ws.send(JSON.stringify({ type: 'subscribed', duelId: msg.duelId }));
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    if (subscribedDuelId) {
      duelSubscriptions.get(subscribedDuelId)?.delete(ws);
    }
  });
});

// Broadcast duel update to all subscribers
export function broadcastDuelUpdate(duelId: string, data: unknown): void {
  const subs = duelSubscriptions.get(duelId);
  if (!subs) return;
  const msg = JSON.stringify({ type: 'duel_update', duelId, data });
  for (const ws of subs) {
    if (ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  }
}

// Background jobs
let expireInterval: ReturnType<typeof setInterval>;

async function startBackgroundJobs() {
  // Start indexer worker
  try {
    startIndexerWorker(env.REDIS_URL);
    console.log('[Worker] Indexer started');
  } catch (err) {
    console.warn('[Worker] Failed to start indexer (Redis may be unavailable):', (err as Error).message);
  }

  // Start reward distributor worker
  try {
    startRewardWorker(env.REDIS_URL);
    console.log('[Worker] Reward distributor started');
  } catch (err) {
    console.warn('[Worker] Failed to start reward worker:', (err as Error).message);
  }

  // Initialize Discord bot
  try {
    await initDiscordBot();
  } catch (err) {
    console.warn('[Discord] Failed to initialize:', (err as Error).message);
  }

  // Register Adrena adapters
  setAdapter('mutagen', new MutagenAdapterImpl());
  setAdapter('leaderboard', new LeaderboardAdapterImpl());
  setAdapter('quest', new QuestAdapterImpl());
  setAdapter('streak', new StreakAdapterImpl());
  console.log('[Arena] Adrena adapters registered');

  // Wire arena events to Discord notifications
  arenaEvents.on('duel_created', (event) => {
    const p = event.payload;
    postDuelChallenge({
      id: p.duelId,
      challenger_pubkey: p.challengerPubkey,
      defender_pubkey: p.defenderPubkey || null,
      asset_symbol: p.assetSymbol,
      stake_amount: p.stakeAmount,
      stake_token: p.stakeToken,
      is_honor_duel: p.isHonorDuel,
      duration_hours: p.durationHours,
    }).catch(() => {});
  });

  arenaEvents.on('duel_accepted', (event) => {
    const p = event.payload;
    postDuelAccepted({
      id: p.duelId,
      challenger_pubkey: p.challengerPubkey,
      defender_pubkey: p.defenderPubkey,
      asset_symbol: '', // Not in event payload, Discord embed handles gracefully
      duration_hours: 0,
    }).catch(() => {});
  });

  arenaEvents.on('duel_settled', (event) => {
    const p = event.payload;
    postDuelResult({
      id: p.duelId,
      challenger_pubkey: '', // Fetched from duel in production
      defender_pubkey: null,
      asset_symbol: '',
      winner_pubkey: p.winnerPubkey,
      challenger_roi: p.challengerROI,
      defender_roi: p.defenderROI,
      is_honor_duel: false,
      stake_amount: 0,
      stake_token: 'ADX',
    }).catch(() => {});
  });

  // Expire stale duels every minute
  expireInterval = setInterval(async () => {
    try {
      const count = await expireStaleDuels();
      if (count > 0) console.log(`[Cleanup] Expired ${count} stale duels`);
    } catch (err) {
      console.error('[Cleanup] Expire error:', err);
    }
  }, 60_000);
}

// Graceful shutdown
async function shutdown() {
  console.log('\nShutting down...');
  clearInterval(expireInterval);
  await closeIndexer();
  await closeRewardWorker();
  await closeAuthRedis();
  await destroyDiscordBot();
  server.close();
  await closeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start
server.listen(env.PORT, () => {
  console.log(`\n[Arena] AdrenaX Arena API running on port ${env.PORT}`);
  console.log(`   Health: http://localhost:${env.PORT}/api/health`);
  console.log(`   Duels:  http://localhost:${env.PORT}/api/arena/duels`);
  console.log(`   WS:     ws://localhost:${env.PORT}/ws/duels\n`);
  startBackgroundJobs();
});

export { app, server };
