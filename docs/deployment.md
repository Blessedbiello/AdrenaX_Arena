# AdrenaX Arena Deployment Guide

This guide covers local development setup, production deployment on Railway, Solana escrow program deployment, environment configuration, database management, and monitoring.

---

## Table of Contents

- [Local Development Setup](#local-development-setup)
- [Railway Deployment](#railway-deployment)
- [Solana Escrow Program Deployment](#solana-escrow-program-deployment)
- [Environment Variables Reference](#environment-variables-reference)
- [Docker Compose Services](#docker-compose-services)
- [Database Management](#database-management)
- [Monitoring](#monitoring)

---

## Local Development Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Runtime |
| pnpm | 8+ | Package manager (monorepo workspaces) |
| Docker & Docker Compose | Latest | PostgreSQL and Redis containers |
| Git | Latest | Version control |
| Rust + Anchor CLI | 0.30.1 | Only if deploying/modifying the escrow program |
| Solana CLI | 1.18+ | Only if deploying/modifying the escrow program |

### 1. Clone and Install

```bash
git clone <repository-url> AdrenaX_Arena
cd AdrenaX_Arena
pnpm install
```

The monorepo contains three main components:

- `packages/arena-server` -- Express API server (port 3000)
- `packages/arena-ui` -- Next.js frontend (port 3001)
- `programs/arena-escrow` -- Anchor escrow program (Solana)

### 2. Configure Environment

Copy the example environment file and adjust values as needed:

```bash
cp .env.example .env
```

The defaults in `.env.example` are suitable for local development with Docker Compose. See the [Environment Variables Reference](#environment-variables-reference) for the full list.

### 3. Start Infrastructure

Start PostgreSQL 16 and Redis 7 using Docker Compose:

```bash
docker-compose up -d
```

Verify the containers are healthy:

```bash
docker-compose ps
```

You should see both `postgres` and `redis` services with status `Up (healthy)`.

PostgreSQL is available at `localhost:5432` with credentials `arena:arena_dev` and database `adrenax_arena`. Redis is available at `localhost:6379` with no authentication.

### 4. Run Database Migrations

Create the Arena schema tables:

```bash
pnpm db:migrate
```

This runs the Kysely migration in `packages/arena-server/src/db/migrate.ts`, applying all 10 migrations and creating 18 tables:

**Migration 001 -- Initial (9 tables):**
- `arena_seasons`
- `arena_competitions`
- `arena_participants`
- `arena_trades`
- `arena_duels`
- `arena_predictions`
- `arena_round_snapshots`
- `arena_rewards`
- `arena_season_points`

**Migration 002 -- User Stats:**
- `arena_user_stats` (streaks, titles, multipliers)

**Migration 003 -- Clans:**
- `arena_clans`
- `arena_clan_members`

**Migration 004 -- Webhooks:**
- `arena_webhooks`
- `arena_webhook_deliveries`

**Migration 005 -- Settlement Snapshots:**
- `arena_settlement_snapshots`

**Migration 006 -- Admin:**
- Adds `banned_at`, `banned_reason` columns to `arena_user_stats`
- Adds `dispute_status` column to `arena_competitions`

**Migration 007 -- Clan Wars:**
- `arena_clan_wars`

**Migration 008 -- Production Duel Escrow:**
- Adds `escrow_state`, `challenger_deposit_tx`, `defender_deposit_tx` columns to `arena_duels`
- `arena_clan_cooldowns`

**Migration 009 -- Season Pass Progress:**
- `arena_season_pass_progress`

**Migration 010 -- Clan War Escrow:**
- Adds `escrow_state`, `challenger_deposit_tx`, `defender_deposit_tx`, `escrow_tx`, `settlement_tx` columns to `arena_clan_wars`

### 5. Start Development Servers

Start both the API server and UI in development mode with hot reload:

```bash
# Both at once
pnpm dev

# Or individually
pnpm dev:server   # API on http://localhost:3000
pnpm dev:ui       # UI on http://localhost:3001
```

The API server uses `tsx watch` for hot reload. The UI uses Next.js built-in dev server.

### 6. Verify the Installation

Check the health endpoint:

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{ "status": "ok", "timestamp": "2026-03-25T12:00:00.000Z" }
```

### 7. Run Tests

```bash
pnpm test
```

Expect 132/132 tests passing across 7 test files. Tests use Vitest and are located in `packages/arena-server/src/engine/__tests__/`.

### 8. Create Test Data

You can create test duels and competitions using curl. First, get a nonce for a test wallet:

```bash
# Get nonce
curl http://localhost:3000/api/arena/users/nonce/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# For development, you can temporarily bypass auth in the code or use a
# Solana keypair to sign the nonce message. See the API reference for
# the full authentication flow.
```

List duels to confirm the API is working:

```bash
curl http://localhost:3000/api/arena/duels
```

---

## Railway Deployment

[Railway](https://railway.app) is the recommended deployment platform. The monorepo can be deployed as separate services.

### 1. Create a Railway Project

Create a new project on Railway and connect your GitHub repository.

### 2. Add Database Services

Add the following services from the Railway marketplace:

**PostgreSQL:**
- Add a PostgreSQL plugin.
- Railway provisions a managed PostgreSQL instance and sets `DATABASE_URL` automatically.
- No additional configuration needed -- the connection pool in the server handles SSL for production environments.

**Redis:**
- Add a Redis plugin.
- Railway sets `REDIS_URL` automatically.
- Used for the BullMQ trade indexer job queue.

### 3. Configure the API Server Service

Create a service for `arena-server`:

- **Root Directory:** `packages/arena-server`
- **Build Command:** `pnpm install && pnpm build`
- **Start Command:** `node dist/index.js`

Set the following environment variables (Railway auto-injects `DATABASE_URL` and `REDIS_URL` from the plugins):

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` (or use Railway's `$PORT`) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (auto from plugin) |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` (auto from plugin) |
| `ADRENA_API_BASE` | `https://datapi.adrena.trade` |
| `CORS_ORIGIN` | Your frontend URL |
| `CHALLENGE_CARD_BASE_URL` | Your frontend URL |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` (or mainnet) |
| `PROGRAM_ID` | `BQQnoKSbNBVjFuiGB33QWymz6PhczDmRFmeLMJ3MGvwQ` |
| `TREASURY_PUBKEY` | Your treasury wallet pubkey |
| `OPERATOR_KEYPAIR_PATH` | Path to operator keypair JSON |
| `ADX_MINT` | ADX token mint address |
| `USDC_MINT` | USDC token mint address |
| `ADMIN_API_KEY` | Strong random string for admin API access |
| `DISCORD_BOT_TOKEN` | (optional) Discord bot token for notifications |
| `DISCORD_CHANNEL_ID` | (optional) Discord channel ID for notifications |

### 4. Configure the UI Service

Create a service for `arena-ui`:

- **Root Directory:** `packages/arena-ui`
- **Build Command:** `pnpm install && pnpm build`
- **Start Command:** `pnpm start`

Set `NEXT_PUBLIC_API_URL` pointing to the API server URL.

### 5. Run Migrations in Production

After the database is provisioned and before the first deployment, run migrations:

**Using Railway CLI:**

```bash
npm install -g @railway/cli
railway link
railway run pnpm db:migrate
```

**Or add a deploy hook in your build command:**

```bash
pnpm install && pnpm build && pnpm db:migrate
```

### 6. Configure Networking

- Enable the public domain for the API server service.
- If using WebSocket connections, ensure your Railway plan supports persistent connections.
- Set `CORS_ORIGIN` to your frontend's public URL.

### 7. Deploy

Push to your connected GitHub branch. Railway triggers an automatic build and deploy.

---

## Solana Escrow Program Deployment

The Arena Escrow program is an Anchor 0.30.1 program providing trustless custody for staked competitions.

### Current Deployment

| Field | Value |
|---|---|
| **Program ID** | `BQQnoKSbNBVjFuiGB33QWymz6PhczDmRFmeLMJ3MGvwQ` |
| **Cluster** | Devnet |
| **IDL Account** | `9aYKXk2ppRD4PJfxtA9MLtdLuMV41TwuffqQ1EZJaoKy` |
| **Upgrade Authority** | `3fMoA42W8MzvA86ZUFiRj5ayoEuwmDkz1qtZGiY5ooWR` |

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"

# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli
```

### Building the Program

```bash
cd programs/arena-escrow
anchor build
```

The compiled program is at `target/deploy/arena_escrow.so`. The IDL is at `target/idl/arena_escrow.json`.

### Deploying to Devnet

```bash
# Configure Solana CLI for devnet
solana config set --url https://api.devnet.solana.com

# Ensure your deployer keypair has SOL
solana airdrop 5

# Deploy
anchor deploy --provider.cluster devnet

# Initialize the config (run once after first deployment)
# This sets the treasury, fee basis points, and allowed mints
anchor run initialize-config -- \
  --treasury <TREASURY_PUBKEY> \
  --fee-bps 200 \
  --mints <ADX_MINT>,<USDC_MINT>
```

### Deploying to Mainnet

```bash
solana config set --url https://api.mainnet-beta.solana.com
anchor deploy --provider.cluster mainnet
```

Ensure the deployer wallet has sufficient SOL for program deployment rent (~3.5 SOL for a program of this size).

### Post-Deployment Verification

```bash
# Verify program is deployed
solana program show BQQnoKSbNBVjFuiGB33QWymz6PhczDmRFmeLMJ3MGvwQ

# Verify IDL is published
anchor idl fetch BQQnoKSbNBVjFuiGB33QWymz6PhczDmRFmeLMJ3MGvwQ --provider.cluster devnet
```

For full escrow program documentation, see [escrow.md](escrow.md).

---

## Environment Variables Reference

All environment variables are validated at startup using Zod in `packages/arena-server/src/config.ts`. The server will fail to start if required variables are missing or malformed.

### Core Server

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `NODE_ENV` | `string` | No | `development` | Environment mode. One of: `development`, `production`, `test`. |
| `PORT` | `number` | No | `3000` | HTTP server port. WebSocket runs on the same port. |
| `DATABASE_URL` | `string` | No | `postgresql://arena:arena_dev@localhost:5432/adrenax_arena` | PostgreSQL connection string. SSL enabled in production. Pool max: 20, idle timeout: 30s. |
| `REDIS_URL` | `string` | No | `redis://localhost:6379` | Redis connection string for BullMQ. Server starts without Redis but logs a warning. |
| `ADRENA_API_BASE` | `string` | No | `https://datapi.adrena.trade` | Base URL for the Adrena data API. |
| `DEV_MODE_SKIP_AUTH` | `boolean` | No | `false` | Skip wallet signature verification. **Blocked in production.** |
| `CORS_ORIGIN` | `string` | No | `http://localhost:3001` | Allowed CORS origin. |
| `CHALLENGE_CARD_BASE_URL` | `string` | No | `http://localhost:3001` | Base URL for challenge card links. |

### Discord

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `DISCORD_BOT_TOKEN` | `string` | No | *(empty)* | Discord bot token for notifications. Optional. |
| `DISCORD_CHANNEL_ID` | `string` | No | *(empty)* | Discord channel ID. Required if `DISCORD_BOT_TOKEN` is set. |

### Solana / Escrow

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `SOLANA_RPC_URL` | `string` | No | `http://localhost:8899` | Solana RPC endpoint. Use devnet or mainnet URL. |
| `PROGRAM_ID` | `string` | No | *(empty)* | Arena Escrow program ID. Enables escrow features when set. |
| `ESCROW_CONFIG_PDA` | `string` | No | *(empty)* | Pre-computed config PDA (optional, derived if not set). |
| `TREASURY_PUBKEY` | `string` | Prod | *(empty)* | Treasury wallet for protocol fees. **Required in production if PROGRAM_ID is set.** |
| `OPERATOR_KEYPAIR_PATH` | `string` | Prod | *(empty)* | Path to operator keypair JSON. **Required in production if PROGRAM_ID is set.** |
| `ADX_MINT` | `string` | Prod | *(empty)* | ADX token mint address. **Required in production if PROGRAM_ID is set.** |
| `USDC_MINT` | `string` | Prod | *(empty)* | USDC token mint address. **Required in production if PROGRAM_ID is set.** |

### Admin

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `ADMIN_API_KEY` | `string` | No | *(empty)* | API key for admin endpoints. |
| `ADMIN_WALLETS` | `string` | No | *(empty)* | Comma-separated list of admin wallet pubkeys. |

### Adrena Integration

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `ADRENA_MUTAGEN_API_URL` | `string` | No | *(empty)* | Adrena Mutagen API URL. Adapters log locally when not set. |
| `ADRENA_QUEST_WEBHOOK_URL` | `string` | No | *(empty)* | Adrena Quest webhook URL. |
| `ADRENA_LEADERBOARD_API_URL` | `string` | No | *(empty)* | Adrena Leaderboard API URL. |

### Anti-Sybil

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `ENABLE_SYBIL_CHECKS` | `boolean` | No | `false` | Enable anti-sybil checks on duel creation. |
| `MIN_WALLET_AGE_DAYS` | `number` | No | `7` | Minimum wallet age in days. |
| `MIN_CLOSED_POSITIONS` | `number` | No | `3` | Minimum closed positions to participate. |

### Production Safety

The server enforces these rules in production (`NODE_ENV=production`):

- `DEV_MODE_SKIP_AUTH=true` causes the server to exit with a critical error.
- `CHALLENGE_CARD_BASE_URL` or `CORS_ORIGIN` containing "localhost" triggers a console warning.
- If `PROGRAM_ID` is set, `TREASURY_PUBKEY`, `OPERATOR_KEYPAIR_PATH`, `ADX_MINT`, and `USDC_MINT` must all be set or the server exits.

---

## Docker Compose Services

The `docker-compose.yml` at the project root provides PostgreSQL and Redis for local development.

### PostgreSQL

| Setting | Value |
|---------|-------|
| Image | `postgres:16-alpine` |
| Port | `5432` |
| User | `arena` |
| Password | `arena_dev` |
| Database | `adrenax_arena` |
| Volume | `pgdata` (persistent) |
| Health check | `pg_isready -U arena` every 5s |

Connection string: `postgresql://arena:arena_dev@localhost:5432/adrenax_arena`

### Redis

| Setting | Value |
|---------|-------|
| Image | `redis:7-alpine` |
| Port | `6379` |
| Authentication | None |
| Volume | `redisdata` (persistent) |
| Health check | `redis-cli ping` every 5s |

Connection string: `redis://localhost:6379`

### Common Commands

```bash
# Start services in background
docker-compose up -d

# View logs
docker-compose logs -f postgres
docker-compose logs -f redis

# Stop services (data preserved in volumes)
docker-compose down

# Stop services and delete all data
docker-compose down -v

# Restart a single service
docker-compose restart postgres
```

---

## Database Management

### Running Migrations

Migrations are defined inline in `packages/arena-server/src/db/migrate.ts` using Kysely's `Migrator`. There are 10 migrations creating 18 tables.

```bash
# From the project root
pnpm db:migrate

# Or from the arena-server package
cd packages/arena-server
pnpm db:migrate
```

The migration script connects using `DATABASE_URL` from the environment (falling back to the local Docker Compose default). Migration state is tracked by Kysely in a `kysely_migration` table.

### Connecting to the Database

**Local (Docker Compose):**

```bash
# Using psql inside the container
docker-compose exec postgres psql -U arena adrenax_arena

# Using psql from host (if installed)
psql postgresql://arena:arena_dev@localhost:5432/adrenax_arena
```

**Production (Railway):**

```bash
railway connect postgres
```

### Useful Queries

```sql
-- Count active duels
SELECT COUNT(*) FROM arena_duels WHERE status = 'active';

-- Leaderboard for a competition
SELECT user_pubkey, roi_percent, pnl_usd, positions_closed, arena_score
FROM arena_participants
WHERE competition_id = '<uuid>'
ORDER BY roi_percent DESC;

-- Clan rankings
SELECT name, tag, total_war_score, wars_won, wars_played, member_count
FROM arena_clans ORDER BY total_war_score DESC;

-- Season standings
SELECT user_pubkey, total_points, duel_points, gauntlet_points, clan_points
FROM arena_season_points WHERE season_id = 1 ORDER BY total_points DESC;

-- Pending webhook deliveries
SELECT * FROM arena_webhook_deliveries WHERE status = 'pending' ORDER BY created_at;

-- Check escrow states
SELECT id, status, escrow_state, stake_amount, stake_token
FROM arena_duels WHERE escrow_state != 'not_required';

-- Check migration status
SELECT * FROM kysely_migration ORDER BY timestamp;
```

### Type Generation with kysely-codegen

The database types in `packages/arena-server/src/db/types.ts` are manually defined to match the migration schema. If you modify the schema, you can regenerate types from the live database:

```bash
pnpm db:generate
```

---

## Monitoring

### Health Check Endpoint

The `GET /api/health` endpoint verifies database connectivity:

```bash
curl http://localhost:3000/api/health
```

| Status | Response | Meaning |
|--------|----------|---------|
| 200 | `{ "status": "ok", "timestamp": "..." }` | Server and database are healthy |
| 503 | `{ "status": "error", "message": "Database unavailable" }` | Database connection failed |

### Log Output

The server writes structured log lines to stdout. Log prefixes indicate the subsystem:

| Prefix | Subsystem | Example |
|--------|-----------|---------|
| `[Arena]` | Server startup | `[Arena] AdrenaX Arena API running on port 3000` |
| `[Worker]` | BullMQ indexer | `[Worker] Indexer started` |
| `[Cleanup]` | Stale duel expiry | `[Cleanup] Expired 3 stale duels` |
| `[Duels]` | Duel route errors | `[Duels] Create error: ...` |
| `[Clans]` | Clan route errors | `[Clans] Challenge error: ...` |
| `[Season]` | Season route errors | `[Season] Standings error: ...` |
| `[Competitions]` | Competition route errors | `[Competitions] Register error: ...` |
| `[Admin]` | Admin route errors | `[Admin] Create season error: ...` |
| `[Webhooks]` | Webhook errors | `[Webhooks] Create error: ...` |
| `[Users]` | User route errors | `[Users] Profile error: ...` |
| `[SSE]` | SSE stream errors | `[SSE] Duel stream error: ...` |
| `[Card]` | Challenge card generation | `[Card] Generation error: ...` |
| `[Config]` | Config validation | `[Config] WARNING: CORS_ORIGIN contains "localhost"` |

### Background Jobs

The server runs two background processes:

1. **Trade Indexer** (BullMQ worker): Polls `ADRENA_API_BASE/position` to fetch trades for active competition participants. Requires Redis. Adaptive polling: 30s default, 10s in the final 5 minutes.

2. **Stale Duel Expiry** (setInterval, 60s): Checks for pending duels past their `expires_at` time and transitions them to `expired`. Also cancels the parent competition.

### Common Troubleshooting

**Server fails to start with "Database unavailable":**
- Verify Docker Compose is running: `docker-compose ps`
- Check the `DATABASE_URL` environment variable.
- Ensure migrations have been run: `pnpm db:migrate`

**Server exits with "DEV_MODE_SKIP_AUTH is enabled in production":**
- This is a safety check. Set `DEV_MODE_SKIP_AUTH=false` or remove it in production.

**Server exits with "Escrow is enabled but required settings are missing":**
- If `PROGRAM_ID` is set in production, you must also set `TREASURY_PUBKEY`, `OPERATOR_KEYPAIR_PATH`, `ADX_MINT`, and `USDC_MINT`.

**"Failed to start indexer (Redis may be unavailable)":**
- This is a warning, not a fatal error. The API server functions without Redis.
- If you need trade indexing, ensure Redis is running: `docker-compose up -d redis`

**CORS errors in the browser:**
- Verify `CORS_ORIGIN` matches the exact origin of your frontend (protocol + host + port).

**WebSocket connection refused:**
- The WebSocket server runs on the same port as HTTP at path `/ws/duels`.
- Ensure you are connecting to `ws://localhost:3000/ws/duels` (not `wss://` for local dev).

**Migrations fail with "relation already exists":**
- Kysely tracks applied migrations in the `kysely_migration` table. If corrupt, drop it and re-run:
  ```sql
  DROP TABLE kysely_migration; DROP TABLE kysely_migration_lock;
  ```
  Then re-run `pnpm db:migrate`. Only do this on a fresh database or after backing up.

### Graceful Shutdown

The server handles `SIGINT` and `SIGTERM` signals for graceful shutdown:

1. Stops the stale duel expiry interval.
2. Closes the BullMQ indexer worker.
3. Closes the HTTP server (stops accepting new connections).
4. Destroys the database connection pool.

This ensures clean shutdown on Railway deploys and local `Ctrl+C`.
