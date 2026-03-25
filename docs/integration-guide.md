# AdrenaX Arena -- Integration Guide

How Arena connects to Adrena's existing infrastructure.

## Architecture Overview

Arena operates as a modular competition layer on top of Adrena's perpetual trading platform. It reads trade data from Adrena's public API (`datapi.adrena.trade`), runs all competition logic off-chain, uses an on-chain Anchor escrow program for staked competitions, and emits competition lifecycle events that Adrena's systems can subscribe to via persistent DB-backed webhooks or in-process adapters.

```
+-------------------------------------------------------------+
|                    Adrena Frontend                            |
|  +-----------+  +-----------+  +-----------+  +-----------+  |
|  |Leaderboard|  |  Quests   |  |  Profile  |  |  Raffles  |  |
|  +-----+-----+  +-----+-----+  +-----+-----+  +-----+-----+ |
|        |              |              |              |          |
|  +-----+--------------+--------------+--------------+------+  |
|  |             Adrena Backend (adapters)                    |  |
|  +---------------------------+------------------------------+  |
|                              |                                 |
|  +---------------------------+------------------------------+  |
|  |       Arena Event Bus (DB-backed webhooks + adapters)    |  |
|  +---------------------------+------------------------------+  |
|                              |                                 |
|  +---------------------------+------------------------------+  |
|  |              AdrenaX Arena Server                        |  |
|  |  +------+ +--------+ +-------+ +--------+ +----------+  |  |
|  |  |Duels | |Gauntlet| | Clans | |Seasons | |  Escrow  |  |  |
|  |  +------+ +--------+ +-------+ +--------+ |  Client  |  |  |
|  |                                            +----+-----+  |  |
|  +---------------------------------------------|---+--------+  |
|                                                |               |
|        +---------------------------------------+--+            |
|        |                                      |   |            |
|  +-----+-----+                        +------+---+-------+    |
|  |datapi.     |                        | Solana (Devnet)  |    |
|  |adrena.trade|                        | Arena Escrow     |    |
|  |(read-only) |                        | BQQnoKSb...      |    |
|  +------------+                        +------------------+    |
+----------------------------------------------------------------+
```

## Integration Points

### 1. Event System (Webhooks)

Arena emits typed events for all competition lifecycle actions. External consumers subscribe via **persistent DB-backed webhooks** with HMAC-SHA256 signing, exponential backoff retry, and dead-letter tracking.

#### Available Events

| Event | Trigger | Payload |
|---|---|---|
| `duel_created` | New challenge issued | challenger, defender, asset, duration, stake |
| `duel_accepted` | Defender accepts | both pubkeys, start/end times |
| `duel_settled` | Winner determined | winner, loser, ROIs, draw flag |
| `gauntlet_created` | New tournament | name, max participants, timing |
| `gauntlet_activated` | Registration closed | participant list |
| `gauntlet_settled` | Rankings finalized | ranked results with ROI/PnL |
| `participant_registered` | User joins competition | pubkey, competition mode |
| `reward_distributed` | Reward processed | amount, token, type |
| `prediction_made` | User predicts winner | predictor, predicted winner |

#### Webhook Registration

Webhooks are stored in the `arena_webhooks` table (persistent across restarts) and require admin authentication:

```bash
POST /api/arena/webhooks
{
  "url": "https://api.adrena.xyz/arena/events",
  "events": ["duel_settled", "gauntlet_settled", "reward_distributed"],
  "secret": "whsec_your_hmac_secret"
}
```

Each webhook delivery includes:
- `X-Arena-Signature`: HMAC-SHA256 of the body using your secret
- `X-Arena-Event`: Event type string
- JSON body with `type`, `timestamp`, and `payload`

Delivery tracking:
- Each delivery attempt is recorded in `arena_webhook_deliveries`
- Failed deliveries are retried with exponential backoff
- Dead-letter entries are preserved for debugging

#### Webhook Management

```bash
# List webhooks
GET /api/arena/webhooks

# Delete a webhook
DELETE /api/arena/webhooks/:id
```

### 2. In-Process Adapters

For tighter integration, Adrena implements adapter interfaces. Arena ships with 4 real adapter implementations that make HTTP calls to Adrena's APIs when configured, or log locally when URLs are not set (standalone mode).

#### Mutagen Adapter (`MutagenAdapterImpl`)

```typescript
// Real implementation in packages/arena-server/src/adrena/adapters/mutagen.ts
// When ADRENA_MUTAGEN_API_URL is set, calls Adrena's Mutagen service
// When not set, throws an error (caught by the adapter registry fallback)

interface MutagenAdapter {
  awardMutagen(userPubkey: string, amount: number, reason: string, metadata: Record<string, unknown>): Promise<void>;
  getMutagenBalance(userPubkey: string): Promise<number>;
  applyMultiplier(userPubkey: string, multiplier: number, expiresAt: Date): Promise<void>;
}
```

#### Leaderboard Adapter (`LeaderboardAdapterImpl`)

```typescript
// Real implementation in packages/arena-server/src/adrena/adapters/leaderboard.ts
// When ADRENA_LEADERBOARD_API_URL is set, syncs stats to Adrena's leaderboard

interface LeaderboardAdapter {
  syncUserStats(userPubkey: string, stats: { arenaWins, arenaLosses, arenaROI, arenaPnL, duelStreak, mutagenEarned }): Promise<void>;
  pushCompetitionResult(competitionId: string, mode: string, rankings: Array<{ rank, pubkey, roi, pnl }>): Promise<void>;
}
```

#### Quest Adapter

```typescript
// When ADRENA_QUEST_WEBHOOK_URL is set, posts arena actions to Adrena's quest engine

interface QuestAdapter {
  trackAction(action: string, userPubkey: string, metadata: Record<string, unknown>): Promise<void>;
}
```

#### Streak Adapter

```typescript
// Manages streak data in arena_user_stats table
// Exposes streak info for Adrena's profile system

interface StreakAdapter {
  recordResult(userPubkey: string, result: 'win' | 'loss'): Promise<void>;
  getStreak(userPubkey: string): Promise<StreakData>;
}
```

### 3. Mutagen Integration

Arena awards Mutagen for:

| Action | Mutagen Amount | Notes |
|---|---|---|
| Win an honor duel | 50 | Base amount, multiplied by streak |
| Win a staked duel | 50 + stake bonus | Proportional to stake size |
| Gauntlet 1st place | 100 | |
| Gauntlet 2nd place | 60 | |
| Gauntlet 3rd place | 30 | |
| Correct prediction | 10 | Per correct duel prediction |

The `MutagenAdapter` implementation calls Adrena's API at `ADRENA_MUTAGEN_API_URL` to:
- Process Mutagen awards through their existing system
- Apply multipliers from Arena streaks (1.0x to 2.0x)
- Query balances for display in Arena UI

When `ADRENA_MUTAGEN_API_URL` is not configured, rewards are tracked locally in the `arena_rewards` table with sentinel signatures.

### 4. Leaderboard Sync

Arena maintains its own competition-scoped leaderboards. The `LeaderboardAdapter` implementation syncs to Adrena's global leaderboard at `ADRENA_LEADERBOARD_API_URL`:

- Per-user Arena stats (wins, losses, ROI, PnL, streak)
- Completed competition results with ranked participants
- Arena Score (4-component weighted: ROI + Win Rate + Risk-Adjusted Return + Consistency)

### 5. Quest System Integration

Arena actions that trigger quest progress via the Quest adapter:

| Quest Trigger | Action |
|---|---|
| `duel_created` | "Challenge a trader" quest |
| `duel_won` | "Win X duels" quest |
| `gauntlet_completed` | "Survive a gauntlet" quest |
| `prediction_correct` | "Predict X winners" quest |
| `streak_3` | "Win 3 duels in a row" quest |
| `clan_created` | "Form a clan" quest |
| `clan_war_won` | "Win a clan war" quest |

### 6. Streak System

Arena tracks duel win/loss streaks in the `arena_user_stats` table:

- 3 consecutive wins: "Hot Streak" badge + 1.15x Mutagen
- 5 wins: "Arena Champion" title + 1.25x Mutagen
- 10 wins: "Legendary Duelist" + 1.50x Mutagen
- Max multiplier: 2.0x at 20 wins

### 7. On-Chain Escrow Integration

Staked duels and clan wars use the Arena Escrow program on Solana devnet:

- **Program ID:** `BQQnoKSbNBVjFuiGB33QWymz6PhczDmRFmeLMJ3MGvwQ`
- **Framework:** Anchor 0.30.1
- **9 instructions:** initialize_config, update_config, create/fund/cancel/settle/refund escrow, pause/resume
- **PDA-owned vaults** with allowlisted SPL token mints (ADX, USDC)
- **Configurable treasury fee** (max 5%)
- **Server-side `EscrowClient`** wraps all instructions in `packages/arena-server/src/solana/escrow-client.ts`

The escrow flow:
1. Server builds unsigned transaction via `buildChallengerDepositIntent()`
2. Challenger signs in their wallet and submits
3. Server confirms deposit via `confirmChallengerEscrowDeposit()`
4. Defender funds via the same intent/confirm flow
5. Server settles winner via `settleDuel()` (authority-signed)
6. On draw/void, server refunds via `refundDraw()` (authority-signed)

See [escrow.md](escrow.md) for complete program documentation.

## API Contracts Arena Needs from Adrena

Arena currently reads from `datapi.adrena.trade`. For full integration, Arena needs:

### Required (already available)

| Endpoint | Purpose | Status |
|---|---|---|
| `GET /position?user_wallet=X` | Fetch trader positions | Available |
| `GET /pool-high-level-stats` | Volume/TVL data | Available |

### Desired (for deeper integration)

| Endpoint | Purpose | Why |
|---|---|---|
| `POST /mutagen/award` | Award Mutagen points | Replace local tracking with real API calls |
| `GET /mutagen/balance/:wallet` | Show Mutagen in Arena UI | Display user's total Mutagen |
| `POST /leaderboard/sync` | Push Arena results | Unified leaderboard across Adrena |
| `POST /quests/track` | Trigger quest progress | Arena activities count toward quests |
| `GET /user/:wallet/streaks` | Get streak data | Display in Arena profile |
| `POST /webhooks/register` | Subscribe to Adrena events | Real-time trade completion notifications |

## Migration Path: Standalone to Fully Integrated

### Phase 1: Standalone (Current)
- Arena runs as independent service
- Reads trade data from public API
- Awards Mutagen tracked locally (sentinel signatures in DB)
- On-chain escrow deployed on devnet
- 4 competition modes implemented (Duels, Gauntlet, Clan Wars, Seasons)
- 4 adapter implementations call Adrena APIs when configured
- DB-backed webhooks with retry and dead-letter
- Admin API for season management, user moderation, escrow control

### Phase 2: Event Integration
- Adrena registers webhooks for Arena events
- Arena events trigger quest progress on Adrena's side
- Mutagen awards go through Adrena's real API (set `ADRENA_MUTAGEN_API_URL`)
- Leaderboard syncs to Adrena's global rankings (set `ADRENA_LEADERBOARD_API_URL`)
- Quest actions forwarded to Adrena (set `ADRENA_QUEST_WEBHOOK_URL`)

### Phase 3: Embedded
- Arena components embedded in Adrena frontend via SDK
- "Challenge this trader" button on Adrena user profiles
- Live duel feed in Adrena's main navigation
- Shared authentication (Adrena's existing wallet auth)
- Clan war leaderboards on Adrena's competition page

### Phase 4: Production On-Chain
- Escrow program deployed to Solana mainnet
- Verifiable competition results via Merkle root on-chain
- On-chain settlement for token rewards
- DAO-governed competition parameters

## Deployment for Adrena Team

Arena can be deployed as:

1. **Sidecar service**: Separate container alongside Adrena's backend, connected via webhooks/HTTP
2. **NPM package**: `@adrenax/arena-server` imported directly into Adrena's backend
3. **Embedded module**: Arena engine functions called directly from Adrena's route handlers

Recommended for initial integration: **Option 1 (Sidecar)** -- minimal coupling, independent scaling, can be replaced or upgraded without affecting Adrena's core.

## Environment Variables for Integration

```bash
# Arena Server (core)
DATABASE_URL=postgresql://...          # Shared or separate DB
REDIS_URL=redis://...                  # Shared or separate Redis
ADRENA_API_BASE=https://datapi.adrena.trade
CORS_ORIGIN=https://app.adrena.xyz    # Adrena's frontend URL

# Solana Escrow
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=BQQnoKSbNBVjFuiGB33QWymz6PhczDmRFmeLMJ3MGvwQ
TREASURY_PUBKEY=<treasury-wallet>
OPERATOR_KEYPAIR_PATH=<path-to-keypair>
ADX_MINT=<adx-mint-address>
USDC_MINT=<usdc-mint-address>

# Adrena Adapter Integration
ADRENA_MUTAGEN_API_URL=https://api.adrena.xyz/mutagen
ADRENA_QUEST_WEBHOOK_URL=https://api.adrena.xyz/quests/track
ADRENA_LEADERBOARD_API_URL=https://api.adrena.xyz/leaderboard

# Admin
ADMIN_API_KEY=<strong-random-key>
```
