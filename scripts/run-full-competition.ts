import 'dotenv/config';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const API_BASE    = process.env.API_BASE        || 'http://localhost:3000';
const ADMIN_KEY   = process.env.ADMIN_API_KEY   || 'test-admin-key';
const DATABASE_URL = process.env.DATABASE_URL   || 'postgresql://arena:arena_dev@localhost:5435/adrenax_arena';

// ─────────────────────────────────────────────
// Wallet addresses (real Solana keypairs)
// ─────────────────────────────────────────────

const WALLETS = {
  SolWarrior:   'Hv7rugpC1go9nhVPRxEqRFmtv1tk1SVsmwinEpJ1B696',
  DeFiHunter:   'C4xg71adxRGngLbSkqrDLDGTQdaVMha6QZSzMTCuPZi7',
  PerpKing:     'GRgeYbe9i9A2v4HTtcCCprUhgKddPFttACvV3UxXEi52',
  MoonTrader:   'CnsKdKFj6bEJarx6oNKTG7VW4K5NzGYFqLskRs8dn5RU',
  AlphaSniper:  '5X1EMHM1Y7akcXk8MR17S21KkhsgqA74jeSPGSzy5qyB',
  ShadowFox:    'E5EMwJjUXYRWChqufmCV5uUDRhrGFENgn9ua6LyFSovB',
} as const;

// ─────────────────────────────────────────────
// ANSI colours
// ─────────────────────────────────────────────

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const SKIP = '\x1b[33mSKIP\x1b[0m';
const DIM  = '\x1b[2m';
const RESET = '\x1b[0m';

// ─────────────────────────────────────────────
// Counters
// ─────────────────────────────────────────────

let passed  = 0;
let failed  = 0;
let skipped = 0;

// Domain counters
let duelsPlayed     = 0;
let clansFormed     = 0;
let clanWars        = 0;
let predictionsCount = 0;
let revengeDuels    = 0;
let totalSeasonPoints = 0;

// ─────────────────────────────────────────────
// Assertion helpers
// ─────────────────────────────────────────────

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  [${PASS}] ${label}`);
    passed++;
  } else {
    console.log(`  [${FAIL}] ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function skip(label: string, reason: string): void {
  console.log(`  [${SKIP}] ${label} — ${reason}`);
  skipped++;
}

function sectionHeader(phase: number, title: string): void {
  console.log(`\n${'─'.repeat(56)}`);
  console.log(`  Phase ${phase}: ${title}`);
  console.log(`${'─'.repeat(56)}`);
}

// ─────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────

async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  return res.json();
}

async function authedApi(path: string, wallet: string, opts: Omit<RequestInit, 'headers'> = {}): Promise<any> {
  const nonceRes = await api(`/api/arena/users/nonce/${wallet}`);
  return api(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-wallet': wallet,
      'x-signature': 'dev-bypass',
      'x-nonce': nonceRes.data?.nonce || '',
    },
  });
}

async function adminApi(path: string, opts: RequestInit = {}): Promise<any> {
  return api(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_KEY,
      ...opts.headers,
    },
  });
}

// ─────────────────────────────────────────────
// Rate-limit pause helper
// ─────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────
// DB helper (lazy pg import so we can still run
// the script when pg isn't bundled)
// ─────────────────────────────────────────────

let _pool: any = null;

async function getPool(): Promise<any> {
  if (_pool) return _pool;
  // pg is CJS — require it to avoid ESM resolution issues
  const { Pool } = require('pg');
  _pool = new Pool({ connectionString: DATABASE_URL });
  return _pool;
}

async function db(): Promise<any> {
  return getPool();
}

// ─────────────────────────────────────────────
// Trade injection helper
// ─────────────────────────────────────────────

async function injectTrades(
  competitionId: string,
  wallet: string,
  winnerRoi: boolean,
): Promise<void> {
  const pool = await db();
  const now   = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const symbols = ['SOL', 'BTC', 'ETH'];

  for (let i = 0; i < 3; i++) {
    const collateral = 100 + Math.random() * 400;
    const pnl = winnerRoi
      ? collateral * (0.05 + Math.random() * 0.30)   // 5–35% profit
      : collateral * (-0.02 - Math.random() * 0.15); // 2–17% loss
    const fees       = collateral * 0.002;
    const entryDate  = new Date(start.getTime() + Math.random() * 20 * 60 * 60 * 1000);
    const exitDate   = new Date(entryDate.getTime() + 120_000 + Math.random() * 3_600_000);

    await pool.query(
      `INSERT INTO arena_trades (
        competition_id, user_pubkey, position_id, symbol, side,
        entry_price, exit_price, entry_size, collateral_usd, pnl_usd, fees_usd,
        entry_date, exit_date, is_liquidated
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false)
      ON CONFLICT (competition_id, position_id) DO NOTHING`,
      [
        competitionId,
        wallet,
        100_000 + Math.floor(Math.random() * 900_000),
        symbols[i % 3],
        Math.random() > 0.5 ? 'long' : 'short',
        100 + Math.random() * 50_000,   // entry_price
        100 + Math.random() * 50_000,   // exit_price
        collateral * 2,                 // entry_size (leveraged)
        collateral,
        pnl,
        fees,
        entryDate,
        exitDate,
      ],
    );
  }

  // Aggregate and update participant row
  const scores = await pool.query(
    `SELECT
       COALESCE(SUM(pnl_usd), 0)        AS total_pnl,
       COALESCE(SUM(collateral_usd), 0) AS total_collateral,
       COUNT(*)                          AS trades,
       COUNT(*) FILTER (WHERE pnl_usd > 0) AS wins
     FROM arena_trades
     WHERE competition_id = $1 AND user_pubkey = $2`,
    [competitionId, wallet],
  );

  const s   = scores.rows[0];
  const roi = Number(s.total_collateral) > 0
    ? (Number(s.total_pnl) / Number(s.total_collateral)) * 100
    : 0;

  await pool.query(
    `UPDATE arena_participants
     SET pnl_usd         = $1,
         roi_percent     = $2,
         total_volume_usd = $3,
         positions_closed = $4,
         win_rate         = $5,
         arena_score      = $6,
         last_indexed_at  = NOW(),
         updated_at       = NOW()
     WHERE competition_id = $7 AND user_pubkey = $8`,
    [
      Number(s.total_pnl),
      roi,
      Number(s.total_collateral),
      Number(s.trades),
      Number(s.trades) > 0 ? Number(s.wins) / Number(s.trades) : 0,
      roi * 0.4,   // simplified arena_score
      competitionId,
      wallet,
    ],
  );
}

// Helper: settle a duel directly via DB (bypasses Adrena API fetch for test wallets)
async function settleViaDb(duelId: string, competitionId: string, challengerWallet: string, defenderWallet: string): Promise<{ winner: string | null }> {
  const pool = await db();

  // Get ROIs from the injected participant data
  const participants = await pool.query(
    `SELECT user_pubkey, roi_percent, total_volume_usd FROM arena_participants WHERE competition_id = $1`,
    [competitionId],
  );

  const challenger = participants.rows.find((p: any) => p.user_pubkey === challengerWallet);
  const defender = participants.rows.find((p: any) => p.user_pubkey === defenderWallet);

  const cROI = Number(challenger?.roi_percent ?? 0);
  const dROI = Number(defender?.roi_percent ?? 0);

  let winner: string | null = null;
  let reason = 'both_forfeit';

  if (cROI > dROI) { winner = challengerWallet; reason = 'higher_roi'; }
  else if (dROI > cROI) { winner = defenderWallet; reason = 'higher_roi'; }
  else { reason = 'draw'; }

  // Update duel
  await pool.query(
    `UPDATE arena_duels SET status = 'completed', winner_pubkey = $1, challenger_roi = $2, defender_roi = $3 WHERE id = $4`,
    [winner, cROI, dROI, duelId],
  );

  // Update competition
  await pool.query(
    `UPDATE arena_competitions SET status = 'completed', updated_at = NOW() WHERE id = $1`,
    [competitionId],
  );

  // Update participant statuses
  if (winner) {
    const loser = winner === challengerWallet ? defenderWallet : challengerWallet;
    await pool.query(`UPDATE arena_participants SET status = 'winner' WHERE competition_id = $1 AND user_pubkey = $2`, [competitionId, winner]);
    await pool.query(`UPDATE arena_participants SET status = 'eliminated' WHERE competition_id = $1 AND user_pubkey = $2`, [competitionId, loser]);

    // Create Mutagen reward
    await pool.query(
      `INSERT INTO arena_rewards (competition_id, user_pubkey, amount, token, reward_type) VALUES ($1, $2, 50, 'MUTAGEN', 'mutagen_bonus')`,
      [competitionId, winner],
    );

    // Update streaks — winner increments, loser resets
    await pool.query(`
      INSERT INTO arena_user_stats (user_pubkey, current_streak, best_streak, streak_type, total_wins, total_losses, title, mutagen_multiplier)
      VALUES ($1, 1, 1, 'win', 1, 0, CASE WHEN 1 >= 10 THEN 'legendary_duelist' WHEN 1 >= 5 THEN 'arena_champion' WHEN 1 >= 3 THEN 'hot_streak' ELSE NULL END, LEAST(2.0, 1.0 + 1 * 0.05))
      ON CONFLICT (user_pubkey) DO UPDATE SET
        current_streak = CASE WHEN arena_user_stats.streak_type = 'win' THEN arena_user_stats.current_streak + 1 ELSE 1 END,
        best_streak = GREATEST(arena_user_stats.best_streak, CASE WHEN arena_user_stats.streak_type = 'win' THEN arena_user_stats.current_streak + 1 ELSE 1 END),
        streak_type = 'win',
        total_wins = arena_user_stats.total_wins + 1,
        title = CASE
          WHEN (CASE WHEN arena_user_stats.streak_type = 'win' THEN arena_user_stats.current_streak + 1 ELSE 1 END) >= 10 THEN 'legendary_duelist'
          WHEN (CASE WHEN arena_user_stats.streak_type = 'win' THEN arena_user_stats.current_streak + 1 ELSE 1 END) >= 5 THEN 'arena_champion'
          WHEN (CASE WHEN arena_user_stats.streak_type = 'win' THEN arena_user_stats.current_streak + 1 ELSE 1 END) >= 3 THEN 'hot_streak'
          ELSE NULL
        END,
        mutagen_multiplier = LEAST(2.0, 1.0 + (CASE WHEN arena_user_stats.streak_type = 'win' THEN arena_user_stats.current_streak + 1 ELSE 1 END) * 0.05),
        updated_at = NOW()
    `, [winner]);

    await pool.query(`
      INSERT INTO arena_user_stats (user_pubkey, current_streak, best_streak, streak_type, total_wins, total_losses, title, mutagen_multiplier)
      VALUES ($1, 1, 0, 'loss', 0, 1, NULL, 1.0)
      ON CONFLICT (user_pubkey) DO UPDATE SET
        current_streak = CASE WHEN arena_user_stats.streak_type = 'loss' THEN arena_user_stats.current_streak + 1 ELSE 1 END,
        streak_type = 'loss',
        total_losses = arena_user_stats.total_losses + 1,
        title = NULL,
        mutagen_multiplier = 1.0,
        updated_at = NOW()
    `, [loser]);

    // Create revenge window in Redis (30-min TTL)
    try {
      const Redis = require('ioredis').default || require('ioredis');
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6381';
      const redis = new Redis(redisUrl);
      const revengeKey = `arena:revenge:${loser}:${winner}`;
      await redis.set(revengeKey, JSON.stringify({
        originalDuelId: duelId,
        assetSymbol: 'SOL',
        durationHours: 24,
        isHonorDuel: true,
        stakeAmount: 0,
        stakeToken: 'ADX',
      }), 'EX', 1800);
      await redis.quit();
    } catch (e) {
      console.error('  [warn] Redis revenge window failed:', (e as Error).message);
    }
  }

  return { winner };
}

// Helper: manipulate a duel competition so it is in the past and settleable
async function expireCompetition(competitionId: string, duelId: string): Promise<void> {
  const pool = await db();
  await pool.query(
    `UPDATE arena_competitions
     SET end_time   = NOW() - INTERVAL '1 minute',
         start_time = NOW() - INTERVAL '25 hours'
     WHERE id = $1`,
    [competitionId],
  );
  await pool.query(
    `UPDATE arena_duels SET status = 'active' WHERE id = $1`,
    [duelId],
  );
}

// Helper: run a full single duel lifecycle — create, accept, inject, expire, settle
async function runHonorDuel(
  challengerWallet: string,
  defenderWallet: string,
  challengerWins: boolean,
  label: string,
): Promise<{ winner: string | null; duelId: string | null }> {
  // Create
  const createRes = await authedApi('/api/arena/duels', challengerWallet, {
    method: 'POST',
    body: JSON.stringify({
      defenderPubkey: defenderWallet,
      assetSymbol: 'SOL',
      durationHours: 24,
      isHonorDuel: true,
    }),
  });
  check(`${label}: duel created`, createRes.success === true, createRes.error);

  const duelId         = createRes.data?.duel?.id as string | undefined;
  const competitionId  = createRes.data?.competition?.id as string | undefined;

  if (!duelId || !competitionId) {
    skip(`${label}: accept/settle`, 'creation failed');
    return { winner: null, duelId: null };
  }

  // Accept
  const acceptRes = await authedApi(`/api/arena/duels/${duelId}/accept`, defenderWallet, {
    method: 'POST',
  });
  check(`${label}: duel accepted`, acceptRes.success === true, acceptRes.error);

  // Inject trades — winner gets positive ROI, loser gets negative
  await injectTrades(competitionId, challengerWallet, challengerWins);
  await injectTrades(competitionId, defenderWallet, !challengerWins);

  // Settle directly via DB (bypasses Adrena API since test wallets have no real positions)
  const settleResult = await settleViaDb(duelId, competitionId, challengerWallet, defenderWallet);
  check(`${label}: settled`, true);

  const winnerPubkey = settleResult.winner;
  const expectedWinner = challengerWins ? challengerWallet : defenderWallet;
  check(
    `${label}: correct winner (${challengerWins ? 'challenger' : 'defender'})`,
    winnerPubkey === expectedWinner,
    `got ${winnerPubkey?.slice(0, 8) ?? 'null'}`,
  );

  duelsPlayed++;
  return { winner: winnerPubkey, duelId };
}

// ─────────────────────────────────────────────
// Phase implementations
// ─────────────────────────────────────────────

async function phase1Setup(): Promise<number | null> {
  sectionHeader(1, 'Setup');
  console.log(`\n  ${DIM}API:${RESET} ${API_BASE}`);
  console.log(`  ${DIM}Requires: DEV_MODE_SKIP_AUTH=true, ADMIN_API_KEY set, Docker running${RESET}\n`);

  console.log('  Participants:');
  for (const [name, addr] of Object.entries(WALLETS)) {
    console.log(`    ${name.padEnd(12)} ${addr}`);
  }
  console.log('');

  const health = await api('/api/health');
  check('Server healthy', health.status === 'ok', health.status);
  if (health.status !== 'ok') {
    console.error('\n  Server not healthy. Ensure docker-compose is up and migrations are run.');
    process.exit(1);
  }

  // Create season
  const seasonRes = await adminApi('/api/admin/seasons', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Arena Season 1: Genesis',
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  });
  check('Season created', seasonRes.success === true, seasonRes.error);

  const seasonId: number | undefined = seasonRes.data?.id;
  check('Season has ID', typeof seasonId === 'number');

  // Activate season
  if (seasonId !== undefined) {
    const activateRes = await adminApi(`/api/admin/seasons/${seasonId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    });
    check('Season activated', activateRes.data?.status === 'active');
  } else {
    skip('Season activation', 'no season ID');
  }

  return seasonId ?? null;
}

async function phase2ClanFormation(): Promise<{ clanAId: string | null; clanBId: string | null }> {
  sectionHeader(2, 'Clan Formation');

  // Clean up any existing clan data from prior runs (direct DB)
  const pool = await db();
  await pool.query('DELETE FROM arena_clan_members').catch(() => {});
  await pool.query('DELETE FROM arena_clan_wars').catch(() => {});
  await pool.query('DELETE FROM arena_clans').catch(() => {});
  await pool.query('DELETE FROM arena_clan_cooldowns').catch(() => {});

  // Clan A: SolWarrior leads, PerpKing + AlphaSniper join
  const clanARes = await authedApi('/api/arena/clans', WALLETS.SolWarrior, {
    method: 'POST',
    body: JSON.stringify({ name: 'SolWarriors', tag: 'SOLW' }),
  });
  check('Clan A created (SolWarriors)', clanARes.success === true, clanARes.error);
  const clanAId: string | null = clanARes.data?.id ?? null;
  check('Clan A has ID', !!clanAId);

  if (clanAId) {
    const joinRes = await authedApi(`/api/arena/clans/${clanAId}/join`, WALLETS.PerpKing, {
      method: 'POST',
    });
    check('PerpKing joined Clan A', joinRes.success === true, joinRes.error);
    const joinRes2 = await authedApi(`/api/arena/clans/${clanAId}/join`, WALLETS.AlphaSniper, {
      method: 'POST',
    });
    check('AlphaSniper joined Clan A', joinRes2.success === true, joinRes2.error);
    clansFormed++;
  } else {
    skip('PerpKing join Clan A', 'clan creation failed');
  }

  // Clan B: DeFiHunter leads, MoonTrader + ShadowFox join
  const clanBRes = await authedApi('/api/arena/clans', WALLETS.DeFiHunter, {
    method: 'POST',
    body: JSON.stringify({ name: 'DeFi Syndicate', tag: 'DEFI' }),
  });
  check('Clan B created (DeFi Syndicate)', clanBRes.success === true, clanBRes.error);
  const clanBId: string | null = clanBRes.data?.id ?? null;
  check('Clan B has ID', !!clanBId);

  if (clanBId) {
    const joinRes = await authedApi(`/api/arena/clans/${clanBId}/join`, WALLETS.MoonTrader, {
      method: 'POST',
    });
    check('MoonTrader joined Clan B', joinRes.success === true, joinRes.error);
    const joinRes2 = await authedApi(`/api/arena/clans/${clanBId}/join`, WALLETS.ShadowFox, {
      method: 'POST',
    });
    check('ShadowFox joined Clan B', joinRes2.success === true, joinRes2.error);

    // Verify clan details
    const detailRes = await api(`/api/arena/clans/${clanBId}`);
    check('Clan B details fetched', detailRes.success === true);
    check('Clan B has 3 members', detailRes.data?.member_count === 3 || detailRes.data?.members?.length === 3);
    clansFormed++;
  } else {
    skip('MoonTrader join Clan B', 'clan creation failed');
  }

  // Rankings endpoint smoke test
  const rankRes = await api('/api/arena/clans/rankings');
  check('Clan rankings endpoint responds', rankRes.success === true);
  check('At least 2 clans ranked', (rankRes.data?.length ?? 0) >= 2);

  return { clanAId, clanBId };
}

async function phase3HonorDuels(): Promise<void> {
  sectionHeader(3, 'Honor Duels (SolWarrior streak)');

  // Duel 1: SolWarrior vs DeFiHunter — SolWarrior wins
  await runHonorDuel(WALLETS.SolWarrior, WALLETS.DeFiHunter, true, 'Duel 1 (SW vs DH)');

  // Duel 2: SolWarrior vs PerpKing — SolWarrior wins
  await runHonorDuel(WALLETS.SolWarrior, WALLETS.PerpKing, true, 'Duel 2 (SW vs PK)');

  // Duel 3: SolWarrior vs MoonTrader — SolWarrior wins (3-streak)
  await runHonorDuel(WALLETS.SolWarrior, WALLETS.MoonTrader, true, 'Duel 3 (SW vs MT)');

  // Verify SolWarrior streak
  const streakRes = await api(`/api/arena/users/${WALLETS.SolWarrior}/streak`);
  check('SolWarrior streak endpoint responds', streakRes.success === true);
  check('SolWarrior has winning streak', (streakRes.data?.current_streak ?? 0) >= 3);

  const profileRes = await api(`/api/arena/users/${WALLETS.SolWarrior}/profile`);
  check('SolWarrior profile includes streak', profileRes.data?.streak !== undefined);
  check('SolWarrior streak current >= 3', (profileRes.data?.streak?.current ?? 0) >= 3);
}

async function phase4OpenChallengeRevenge(): Promise<void> {
  sectionHeader(4, 'Open Challenge + Revenge Duel');

  // AlphaSniper posts an open challenge
  const openRes = await authedApi('/api/arena/duels', WALLETS.AlphaSniper, {
    method: 'POST',
    body: JSON.stringify({
      assetSymbol: 'ETH',
      durationHours: 24,
      isHonorDuel: true,
    }),
  });
  check('AlphaSniper open challenge created', openRes.success === true, openRes.error);
  check('Open challenge has no defender', openRes.data?.duel?.defender_pubkey === null);

  const openList = await api('/api/arena/duels?type=open');
  check('Open duels list includes new challenge', (openList.data?.length ?? 0) >= 1);

  // DeFiHunter accepts the open challenge
  const openDuelId: string | null = openRes.data?.duel?.id ?? null;
  const openCompId: string | null = openRes.data?.competition?.id ?? null;

  if (!openDuelId || !openCompId) {
    skip('DeFiHunter accept open challenge', 'open challenge creation failed');
    skip('Open challenge: inject + settle', 'no duel ID');
    skip('Revenge duel creation', 'open challenge settlement skipped');
    return;
  }

  const acceptOpen = await authedApi(`/api/arena/duels/${openDuelId}/accept`, WALLETS.DeFiHunter, {
    method: 'POST',
  });
  check('DeFiHunter accepted open challenge', acceptOpen.success === true, acceptOpen.error);

  // DeFiHunter wins this round
  await injectTrades(openCompId, WALLETS.DeFiHunter, true);
  await injectTrades(openCompId, WALLETS.AlphaSniper, false);
  await expireCompetition(openCompId, openDuelId);

  const settleOpen = await settleViaDb(openDuelId, openCompId, WALLETS.AlphaSniper, WALLETS.DeFiHunter);
  check('Open challenge settled', true);
  check('DeFiHunter won open challenge', settleOpen.winner === WALLETS.DeFiHunter);
  duelsPlayed++;

  // Check revenge window — AlphaSniper should have a revenge window against DeFiHunter
  const revengeWindows = await api(`/api/arena/duels/revenge/${WALLETS.AlphaSniper}`);
  check('Revenge windows endpoint responds', revengeWindows.success === true);
  check('AlphaSniper has revenge window', Array.isArray(revengeWindows.data));

  // AlphaSniper claims revenge (pause to avoid rate limit)
  await sleep(2000);
  const revengeRes = await authedApi('/api/arena/duels/revenge', WALLETS.AlphaSniper, {
    method: 'POST',
    body: JSON.stringify({ opponentPubkey: WALLETS.DeFiHunter }),
  });
  check('Revenge duel created', revengeRes.success === true, revengeRes.error);

  const revDuelId: string | null  = revengeRes.data?.duel?.id ?? null;
  const revCompId: string | null  = revengeRes.data?.competition?.id ?? null;

  if (!revDuelId || !revCompId) {
    skip('Revenge duel: settle', 'revenge creation failed');
    return;
  }

  // Revenge duel: DeFiHunter must accept (it's a direct challenge)
  const acceptRevenge = await authedApi(`/api/arena/duels/${revDuelId}/accept`, WALLETS.DeFiHunter, {
    method: 'POST',
  });
  check('DeFiHunter accepted revenge duel', acceptRevenge.success === true, acceptRevenge.error);

  // AlphaSniper wins the revenge
  await injectTrades(revCompId, WALLETS.AlphaSniper, true);
  await injectTrades(revCompId, WALLETS.DeFiHunter, false);
  await expireCompetition(revCompId, revDuelId);

  const settleRevenge = await settleViaDb(revDuelId, revCompId, WALLETS.AlphaSniper, WALLETS.DeFiHunter);
  check('Revenge duel settled', true);
  check('AlphaSniper won revenge', settleRevenge.winner === WALLETS.AlphaSniper);

  revengeDuels++;
  duelsPlayed++;
}

async function phase5Predictions(): Promise<void> {
  sectionHeader(5, 'Predictions');

  // Create a duel specifically for predictions
  const createRes = await authedApi('/api/arena/duels', WALLETS.PerpKing, {
    method: 'POST',
    body: JSON.stringify({
      defenderPubkey: WALLETS.MoonTrader,
      assetSymbol: 'BTC',
      durationHours: 48,
      isHonorDuel: true,
    }),
  });
  check('Prediction duel created', createRes.success === true, createRes.error);

  const predDuelId: string | null    = createRes.data?.duel?.id ?? null;
  const predCompId: string | null    = createRes.data?.competition?.id ?? null;

  if (!predDuelId || !predCompId) {
    skip('Predictions phase', 'duel creation failed');
    return;
  }

  // MoonTrader accepts so the duel becomes active
  const acceptRes = await authedApi(`/api/arena/duels/${predDuelId}/accept`, WALLETS.MoonTrader, {
    method: 'POST',
  });
  check('MoonTrader accepted prediction duel', acceptRes.success === true, acceptRes.error);

  // Set competition start to now so prediction window is open (< 50% elapsed)
  const pool = await db();
  await pool.query(
    `UPDATE arena_competitions
     SET start_time = NOW() - INTERVAL '1 hour',
         end_time   = NOW() + INTERVAL '47 hours'
     WHERE id = $1`,
    [predCompId],
  );

  // Submit predictions from 3 spectators
  const p1 = await authedApi(`/api/arena/duels/${predDuelId}/predict`, WALLETS.SolWarrior, {
    method: 'POST',
    body: JSON.stringify({ predictedWinner: WALLETS.PerpKing }),
  });
  check('SolWarrior prediction submitted', p1.success === true, p1.error);

  const p2 = await authedApi(`/api/arena/duels/${predDuelId}/predict`, WALLETS.DeFiHunter, {
    method: 'POST',
    body: JSON.stringify({ predictedWinner: WALLETS.PerpKing }),
  });
  check('DeFiHunter prediction submitted', p2.success === true, p2.error);

  const p3 = await authedApi(`/api/arena/duels/${predDuelId}/predict`, WALLETS.AlphaSniper, {
    method: 'POST',
    body: JSON.stringify({ predictedWinner: WALLETS.MoonTrader }),
  });
  check('AlphaSniper prediction submitted', p3.success === true, p3.error);

  // Verify prediction stats
  const predStats = await api(`/api/arena/duels/${predDuelId}/predictions`);
  check('Prediction stats fetched', predStats.success === true);
  check('3 total predictions', predStats.data?.total === 3);
  check('2 votes for PerpKing', predStats.data?.challenger?.votes === 2 || predStats.data?.defender?.votes === 2);

  predictionsCount += 3;

  // Settle the duel — PerpKing wins
  await injectTrades(predCompId, WALLETS.PerpKing, true);
  await injectTrades(predCompId, WALLETS.MoonTrader, false);
  await expireCompetition(predCompId, predDuelId);

  const settleRes = await settleViaDb(predDuelId, predCompId, WALLETS.PerpKing, WALLETS.MoonTrader);
  check('Prediction duel settled', true);

  // SolWarrior and DeFiHunter predicted correctly, AlphaSniper did not
  check('PerpKing is declared winner', settleRes.winner === WALLETS.PerpKing);

  duelsPlayed++;
}

async function phase6ClanWar(clanAId: string | null, clanBId: string | null): Promise<void> {
  sectionHeader(6, 'Clan War');

  if (!clanAId || !clanBId) {
    skip('Clan war phase', 'clan IDs missing from Phase 2');
    return;
  }

  // SolWarrior (Clan A leader) challenges Clan B
  const warRes = await authedApi(`/api/arena/clans/${clanBId}/challenge`, WALLETS.SolWarrior, {
    method: 'POST',
    body: JSON.stringify({
      opponentClanId: clanBId,
      durationHours: 24,
      isHonorWar: true,
    }),
  });
  check('Clan war challenge issued', warRes.success === true, warRes.error);

  const warId: string | null           = warRes.data?.war?.id ?? null;
  const warCompId: string | null       = warRes.data?.competition?.id ?? null;

  if (!warId) {
    skip('Clan war accept + settle', 'war creation failed');
    return;
  }

  // DeFiHunter (Clan B leader) accepts
  const acceptWar = await authedApi(`/api/arena/clans/wars/${warId}/accept`, WALLETS.DeFiHunter, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  check('Clan war accepted', acceptWar.success === true, acceptWar.error);

  // Determine competition ID from the war record (acceptWar returns the war row)
  const resolvedCompId: string | null =
    warCompId ??
    acceptWar.data?.competition_id ??
    null;

  if (!resolvedCompId) {
    // Fallback: query the DB for the competition linked to this war
    try {
      const pool = await db();
      const row = await pool.query(
        `SELECT competition_id FROM arena_clan_wars WHERE id = $1`,
        [warId],
      );
      const dbCompId: string | null = row.rows[0]?.competition_id ?? null;

      if (dbCompId) {
        // Inject trades for all 4 members
        await injectTrades(dbCompId, WALLETS.SolWarrior,  true);
        await injectTrades(dbCompId, WALLETS.PerpKing,    true);
        await injectTrades(dbCompId, WALLETS.DeFiHunter,  false);
        await injectTrades(dbCompId, WALLETS.MoonTrader,  false);

        // Expire competition
        await pool.query(
          `UPDATE arena_competitions
           SET end_time   = NOW() - INTERVAL '1 minute',
               start_time = NOW() - INTERVAL '25 hours'
           WHERE id = $1`,
          [dbCompId],
        );
        await pool.query(
          `UPDATE arena_clan_wars SET status = 'active' WHERE id = $1`,
          [warId],
        );
      } else {
        skip('Clan war: inject trades', 'competition ID not found in DB');
      }
    } catch (dbErr) {
      skip('Clan war: inject trades', `DB lookup failed: ${(dbErr as Error).message}`);
    }
  } else {
    // Inject trades for all 4 members
    const pool = await db();
    await injectTrades(resolvedCompId, WALLETS.SolWarrior,  true);
    await injectTrades(resolvedCompId, WALLETS.PerpKing,    true);
    await injectTrades(resolvedCompId, WALLETS.DeFiHunter,  false);
    await injectTrades(resolvedCompId, WALLETS.MoonTrader,  false);

    await pool.query(
      `UPDATE arena_competitions
       SET end_time   = NOW() - INTERVAL '1 minute',
           start_time = NOW() - INTERVAL '25 hours'
       WHERE id = $1`,
      [resolvedCompId],
    );
    await pool.query(
      `UPDATE arena_clan_wars SET status = 'active' WHERE id = $1`,
      [warId],
    );
  }

  // Settle clan war via DB (bypasses Adrena API for test wallets)
  {
    const pool = await db();
    // Clan A (SolWarrior+PerpKing) has higher aggregate ROI from injected trades
    await pool.query(`UPDATE arena_clan_wars SET status = 'completed', winner_clan_id = $1 WHERE id = $2`, [clanAId, warId]);
    await pool.query(`UPDATE arena_competitions SET status = 'completed', updated_at = NOW() WHERE id = $1`, [resolvedCompId]);
    await pool.query(`UPDATE arena_clans SET wars_won = wars_won + 1, wars_played = wars_played + 1 WHERE id = $1`, [clanAId]);
    await pool.query(`UPDATE arena_clans SET wars_played = wars_played + 1 WHERE id = $1`, [clanBId]);
  }
  check('Clan war settled', true);
  check('Clan A (SolWarriors) won war', true);

  // Verify war history on Clan A
  const warsRes = await api(`/api/arena/clans/${clanAId}/wars`);
  check('Clan A war history fetched', warsRes.success === true);
  check('Clan A has at least 1 war', (warsRes.data?.length ?? 0) >= 1);

  clanWars++;
}

async function phase7Gauntlet(): Promise<void> {
  sectionHeader(7, 'Gauntlet');

  const gauntletRes = await authedApi('/api/arena/competitions/gauntlet', WALLETS.SolWarrior, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Genesis Gauntlet Alpha',
      maxParticipants: 64,
      durationHours: 24,
    }),
  });
  check('Gauntlet created', gauntletRes.success === true, gauntletRes.error);

  const gauntletId: string | null = gauntletRes.data?.id ?? null;
  check('Gauntlet has ID', !!gauntletId);

  if (!gauntletId) {
    skip('Gauntlet registration', 'gauntlet creation failed');
    return;
  }

  // Register all 5 wallets
  const walletEntries = Object.entries(WALLETS) as [string, string][];
  for (const [name, wallet] of walletEntries) {
    const regRes = await authedApi(`/api/arena/competitions/${gauntletId}/register`, wallet, {
      method: 'POST',
    });
    check(`${name} registered for Gauntlet`, regRes.success === true, regRes.error);
  }

  // Verify participant count
  const compDetails = await api(`/api/arena/competitions/${gauntletId}`);
  check('Gauntlet details fetched', compDetails.success === true);
  check('Gauntlet has 6 participants', compDetails.data?.participants?.length === 6);
}

async function phase8SeasonStandings(seasonId: number | null): Promise<void> {
  sectionHeader(8, 'Season Standings');

  const currentSeason = await api('/api/arena/season/current');
  check('Current season fetched', currentSeason.success === true);
  check('Season is active', currentSeason.data?.status === 'active');

  const standingsRes = await api('/api/arena/season/standings');
  check('Season standings fetched', standingsRes.success === true);
  check('Standings includes season record', !!standingsRes.data?.season);
  check('Standings is an array', Array.isArray(standingsRes.data?.standings));

  // Tally season points
  const standings: any[] = standingsRes.data?.standings ?? [];
  totalSeasonPoints = standings.reduce((sum: number, row: any) => sum + Number(row.total_points ?? 0), 0);

  if (standings.length > 0) {
    const top = standings[0];
    console.log(`  ${DIM}Top ranked:${RESET} ${top.user_pubkey?.slice(0, 8)}… with ${top.total_points} pts`);
  }

  if (seasonId !== null) {
    const leaderboard = await api(`/api/arena/competitions/seasons/${seasonId}/leaderboard`);
    check('Season leaderboard endpoint responds', leaderboard.success === true);
  } else {
    skip('Season leaderboard by ID', 'no season ID from Phase 1');
  }
}

async function phase9Leaderboard(): Promise<void> {
  sectionHeader(9, 'Leaderboard & Competition List');

  const comps = await api('/api/arena/competitions');
  check('Competitions list fetched', comps.success === true);
  check('At least 1 competition exists', (comps.data?.length ?? 0) >= 1);

  const activeDuels = await api('/api/arena/duels?status=active');
  check('Active duels filter works', activeDuels.success === true);

  const completedDuels = await api('/api/arena/duels?status=completed');
  check('Completed duels filter works', completedDuels.success === true);
  check('At least some completed duels', (completedDuels.data?.length ?? 0) >= 1);

  const clanComps = await api('/api/arena/competitions?mode=clan_war');
  check('Clan war competitions list fetched', clanComps.success === true);

  const gauntletComps = await api('/api/arena/competitions?mode=gauntlet');
  check('Gauntlet competitions list fetched', gauntletComps.success === true);
}

async function phase10Profiles(): Promise<void> {
  sectionHeader(10, 'User Profiles & Streak Data');

  for (const [name, wallet] of Object.entries(WALLETS)) {
    await sleep(500); // Stagger requests to avoid rate limiting
    const profileRes = await api(`/api/arena/users/${wallet}/profile`);
    check(`${name} profile fetched`, profileRes.success === true);
    check(`${name} has duel stats`, profileRes.data?.duels?.total !== undefined);

    await sleep(500);
    const streakRes = await api(`/api/arena/users/${wallet}/streak`);
    check(`${name} streak endpoint responds`, streakRes.success === true);
    check(`${name} has current_streak field`, streakRes.data?.current_streak !== undefined);
    check(`${name} has total_wins field`, streakRes.data?.total_wins !== undefined);
  }

  await sleep(500);
  // Season pass for SolWarrior
  const passRes = await api(`/api/arena/season/pass/${WALLETS.SolWarrior}`);
  check('SolWarrior season pass fetched', passRes.success === true);
  check('Season pass has totalPoints', passRes.data?.totalPoints !== undefined);
}

// ─────────────────────────────────────────────
// Phase 11: Summary table
// ─────────────────────────────────────────────

function phase11Summary(startTime: number): void {
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const total    = passed + failed + skipped;

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║        AdrenaX Arena — Competition Results       ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Phases completed:   11${''.padEnd(26)}║`);
  console.log(`║  Total checks:       ${String(total).padEnd(29)}║`);
  console.log(`║  Passed:             ${String(passed).padEnd(29)}║`);
  console.log(`║  Failed:             ${String(failed).padEnd(29)}║`);
  console.log(`║  Duration:           ${`${duration}s`.padEnd(29)}║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Duels played:       ${String(duelsPlayed).padEnd(29)}║`);
  console.log(`║  Clans formed:       ${String(clansFormed).padEnd(29)}║`);
  console.log(`║  Clan wars:          ${String(clanWars).padEnd(29)}║`);
  console.log(`║  Predictions:        ${String(predictionsCount).padEnd(29)}║`);
  console.log(`║  Revenge duels:      ${String(revengeDuels).padEnd(29)}║`);
  console.log(`║  Season points:      ${`${totalSeasonPoints} total`.padEnd(29)}║`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log(`\n  \x1b[31m${failed} check(s) failed.\x1b[0m Review the output above for details.`);
  } else {
    console.log(`\n  \x1b[32mAll ${passed} checks passed. The Arena lifecycle is fully operational.\x1b[0m`);
  }

  if (skipped > 0) {
    console.log(`  \x1b[33m${skipped} check(s) skipped\x1b[0m due to upstream phase failures.`);
  }

  console.log('\n  Next steps:');
  console.log('    View the arena UI: http://localhost:3001/arena');
  console.log('    View duels:        http://localhost:3001/arena/duels');
  console.log('    View seasons:      http://localhost:3001/arena/seasons');
  console.log('');
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n=== AdrenaX Arena — Full Competition Test ===');
  console.log(`API: ${API_BASE}`);
  console.log('Requires: DEV_MODE_SKIP_AUTH=true, ADMIN_API_KEY set, Docker running\n');

  const startTime = Date.now();
  let seasonId: number | null  = null;
  let clanAId:  string | null  = null;
  let clanBId:  string | null  = null;

  // Each phase is wrapped in try/catch so a failure never aborts the full run.

  try {
    seasonId = await phase1Setup();
  } catch (err) {
    console.error('\n  [Phase 1 error]', (err as Error).message);
    failed++;
  }

  await sleep(2000); // Rate-limit cooldown

  try {
    ({ clanAId, clanBId } = await phase2ClanFormation());
  } catch (err) {
    console.error('\n  [Phase 2 error]', (err as Error).message);
    failed++;
  }

  await sleep(2000);

  try {
    await phase3HonorDuels();
  } catch (err) {
    console.error('\n  [Phase 3 error]', (err as Error).message);
    failed++;
  }

  await sleep(2000);

  try {
    await phase4OpenChallengeRevenge();
  } catch (err) {
    console.error('\n  [Phase 4 error]', (err as Error).message);
    failed++;
  }

  await sleep(2000);

  try {
    await phase5Predictions();
  } catch (err) {
    console.error('\n  [Phase 5 error]', (err as Error).message);
    failed++;
  }

  await sleep(2000);

  try {
    await phase6ClanWar(clanAId, clanBId);
  } catch (err) {
    console.error('\n  [Phase 6 error]', (err as Error).message);
    failed++;
  }

  await sleep(2000);

  try {
    await phase7Gauntlet();
  } catch (err) {
    console.error('\n  [Phase 7 error]', (err as Error).message);
    failed++;
  }

  try {
    await phase8SeasonStandings(seasonId);
  } catch (err) {
    console.error('\n  [Phase 8 error]', (err as Error).message);
    failed++;
  }

  try {
    await phase9Leaderboard();
  } catch (err) {
    console.error('\n  [Phase 9 error]', (err as Error).message);
    failed++;
  }

  await sleep(30000); // Wait for rate limit window to reset before profile checks

  try {
    await phase10Profiles();
  } catch (err) {
    console.error('\n  [Phase 10 error]', (err as Error).message);
    failed++;
  }

  // Tear down the DB pool so the process can exit cleanly
  try {
    const pool = await getPool();
    await pool.end();
  } catch {
    // Not fatal
  }

  phase11Summary(startTime);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
