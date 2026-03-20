# AdrenaX Arena Deployment Guide

This guide covers local development setup, production deployment on Railway, environment configuration, database management, and monitoring.

---

## Table of Contents

- [Local Development Setup](#local-development-setup)
- [Railway Deployment](#railway-deployment)
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

### 1. Clone and Install

```bash
git clone <repository-url> AdrenaX_Arena
cd AdrenaX_Arena
pnpm install
```

The monorepo contains two packages:

- `packages/arena-server` -- Express API server (port 3000)
- `packages/arena-ui` -- Next.js frontend (port 3001)

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

This runs the inline Kysely migration in `packages/arena-server/src/db/migrate.ts`, creating all nine Arena tables:

- `arena_seasons`
- `arena_competitions`
- `arena_participants`
- `arena_trades`
- `arena_duels`
- `arena_predictions`
- `arena_round_snapshots`
- `arena_rewards`
- `arena_season_points`

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
{ "status": "ok", "timestamp": "2026-03-20T12:00:00.000Z" }
```

### 7. Create Test Data

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

### Running Tests

```bash
pnpm test
```

Tests use Vitest and are located in `packages/arena-server/src/engine/__tests__/`.

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
| `CORS_ORIGIN` | Your frontend URL (e.g., `https://arena-ui-production.up.railway.app`) |
| `CHALLENGE_CARD_BASE_URL` | Your frontend URL |
| `DISCORD_BOT_TOKEN` | (optional) Discord bot token for notifications |
| `DISCORD_CHANNEL_ID` | (optional) Discord channel ID for notifications |

### 4. Configure the UI Service

Create a service for `arena-ui`:

- **Root Directory:** `packages/arena-ui`
- **Build Command:** `pnpm install && pnpm build`
- **Start Command:** `pnpm start`

Set any necessary environment variables for the Next.js frontend (e.g., `NEXT_PUBLIC_API_URL` pointing to the API server URL).

### 5. Run Migrations in Production

After the database is provisioned and before the first deployment, run migrations. You can do this using the Railway CLI or a one-off command:

**Using Railway CLI:**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Link to your project
railway link

# Run migrations against the production database
railway run pnpm db:migrate
```

**Using the Railway shell:**

Navigate to your API server service in the Railway dashboard, open the shell, and run:

```bash
node -e "import('./dist/db/migrate.js')"
```

Or add a deploy hook in your build command:

```bash
pnpm install && pnpm build && pnpm db:migrate
```

### 6. Configure Networking

- Enable the public domain for the API server service.
- If using WebSocket connections, ensure your Railway plan supports persistent connections. Railway's proxy handles WebSocket upgrades on the `/ws/duels` path automatically.
- Set `CORS_ORIGIN` to your frontend's public URL.

### 7. Deploy

Push to your connected GitHub branch. Railway triggers an automatic build and deploy. Monitor the deploy logs in the Railway dashboard.

---

## Environment Variables Reference

All environment variables are validated at startup using Zod in `packages/arena-server/src/config.ts`. The server will fail to start if required variables are missing or malformed.

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `NODE_ENV` | `string` | No | `development` | Environment mode. One of: `development`, `production`, `test`. Controls SSL for database connections and other behavior. |
| `PORT` | `number` | No | `3000` | HTTP server port. The WebSocket server runs on the same port. |
| `DATABASE_URL` | `string` | No | `postgresql://arena:arena_dev@localhost:5432/adrenax_arena` | PostgreSQL connection string. In production, SSL is enabled automatically (`rejectUnauthorized: false`). Connection pool max: 20, idle timeout: 30s. |
| `REDIS_URL` | `string` | No | `redis://localhost:6379` | Redis connection string. Used by BullMQ for the trade indexer job queue. If Redis is unavailable, the server starts but logs a warning. |
| `ADRENA_API_BASE` | `string` | No | `https://datapi.adrena.trade` | Base URL for the Adrena data API. The indexer polls `/position` and other endpoints to track participant trades. |
| `DISCORD_BOT_TOKEN` | `string` | No | *(empty)* | Discord bot token for posting duel results and competition updates. Optional -- the server runs without Discord integration if not set. |
| `DISCORD_CHANNEL_ID` | `string` | No | *(empty)* | Discord channel ID where the bot posts notifications. Required if `DISCORD_BOT_TOKEN` is set. |
| `CHALLENGE_CARD_BASE_URL` | `string` | No | `http://localhost:3001` | Base URL used when generating challenge card links. Should point to the frontend in production. |
| `CORS_ORIGIN` | `string` | No | `http://localhost:3001` | Allowed CORS origin. Set to your frontend URL in production. Supports a single origin string. |

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

Migrations are defined inline in `packages/arena-server/src/db/migrate.ts` using Kysely's `Migrator`. There is currently one migration (`001_initial`) that creates all Arena tables.

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
# Using Railway CLI
railway connect postgres

# Or copy the DATABASE_URL from Railway dashboard and use psql
psql "$DATABASE_URL"
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

-- Recent predictions
SELECT * FROM arena_predictions ORDER BY prediction_locked_at DESC LIMIT 20;

-- Check migration status
SELECT * FROM kysely_migration ORDER BY timestamp;
```

### Type Generation with kysely-codegen

The database types in `packages/arena-server/src/db/types.ts` are manually defined to match the migration schema. If you modify the schema, you can regenerate types from the live database:

```bash
# Requires a running database with the current schema
pnpm db:generate
```

This runs `kysely-codegen --out-file src/db/types.ts` and produces TypeScript interfaces from the actual PostgreSQL schema. Review the output and adjust any custom type annotations (such as union types for status fields) that the code generator may not infer.

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

For production monitoring, configure your platform's health check to poll this endpoint. On Railway, this is set in the service settings under "Health Check Path": `/api/health`.

### Log Output

The server writes structured log lines to stdout. Log prefixes indicate the subsystem:

| Prefix | Subsystem | Example |
|--------|-----------|---------|
| `[Arena]` | Server startup | `[Arena] AdrenaX Arena API running on port 3000` |
| `[Worker]` | BullMQ indexer | `[Worker] Indexer started` |
| `[Cleanup]` | Stale duel expiry | `[Cleanup] Expired 3 stale duels` |
| `[Duels]` | Duel route errors | `[Duels] Create error: ...` |
| `[Competitions]` | Competition route errors | `[Competitions] Register error: ...` |
| `[Users]` | User route errors | `[Users] Profile error: ...` |
| `[SSE]` | SSE stream errors | `[SSE] Duel stream error: ...` |
| `[Card]` | Challenge card generation | `[Card] Generation error: ...` |

All error-level logs include the full error object. In production, pipe stdout to your log aggregation service (Railway captures logs automatically).

### Background Jobs

The server runs two background processes:

1. **Trade Indexer** (BullMQ worker): Polls `ADRENA_API_BASE/position` to fetch trades for active competition participants. Requires Redis. If Redis is unavailable at startup, the server logs a warning and continues without indexing.

2. **Stale Duel Expiry** (setInterval, 60s): Checks for pending duels past their `expires_at` time and transitions them to `expired`. Also cancels the parent competition. Logs a count when duels are expired.

### Common Troubleshooting

**Server fails to start with "Database unavailable":**
- Verify Docker Compose is running: `docker-compose ps`
- Check the `DATABASE_URL` environment variable.
- Ensure migrations have been run: `pnpm db:migrate`

**"Failed to start indexer (Redis may be unavailable)":**
- This is a warning, not a fatal error. The API server functions without Redis.
- If you need trade indexing, ensure Redis is running: `docker-compose up -d redis`

**CORS errors in the browser:**
- Verify `CORS_ORIGIN` matches the exact origin of your frontend (protocol + host + port).
- For local development, the default `http://localhost:3001` matches the Next.js dev server.

**WebSocket connection refused:**
- The WebSocket server runs on the same port as HTTP at path `/ws/duels`.
- Ensure you are connecting to `ws://localhost:3000/ws/duels` (not `wss://` for local dev).
- In production behind a proxy, ensure WebSocket upgrades are supported.

**Migrations fail with "relation already exists":**
- Kysely tracks applied migrations in the `kysely_migration` table. If the table exists but is corrupt, you can manually drop it and re-run: `DROP TABLE kysely_migration; DROP TABLE kysely_migration_lock;`
- Then re-run `pnpm db:migrate`. This will re-apply all migrations from scratch, so only do this on a fresh database or after backing up.

**Rate limiting in development:**
- The general rate limit is 100 requests per minute. If you hit this during testing, restart the server or wait 60 seconds.
- Rate limit responses return status 429 with `{ "success": false, "error": "RATE_LIMIT", "message": "Too many requests" }`.

**Challenge card generation fails:**
- The card renderer uses Satori and @resvg/resvg-js. If these fail (e.g., missing system fonts in production), the endpoint falls back to returning JSON metadata.
- Ensure the production environment has basic font support or include fonts in the deployment.

### Graceful Shutdown

The server handles `SIGINT` and `SIGTERM` signals for graceful shutdown:

1. Stops the stale duel expiry interval.
2. Closes the BullMQ indexer worker.
3. Closes the HTTP server (stops accepting new connections).
4. Destroys the database connection pool.

This ensures clean shutdown on Railway deploys and local `Ctrl+C`.
