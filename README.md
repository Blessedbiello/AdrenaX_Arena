# AdrenaX Arena

**Peer-to-peer trading duels on Solana.**

A competitive trading layer for [Adrena](https://adrena.xyz), the Solana perpetual DEX. Challenge any trader to a head-to-head duel, survive progressive elimination in The Gauntlet, and climb the seasonal championship ranks -- all scored from real trades on Adrena's live markets.

---

## The Problem

Trading competitions on perpetual DEXs are stuck in a single format: fixed-window leaderboards ranked by PnL or volume. These suffer from predictable failure modes:

- **Whales dominate early.** Most participants disengage once the top of the board becomes unreachable.
- **No social layer.** Competitions are solitary. There is no way to directly challenge another trader.
- **No retention loop.** When the competition ends, there is no reason to come back.
- **One-dimensional scoring.** Pure PnL rewards reckless leverage, not skill.

No perp DEX -- on Solana or elsewhere -- offers 1v1 challenges, progressive elimination, or team-based competition formats.

## The Solution

AdrenaX Arena introduces **duels as the atomic unit of competition**. One trader challenges another. Both trade on Adrena. Higher ROI wins. It is simple, personal, and shareable.

Every duel generates a **challenge card** -- a dynamically rendered OG image optimized for Twitter and Discord. Share the link, the card unfurls, and anyone can click through to spectate or make predictions. This turns every duel into a potential acquisition event.

The **Gauntlet** is the volume engine: a progressive elimination tournament where the bottom 50% are cut each round, creating sustained engagement across multiple days instead of a single leaderboard grind.

Both modes feed into a **Seasonal Championship** that gives every trade on Adrena long-term competitive meaning.

---

## Competition Modes

| Mode | Format | Status |
|------|--------|--------|
| **Duels** | 1v1 head-to-head, 24h or 48h, honor or staked (ADX/USDC escrow) | Prototyped -- full engine, API, and UI |
| **The Gauntlet** | Progressive elimination tournament (2-128 players), ranked by composite Arena Score | Prototyped -- engine and API |
| **Clan Wars** | Team-based (3-5 members), weekly rankings with synergy bonuses | Designed -- see [design.md](docs/design.md) |
| **Seasonal Championship** | 4-week meta-competition aggregating points from all modes | Designed -- schema and point system in place |

---

## Architecture

```
+------------------+       +------------------+       +------------------+
|                  |  REST |                  |       |                  |
|   Arena UI       |<----->|   Arena Server   |<----->|   PostgreSQL     |
|   (Next.js)      |  SSE  |   (Express/TS)   |       |   9 tables       |
|   port 3001      |  WS   |   port 3000      |       |   port 5432      |
|                  |       |                  |       |                  |
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
                           +--------+---------+
                           |                  |
                           |  Adrena Data API |
                           |  (External)      |
                           |  datapi.adrena.  |
                           |  trade           |
                           +------------------+
```

The server polls Adrena's public API for position data. All competition logic runs off-chain. No on-chain program changes are required.

---

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | Next.js 14, React 18, Tailwind CSS | SSR pages, challenge card OG routes |
| Wallet | @solana/wallet-adapter | Phantom, Backpack, Solflare connection |
| API Server | Express 4, TypeScript | REST endpoints, WebSocket, SSE streams |
| Database | PostgreSQL 16, Kysely | Type-safe query builder, 9-table schema |
| Queue | Redis 7, BullMQ | Trade indexer worker, job scheduling |
| Validation | Zod | Request/response schema validation |
| Card Gen | Satori + resvg-js | Server-side OG image rendering to PNG |
| Notifications | discord.js | Challenge and result delivery to Discord |
| Auth | tweetnacl + bs58 | Solana wallet signature verification |

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

# Run database migrations
pnpm db:migrate

# Start dev servers (API on :3000, UI on :3001)
pnpm dev

# Verify
curl http://localhost:3000/api/health
```

**Create a test duel** (requires wallet auth -- use the UI at `http://localhost:3001`):

```bash
# Or via API with a signed auth header:
curl -X POST http://localhost:3000/api/arena/duels \
  -H "Content-Type: application/json" \
  -H "X-Wallet: <your-pubkey>" \
  -H "X-Signature: <signed-nonce>" \
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
Challenge any Adrena trader by wallet address. Both trade on live markets for 24 or 48 hours. Winner is determined by ROI comparison with automatic settlement.

### Shareable Challenge Cards
Every duel generates a PNG challenge card via Satori, served with OpenGraph meta tags. Share the URL on Twitter or Discord and the card unfurls with both traders, asset, stakes, and a direct spectator link.

### Real-Time Updates
- **SSE streams** for leaderboard updates (`GET /api/arena/duels/:id/stream`)
- **WebSocket** for live duel state changes (`ws://localhost:3000/ws/duels`)

### Spectator Predictions
Any user can predict the winner of an active duel. Correct predictions earn Mutagen rewards. Prediction window locks at 90% of duel duration to prevent last-second sniping.

### Discord Bot Integration
Challenge notifications and duel results are delivered to configured Discord channels via discord.js.

### Honor Duels + Staked Duels
- **Honor duels**: Zero barrier to entry. Mutagen-only rewards. The onboarding path for new competitors.
- **Staked duels**: Both sides escrow matching ADX or USDC. Winner takes 98% of the pool. 2% protocol fee.

### Anti-Manipulation
- Minimum 60-second hold time (prevents wash trading)
- Minimum $50 position size for scoring eligibility
- Full competition window enforcement (entry and exit must fall within bounds)
- `SELECT ... FOR UPDATE` row locking prevents double-accept race conditions
- Advisory locks prevent concurrent duel settlement

---

## Project Structure

```
AdrenaX_Arena/
├── package.json                 # Workspace root (pnpm)
├── pnpm-workspace.yaml
├── docker-compose.yml           # PostgreSQL 16 + Redis 7
├── .env.example
├── docs/
│   └── design.md                # Full design specification (1000+ lines)
│
├── packages/
│   ├── arena-server/
│   │   └── src/
│   │       ├── index.ts         # Express app, WebSocket server, background jobs
│   │       ├── config.ts        # Environment config
│   │       ├── adrena/
│   │       │   └── client.ts    # Adrena API client (datapi.adrena.trade)
│   │       ├── db/
│   │       │   ├── connection.ts
│   │       │   ├── migrate.ts   # 9-table schema migration
│   │       │   └── types.ts     # Kysely-generated types
│   │       ├── engine/
│   │       │   ├── duel.ts      # Duel lifecycle (create/accept/settle/expire)
│   │       │   ├── gauntlet.ts  # Gauntlet lifecycle (register/activate/settle)
│   │       │   ├── scoring.ts   # ROI, Arena Score, Mutagen multiplier
│   │       │   └── indexer.ts   # BullMQ trade indexer worker
│   │       ├── routes/
│   │       │   ├── duels.ts     # Duel CRUD, SSE stream, predictions
│   │       │   ├── competitions.ts  # Gauntlet CRUD, SSE leaderboard
│   │       │   └── users.ts    # Profile, stats, auth nonce
│   │       ├── cards/
│   │       │   └── challenge-card.ts  # Satori OG image generation
│   │       └── middleware/
│   │           ├── auth.ts      # Wallet signature verification
│   │           └── rate-limit.ts
│   │
│   └── arena-ui/
│       └── src/
│           ├── app/
│           │   ├── page.tsx             # Landing page
│           │   └── arena/
│           │       ├── page.tsx         # Arena dashboard
│           │       ├── duels/page.tsx   # Duel list
│           │       ├── duels/[id]/page.tsx    # Live duel view
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

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/health` | No | Health check |
| `GET` | `/api/arena/users/nonce/:wallet` | No | Get auth nonce |
| `GET` | `/api/arena/users/:wallet/profile` | No | Trader profile and stats |
| `POST` | `/api/arena/duels` | Yes | Create duel challenge |
| `POST` | `/api/arena/duels/:id/accept` | Yes | Accept challenge |
| `GET` | `/api/arena/duels/:id` | No | Duel details |
| `GET` | `/api/arena/duels` | No | List duels (filterable) |
| `GET` | `/api/arena/duels/:id/stream` | No | SSE duel updates |
| `POST` | `/api/arena/duels/:id/predict` | Yes | Submit prediction |
| `GET` | `/api/arena/duels/:id/predictions` | No | Prediction stats |
| `GET` | `/api/arena/challenge/:id/card.png` | No | Challenge card image |
| `GET` | `/api/arena/competitions` | No | List competitions |
| `GET` | `/api/arena/competitions/:id` | No | Competition details |
| `GET` | `/api/arena/competitions/:id/stream` | No | SSE leaderboard |
| `POST` | `/api/arena/competitions/gauntlet` | Yes | Create Gauntlet |
| `POST` | `/api/arena/competitions/:id/register` | Yes | Register for Gauntlet |
| `WS` | `/ws/duels` | No | Live duel WebSocket |

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/design.md](docs/design.md) | Full design specification: all 4 modes, scoring formulas, Mutagen integration, abuse prevention, prize pool economics, regulatory framing |

---

## Verification Checklist

The following steps verify core functionality end-to-end:

| # | Step | Validates |
|---|------|-----------|
| 1 | `docker compose up -d` -- both containers healthy | Infrastructure |
| 2 | `pnpm db:migrate` -- all 9 tables created | Schema |
| 3 | `curl /api/health` returns `{"status":"ok"}` | Server + DB connection |
| 4 | `GET /api/arena/users/nonce/:wallet` returns nonce | Auth flow |
| 5 | `POST /api/arena/duels` with signed request creates duel | Duel creation |
| 6 | `POST /api/arena/duels/:id/accept` transitions to active | Duel acceptance + row locking |
| 7 | `GET /api/arena/duels/:id/stream` returns SSE events | Real-time updates |
| 8 | `GET /api/arena/challenge/:id/card.png` returns PNG | Challenge card generation |
| 9 | `POST /api/arena/duels/:id/predict` records prediction | Spectator system |
| 10 | `POST /api/arena/competitions/gauntlet` + register | Gauntlet lifecycle |
| 11 | Stale duel expires after 1 hour (background job) | Automatic cleanup |

---

## License

MIT
