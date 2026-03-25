# AdrenaX Arena

**Competitive trading duels, tournaments, and clan wars on Solana.**

A full-featured competition layer for [Adrena](https://adrena.xyz), the Solana perpetual DEX. Challenge any trader to a head-to-head duel, survive progressive elimination in The Gauntlet, rally your clan for team-based wars, and climb the seasonal championship ranks -- all scored from real trades on Adrena's live markets, with trustless staked escrow on-chain.

> **Escrow Program (Devnet):** `BQQnoKSbNBVjFuiGB33QWymz6PhczDmRFmeLMJ3MGvwQ`
> Built with Anchor 0.30.1 -- 9 instructions, security-audited, rent-reclaimable accounts.

---

## The Problem

Trading competitions on perpetual DEXs are stuck in a single format: fixed-window leaderboards ranked by PnL or volume. These suffer from predictable failure modes:

- **Whales dominate early.** Most participants disengage once the top of the board becomes unreachable.
- **No social layer.** Competitions are solitary. There is no way to directly challenge another trader.
- **No retention loop.** When the competition ends, there is no reason to come back.
- **One-dimensional scoring.** Pure PnL rewards reckless leverage, not skill.

No perp DEX -- on Solana or elsewhere -- offers 1v1 challenges, progressive elimination, team-based competition, or on-chain escrow for staked competitions.

## The Solution

AdrenaX Arena introduces **duels as the atomic unit of competition**. One trader challenges another. Both trade on Adrena. Higher ROI wins. It is simple, personal, and shareable.

Every duel generates a **challenge card** -- a dynamically rendered OG image optimized for Twitter and Discord. Share the link, the card unfurls, and anyone can click through to spectate or make predictions. This turns every duel into a potential acquisition event.

The **Gauntlet** is the volume engine: a multi-round progressive elimination tournament where the bottom 50% are cut each round, creating sustained engagement across multiple days instead of a single leaderboard grind.

**Clan Wars** bring team dynamics: form a squad of 3-5 traders, challenge rival clans, and earn synergy bonuses that reward coordination over individual performance.

All modes feed into a **Seasonal Championship** that gives every trade on Adrena long-term competitive meaning.

**Staked competitions** use an on-chain Anchor escrow program deployed on Solana devnet. Both sides deposit SPL tokens (ADX or USDC) into a PDA-owned vault. The server authority settles the winner or refunds on draw. Protocol fees route to a configurable treasury. Zero custodial risk.

---

## Competition Modes

| Mode | Format | Status |
|------|--------|--------|
| **Duels** | 1v1 head-to-head, 24h or 48h, honor or staked (ADX/USDC escrow) | Implemented -- full engine, API, UI, and on-chain escrow |
| **The Gauntlet** | Multi-round progressive elimination (2-128 players), ranked by composite Arena Score | Implemented -- engine, API, multi-round with intermissions |
| **Clan Wars** | Team-based (3-5 members), clan challenges with synergy bonuses and escrow support | Implemented -- engine, API, UI, escrow integration |
| **Seasonal Championship** | 4-week meta-competition aggregating points from all modes with season pass progression | Implemented -- schema, point system, pass milestones, API |

---

## Architecture

```
+------------------+       +------------------+       +------------------+
|                  |  REST |                  |       |                  |
|   Arena UI       |<----->|   Arena Server   |<----->|   PostgreSQL     |
|   (Next.js)      |  SSE  |   (Express/TS)   |       |   18 tables      |
|   port 3001      |  WS   |   port 3000      |       |   10 migrations  |
|                  |       |                  |       |   port 5432      |
+------------------+       +--------+---------+       +------------------+
                                    |
                           +--------+---------+
                           |                  |
                           |   Redis + BullMQ |
                           |   (Cache/Queue)  |
                           |   port 6379      |
                           |                  |
                           +--------+---------+
                                    |
                    +---------------+---------------+
                    |                               |
           +--------+---------+            +--------+---------+
           |                  |            |                  |
           |  Adrena Data API |            | Solana (Devnet)  |
           |  (External)      |            | Anchor Escrow    |
           |  datapi.adrena.  |            | Program          |
           |  trade           |            | BQQnoKSb...      |
           +------------------+            +------------------+
```

The server polls Adrena's public API for position data. Competition logic runs off-chain. Staked duels and clan wars use the on-chain escrow program for trustless custody of SPL token stakes.

---

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | Next.js 14, React 18, Tailwind CSS | SSR pages, challenge card OG routes, clan and season UIs |
| Wallet | @solana/wallet-adapter | Phantom, Backpack, Solflare connection |
| API Server | Express 4, TypeScript | REST endpoints, WebSocket, SSE streams |
| Database | PostgreSQL 16, Kysely | Type-safe query builder, 18-table schema across 10 migrations |
| Queue | Redis 7, BullMQ | Trade indexer worker, job scheduling |
| Validation | Zod | Request/response schema validation |
| Card Gen | Satori + resvg-js | Server-side OG image rendering to PNG (bundled Inter font) |
| Notifications | discord.js | Challenge and result delivery to Discord |
| Auth | tweetnacl + bs58 | Solana wallet signature verification |
| On-Chain | Anchor 0.30.1, SPL Token | Escrow program for staked duels and clan wars |
| Scoring | Custom 4-component Arena Score | ROI + Win Rate + Risk-Adjusted Return + Consistency |
| Anti-Abuse | Custom anti-sybil engine | Collusion detection, trade history checks, risk scoring |

---

## Quick Start

**Prerequisites:** Node.js 20+, pnpm, Docker

```bash
# Clone
git clone https://github.com/your-org/AdrenaX_Arena.git
cd AdrenaX_Arena

# Install dependencies
pnpm install

# Start PostgreSQL and Redis
docker compose up -d

# Copy environment config
cp .env.example .env

# Run database migrations (10 migrations, 18 tables)
pnpm db:migrate

# Start dev servers (API on :3000, UI on :3001)
pnpm dev

# Verify
curl http://localhost:3000/api/health

# Run tests (132 tests across 7 files)
pnpm test
```

**Create a test duel** (requires wallet auth -- use the UI at `http://localhost:3001`):

```bash
# Or via API with a signed auth header:
curl -X POST http://localhost:3000/api/arena/duels \
  -H "Content-Type: application/json" \
  -H "X-Wallet: <your-pubkey>" \
  -H "X-Signature: <signed-nonce>" \
  -H "X-Nonce: <nonce>" \
  -d '{
    "defenderPubkey": "<opponent-pubkey>",
    "assetSymbol": "SOL",
    "durationHours": 24,
    "isHonorDuel": true
  }'
```

---

## Key Features

### Head-to-Head Trading Duels
Challenge any Adrena trader by wallet address. Both trade on live markets for 24 or 48 hours. Winner is determined by ROI comparison with automatic settlement. Supports both honor duels (Mutagen rewards) and staked duels (on-chain escrow).

### On-Chain Escrow (Devnet)
Anchor program (`BQQnoKSbNBVjFuiGB33QWymz6PhczDmRFmeLMJ3MGvwQ`) provides trustless custody for staked competitions. 9 instructions cover the full lifecycle: create, fund, settle, refund, cancel. PDA-owned vaults, allowlisted mints (ADX/USDC), configurable treasury fee (max 5%), emergency pause/resume. All 27 security audit findings addressed.

### Multi-Round Gauntlet
Progressive elimination tournaments with 1-5 configurable rounds, custom durations, and intermission periods. Bottom 50% eliminated per round. Forfeit for zero trades. Per-round snapshots and Arena Score ranking.

### Clan Wars
Form clans of 3-5 members, challenge rival clans, and compete as a team. Synergy bonus: +5% per member beyond 1 (max +20%). Staked clan wars supported via the same escrow program. Full clan management UI.

### Seasonal Championship
4-week meta-competition aggregating points from all modes. Duel wins earn 10 points, gauntlet placements earn 15-50 points. Season pass with milestone progression and unlockable rewards.

### Shareable Challenge Cards
Every duel generates a PNG challenge card via Satori with bundled Inter font, served with OpenGraph meta tags. Share the URL on Twitter or Discord and the card unfurls with both traders, asset, stakes, and a direct spectator link.

### Real-Time Updates
- **SSE streams** for duel updates (`GET /api/arena/duels/:id/stream`) and leaderboards (`GET /api/arena/competitions/:id/stream`)
- **WebSocket** for live duel state changes (`ws://localhost:3000/ws/duels`)

### Spectator Predictions
Any user can predict the winner of an active duel. Correct predictions earn 10 Mutagen. Prediction window locks at 90% of duel duration to prevent last-second sniping.

### Streaks and Titles
Win streaks award visible titles (Hot Streak at 3, Arena Champion at 5, Legendary Duelist at 10) and Mutagen multipliers (1.0x to 2.0x). Titles reset on loss, creating constant tension.

### Revenge Mechanic
30-minute revenge window after duel settlement. Loser can rematch with same asset/duration. Revenge duels award 1.5x Mutagen (stacks with streak multiplier).

### Open Challenge Board
Broadcast challenges without needing an opponent's wallet. Open challenges get 24h expiry and appear in the Arena hub. Anyone can accept.

### Discord Bot Integration
Challenge notifications and duel results delivered to configured Discord channels via discord.js. Embeds include challenge card images and action buttons.

### Anti-Manipulation
- Minimum 60-second hold time (prevents wash trading)
- Minimum $50 position size for scoring eligibility
- Full competition window enforcement (entry and exit must fall within bounds)
- `SELECT ... FOR UPDATE` row locking prevents double-accept race conditions
- Advisory locks prevent concurrent duel settlement
- Anti-sybil engine with collusion detection and risk scoring (0-100)

### Admin System
API-key-authenticated admin endpoints for season CRUD, competition cancellation, user ban/unban, and escrow pause/resume.

### Webhook System
Persistent DB-backed webhooks with HMAC-SHA256 signing, exponential backoff retry, and dead-letter delivery tracking. 9 typed events.

### Adrena Integration
4 adapter interfaces (Mutagen, Leaderboard, Quest, Streak) with real implementations. Adapters log locally when external URLs are not configured, enabling standalone operation.

---

## Project Structure

```
AdrenaX_Arena/
├── package.json                 # Workspace root (pnpm)
├── pnpm-workspace.yaml
├── docker-compose.yml           # PostgreSQL 16 + Redis 7
├── .env.example
├── docs/
│   ├── design.md                # Full design specification (1000+ lines)
│   ├── deployment.md            # Local dev, Railway, Solana deployment
│   ├── api-reference.md         # Complete API documentation
│   ├── integration-guide.md     # Adrena integration architecture
│   ├── escrow.md                # On-chain escrow program documentation
│   ├── test-results.md          # Test results and verification
│   ├── competition-report.md    # Test competition walkthrough
│   └── competitor-analysis.md   # Competitive differentiation
│
├── programs/
│   └── arena-escrow/            # Anchor program (Rust)
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs           # 9 instructions
│           ├── state.rs         # ArenaConfig, CompetitionEscrow PDAs
│           ├── errors.rs        # Custom error codes
│           └── events.rs        # 8 on-chain events
│
├── packages/
│   ├── arena-server/
│   │   └── src/
│   │       ├── index.ts         # Express app, WebSocket server, background jobs
│   │       ├── config.ts        # Zod-validated environment config (30 vars)
│   │       ├── adrena/
│   │       │   ├── client.ts    # Adrena API client (datapi.adrena.trade)
│   │       │   └── adapters/    # Mutagen, Leaderboard, Quest, Streak adapters
│   │       ├── db/
│   │       │   ├── connection.ts
│   │       │   ├── migrate.ts   # 10 migrations, 18 tables
│   │       │   └── types.ts     # Kysely-typed schema interfaces
│   │       ├── engine/
│   │       │   ├── duel.ts      # Duel lifecycle (create/accept/settle/expire)
│   │       │   ├── gauntlet.ts  # Multi-round gauntlet (register/activate/round/settle)
│   │       │   ├── clan.ts      # Clan management and war logic
│   │       │   ├── season.ts    # Season lifecycle and point aggregation
│   │       │   ├── scoring.ts   # 4-component Arena Score, ROI, Mutagen
│   │       │   ├── streaks.ts   # Win/loss streaks, titles, multipliers
│   │       │   ├── anti-sybil.ts # Collusion detection, risk scoring
│   │       │   ├── indexer.ts   # BullMQ trade indexer worker
│   │       │   └── utils.ts     # Shared utilities
│   │       ├── routes/
│   │       │   ├── duels.ts     # Duel CRUD, SSE, predictions, escrow intents, revenge
│   │       │   ├── competitions.ts  # Gauntlet CRUD, SSE, rounds, settlement snapshots
│   │       │   ├── users.ts     # Profile, stats, auth nonce, leaderboard, streaks
│   │       │   ├── clans.ts     # Clan CRUD, wars, escrow intents, rankings
│   │       │   ├── season.ts    # Current season, standings, pass progress
│   │       │   ├── webhooks.ts  # Webhook registration, listing, deletion
│   │       │   └── admin.ts     # Season CRUD, ban/unban, escrow pause/resume
│   │       ├── solana/
│   │       │   └── escrow-client.ts  # Anchor escrow program client
│   │       ├── rewards/
│   │       │   └── distributor.ts    # Reward processing
│   │       ├── cards/
│   │       │   └── challenge-card.ts # Satori OG image generation
│   │       └── middleware/
│   │           ├── auth.ts      # Wallet signature + admin API key verification
│   │           └── rate-limit.ts
│   │
│   └── arena-ui/
│       └── src/
│           ├── app/
│           │   ├── page.tsx             # Landing page
│           │   └── arena/
│           │       ├── page.tsx         # Arena dashboard
│           │       ├── duels/page.tsx   # Duel list with filters
│           │       ├── duels/[id]/page.tsx    # Live duel view
│           │       ├── duels/DuelsPageClient.tsx # Client-side duel page
│           │       ├── clans/[id]/page.tsx    # Clan detail page
│           │       ├── seasons/page.tsx       # Season standings
│           │       ├── gauntlet/[id]/page.tsx # Gauntlet view
│           │       └── challenge/[id]/page.tsx # Challenge accept page
│           ├── components/
│           │   ├── DuelCard.tsx          # Duel summary card
│           │   ├── DuelBattle.tsx        # Live duel battle view
│           │   ├── LiveLeaderboard.tsx   # SSE-powered leaderboard
│           │   ├── PredictionWidget.tsx  # Spectator prediction UI
│           │   ├── ChallengeCard.tsx     # Challenge card display
│           │   ├── CountdownTimer.tsx
│           │   └── OnboardingModal.tsx
│           ├── hooks/
│           │   ├── useArenaAPI.ts        # API client hook
│           │   ├── useSSELeaderboard.ts  # SSE stream hook
│           │   └── useDuelWS.ts          # WebSocket hook
│           └── lib/
│               ├── api.ts               # Fetch wrapper
│               └── types.ts             # Shared type definitions
```

---

## API Endpoints

### Duels

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/arena/duels` | Wallet | Create duel challenge (direct or open) |
| `POST` | `/api/arena/duels/:id/accept` | Wallet | Accept challenge |
| `GET` | `/api/arena/duels/:id` | No | Duel details with participants and predictions |
| `GET` | `/api/arena/duels` | No | List duels (filter by status, wallet, asset, type) |
| `GET` | `/api/arena/duels/:id/stream` | No | SSE duel updates |
| `POST` | `/api/arena/duels/:id/predict` | Wallet | Submit prediction |
| `GET` | `/api/arena/duels/:id/predictions` | No | Prediction stats |
| `POST` | `/api/arena/duels/revenge` | Wallet | Create revenge duel (rate-limited) |
| `GET` | `/api/arena/duels/revenge/:wallet` | No | Check active revenge windows |
| `POST` | `/api/arena/duels/:id/escrow/challenger-intent` | Wallet | Build unsigned escrow create tx |
| `POST` | `/api/arena/duels/:id/escrow/challenger-confirm` | Wallet | Confirm challenger deposit tx |
| `POST` | `/api/arena/duels/:id/escrow/defender-intent` | Wallet | Build unsigned escrow fund tx |

### Competitions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/arena/competitions` | No | List competitions (filter by mode, status) |
| `GET` | `/api/arena/competitions/:id` | No | Competition details with participants |
| `GET` | `/api/arena/competitions/:id/stream` | No | SSE leaderboard |
| `POST` | `/api/arena/competitions/gauntlet` | Wallet | Create Gauntlet |
| `POST` | `/api/arena/competitions/:id/register` | Wallet | Register for Gauntlet |
| `GET` | `/api/arena/competitions/:id/rounds` | No | Round snapshots |
| `GET` | `/api/arena/competitions/:id/settlement` | No | Settlement snapshot |
| `GET` | `/api/arena/competitions/seasons/:id/leaderboard` | No | Season leaderboard |

### Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/arena/users/nonce/:wallet` | No | Get auth nonce |
| `GET` | `/api/arena/users/:wallet/profile` | No | Trader profile and stats |
| `GET` | `/api/arena/users/:wallet/streak` | No | Streak stats and title |
| `GET` | `/api/arena/users/leaderboard` | No | Global leaderboard (weekly/monthly) |

### Clans

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/arena/clans` | Wallet | Create clan |
| `POST` | `/api/arena/clans/:id/join` | Wallet | Join clan |
| `DELETE` | `/api/arena/clans/membership` | Wallet | Leave clan |
| `GET` | `/api/arena/clans/rankings` | No | Clan rankings by war score |
| `GET` | `/api/arena/clans/:id` | No | Clan details with members |
| `GET` | `/api/arena/clans/:id/wars` | No | Clan war history |
| `POST` | `/api/arena/clans/:id/challenge` | Wallet | Challenge another clan |
| `POST` | `/api/arena/clans/wars/:warId/accept` | Wallet | Accept clan war |
| `POST` | `/api/arena/clans/wars/:warId/escrow/challenger-intent` | Wallet | Build clan war escrow tx |
| `POST` | `/api/arena/clans/wars/:warId/escrow/challenger-confirm` | Wallet | Confirm clan war deposit |
| `POST` | `/api/arena/clans/wars/:warId/escrow/defender-intent` | Wallet | Build defender escrow tx |

### Seasons

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/arena/season/current` | No | Current active season |
| `GET` | `/api/arena/season/standings` | No | Season point standings |
| `GET` | `/api/arena/season/pass/:wallet` | No | Season pass progress |

### Webhooks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/arena/webhooks` | Admin | Register webhook |
| `GET` | `/api/arena/webhooks` | Admin | List webhooks |
| `DELETE` | `/api/arena/webhooks/:id` | Admin | Delete webhook |

### Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/admin/seasons` | API Key | Create season |
| `PATCH` | `/api/admin/seasons/:id` | API Key | Update season |
| `GET` | `/api/admin/seasons` | API Key | List seasons |
| `POST` | `/api/admin/competitions/:id/cancel` | API Key | Cancel competition |
| `POST` | `/api/admin/users/:wallet/ban` | API Key | Ban user |
| `POST` | `/api/admin/users/:wallet/unban` | API Key | Unban user |
| `POST` | `/api/admin/escrow/pause` | API Key | Pause escrow program |
| `POST` | `/api/admin/escrow/resume` | API Key | Resume escrow program |
| `GET` | `/api/admin/webhooks` | API Key | List webhooks (admin view) |

### Other

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/health` | No | Health check |
| `GET` | `/api/arena/challenge/:id/card.png` | No | Challenge card PNG |
| `WS` | `/ws/duels` | No | Live duel WebSocket |

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/design.md](docs/design.md) | Full design specification: all 4 modes, scoring formulas, Mutagen integration, abuse prevention, prize pool economics |
| [docs/deployment.md](docs/deployment.md) | Local dev, Railway, and Solana deployment guide |
| [docs/api-reference.md](docs/api-reference.md) | Complete REST API documentation with examples |
| [docs/integration-guide.md](docs/integration-guide.md) | Adrena integration architecture: adapters, webhooks, migration path |
| [docs/escrow.md](docs/escrow.md) | On-chain Anchor escrow program: instructions, accounts, security audit |
| [docs/test-results.md](docs/test-results.md) | 132 unit tests, E2E results, Adrena API validation |
| [docs/competition-report.md](docs/competition-report.md) | Full test competition walkthrough with observations |
| [docs/competitor-analysis.md](docs/competitor-analysis.md) | Competitive differentiation vs Bybit, dYdX, GMX, Drift |

---

## Test Results

132 unit tests passing across 7 test files:

```
 scoring.test.ts       53 tests   (4-component Arena Score, ROI, Mutagen, tiebreaks)
 duel-features.test.ts 27 tests   (open challenges, revenge, filters, config safety)
 streaks.test.ts       26 tests   (titles, multipliers, progression simulation)
 gauntlet.test.ts       8 tests   (elimination math, multi-round chains, forfeits)
 clan.test.ts           7 tests   (synergy bonus, averaging, edge cases)
 anti-sybil.test.ts     7 tests   (collusion scores, frequency flags, even distribution)
 utils.test.ts          4 tests   (hash isolation, determinism, positivity)
```

E2E test script validates 50+ checks across 17 categories. Adrena API schema validated against live data (29/29 checks).

---

## Verification Checklist

| # | Step | Validates |
|---|------|-----------|
| 1 | `docker compose up -d` -- both containers healthy | Infrastructure |
| 2 | `pnpm db:migrate` -- all 10 migrations applied, 18 tables created | Schema |
| 3 | `curl /api/health` returns `{"status":"ok"}` | Server + DB connection |
| 4 | `pnpm test` -- 132/132 tests passing | Engine correctness |
| 5 | `GET /api/arena/users/nonce/:wallet` returns nonce | Auth flow |
| 6 | `POST /api/arena/duels` with signed request creates duel | Duel creation |
| 7 | `POST /api/arena/duels/:id/accept` transitions to active | Duel acceptance + row locking |
| 8 | `GET /api/arena/duels/:id/stream` returns SSE events | Real-time updates |
| 9 | `GET /api/arena/challenge/:id/card.png` returns PNG | Challenge card generation |
| 10 | `POST /api/arena/duels/:id/predict` records prediction | Spectator system |
| 11 | `POST /api/arena/competitions/gauntlet` + register | Gauntlet lifecycle |
| 12 | `POST /api/arena/clans` + join + challenge | Clan wars |
| 13 | `GET /api/arena/season/current` returns season data | Season system |
| 14 | `POST /api/admin/seasons` creates season (API key auth) | Admin system |
| 15 | Stale duel expires after 1 hour (background job) | Automatic cleanup |
| 16 | Escrow program deployed at `BQQnoKSb...` on devnet | On-chain escrow |
| 17 | `POST /api/arena/duels/:id/escrow/challenger-intent` returns unsigned tx | Escrow integration |

---

## License

MIT
