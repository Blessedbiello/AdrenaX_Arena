# AdrenaX Arena — Test Competition Results

## Test Environment
- Date: 2026-03-25
- Node.js: v22.x
- PostgreSQL: 16 (Docker)
- Redis: 7 (Docker)
- OS: Linux

## API Schema Validation (29/29 checks)

Validated against live Adrena API (`datapi.adrena.trade`):

- Position endpoint returns `{success: true, data: [...]}`
- All 34 fields in real API response parsed by `AdrenaPositionSchema`
- Empty wallet returns `{error: "Not found"}` (handled gracefully)
- Pool stats endpoint returns all expected fields
- `PoolStatsSchema` parses real response including `pool_name`, `daily_fee_usd`, `total_fee_usd`

Known wallet used: `GZXqnVpZuyKWdUH34mgijxJVM1LEngoGWoJzEXtXGhBb` (from Adrena Postman docs)

## E2E Test Script Checks

The `run-test-competition.ts` script validates 50+ checks across 17 test categories:

1. Health check (server responds 200)
2. Duel creation (returns ID, status pending, challenge URL, card URL)
3. Self-duel prevention (returns CANNOT_SELF_DUEL)
4. Duel acceptance (transitions to active, sets start/end time)
5. Duel details (2 participants, competition times)
6. Duel listing with status filters
7. User profiles with duel stats
8. Gauntlet creation
9. Gauntlet registration (3 participants)
10. Competitions listing
11. SSE stream (text/event-stream content type)
12. Challenge card endpoint (returns image/png)
13. Predictions (submit + stats retrieval)
14. Open challenges (no defender, type=open filter)
15. Streak stats endpoint
16. Profile includes streak data
17. Revenge windows endpoint

## Verified Functionality

- [x] Health check responds 200
- [x] Duel creation returns duel ID, challenge URL, card URL
- [x] Self-duel prevention returns CANNOT_SELF_DUEL
- [x] Duel acceptance transitions status to active
- [x] Duel details include 2 participants and competition times
- [x] Duel listing with status filters works
- [x] User profile returns duel stats + streak data
- [x] Gauntlet creation and registration works
- [x] SSE stream responds with event-stream content type
- [x] Challenge card endpoint returns image/png (bundled Inter font)
- [x] Predictions can be submitted and stats retrieved
- [x] Open challenges can be created (no defender)
- [x] Open challenges appear in type=open filter
- [x] Streak stats endpoint returns current/best/title
- [x] Revenge windows endpoint responds
- [x] Production config refuses to start with DEV_MODE_SKIP_AUTH=true
- [x] Adrena API schema validated against live data (29/29 fields)

## Unit Test Results (132/132 passing)

```
 ✓ src/engine/__tests__/utils.test.ts        (4 tests)
 ✓ src/engine/__tests__/anti-sybil.test.ts   (7 tests)
 ✓ src/engine/__tests__/gauntlet.test.ts     (8 tests)
 ✓ src/engine/__tests__/duel-features.test.ts (27 tests)
 ✓ src/engine/__tests__/streaks.test.ts      (26 tests)
 ✓ src/engine/__tests__/scoring.test.ts      (53 tests)
 ✓ src/engine/__tests__/clan.test.ts         (7 tests)

 Test Files  7 passed (7)
      Tests  132 passed (132)
```

Test coverage:
- **scoring.test.ts** (53 tests): tradeROI, totalROI, 4-component arenaScore, riskAdjustedReturn, consistency, duelROI, mutagenMultiplier, determineDuelWinner with volume tiebreak, eligibleTrades
- **streaks.test.ts** (26 tests): title thresholds, multiplier formula, streak progression simulation
- **duel-features.test.ts** (27 tests): open challenge rules, revenge windows, type filters, reward calculations, API error handling, config safety
- **gauntlet.test.ts** (8 tests): elimination math (8->4->2->1), odd numbers, forfeits, progressive 3-round chain
- **clan.test.ts** (7 tests): synergy bonus calculation, averaging, edge cases
- **utils.test.ts** (4 tests): hashToInt namespace isolation, determinism, positivity, empty string
- **anti-sybil.test.ts** (7 tests): collusion score heuristics, frequency flags, even win distribution
- **anti-sybil.test.ts** (7 tests): collusion score heuristics, frequency flags, even win distribution

## Anchor Escrow Program (Devnet)

```
Program ID: BQQnoKSbNBVjFuiGB33QWymz6PhczDmRFmeLMJ3MGvwQ
Cluster:    Solana Devnet
IDL:        9aYKXk2ppRD4PJfxtA9MLtdLuMV41TwuffqQ1EZJaoKy
```

9 instructions: initialize_config, update_config, create_competition_escrow,
fund_competition_side, cancel_competition_escrow, settle_competition_winner,
refund_competition_draw, pause_program, resume_program. Generalized for both
duels and clan wars via CompetitionKind enum. All 27 security audit findings
addressed and redeployed (vault ownership, winner/treasury constraints,
escrow_id length, account closing, checked_add, paused checks, owner
constraints on cancel/refund, settlement recovery states).

## New Features (Sprint 3-4)

### Open Challenge Board
- Duels can be created without a defender (broadcast challenges)
- Open challenges get 24h expiry (vs 1h for direct)
- Arena hub shows "Open Challenges" section
- DuelCard shows "OPEN" badge for open challenges
- Filter duels by type: `?type=open|direct|all`

### Duel Streaks & Titles
- `arena_user_stats` table tracks win/loss streaks
- Titles awarded at 3 (Hot Streak), 5 (Arena Champion), 10 (Legendary Duelist) wins
- Mutagen multiplier: 1.0 + (0.05 * streak), max 2.0x
- Winner's streak badge shown on completed duel page
- Streak data included in user profile response

### Revenge Mechanic
- 30-minute revenge window created after duel settlement
- Loser can click "REVENGE!" to rematch with same asset/duration
- Revenge duels award 1.5x Mutagen (stacks with streak multiplier)
- `POST /api/arena/duels/revenge` creates revenge duel
- `GET /api/arena/duels/revenge/:wallet` checks active windows

### Discord Notifications
- Bot posts embeds on duel creation, acceptance, and settlement
- Challenge card images embedded in Discord messages
- Action buttons link to arena UI (View Challenge, Spectate, Watch Live)
- Gauntlet open/results notifications
- Graceful fallback when no bot token configured

### Multi-Round Gauntlet
- Configurable 1-5 rounds with custom durations and intermissions
- Bottom-50% elimination per round, forfeit for 0 trades
- Per-round snapshots and arena_score ranking
- Round transitions with intermission scheduling

### Clan Wars
- Create/join/leave clans (max 5 members, one clan per wallet)
- Clan rankings by war score
- Synergy bonus: +5% per member beyond 1 (max +20%)
- Full UI pages for clan management

### Seasonal Championship
- Season points from duels (10 pts/win), gauntlets (15-50 pts)
- Season leaderboard endpoint
- Admin season lifecycle management

### On-Chain Escrow (Devnet)
- Anchor program with 8 instructions for trustless staked duels
- PDA-backed escrow vaults with SPL token transfers
- Allowlisted mints (ADX, USDC), configurable treasury fee (max 5%)
- Accounts closed on terminal states to reclaim rent
- Full security audit: vault ownership, winner/treasury constraints, checked arithmetic

### Admin & Integration
- Admin API with API key auth: season CRUD, ban/unban, escrow pause/resume
- 4 Adrena adapters registered: Mutagen, Quest, Streak, Leaderboard
- Persistent webhooks with exponential backoff retry and dead-letter
- Settlement snapshots for immutable audit trail
- Pino structured logging

### Infrastructure
- Bundled Inter fonts for Docker reliability
- Production safety: refuse to start with dev auth bypass
- Production warnings for localhost URLs
- Adrena API schema validated against real data with passthrough
- SSE rate limiting on duel and competition streams
- Revenge rate limiter (3 per 5 min per wallet)
- Anti-sybil: trade history check, collusion detection (risk score 0-100)
- 132 unit tests across 7 test files
- 4-component Arena Score: ROI, Win Rate, Risk-Adjusted, Consistency

## Recommendations
- Initialize ArenaConfig on devnet with treasury and allowed mints
- Run staked duel E2E test on devnet with real SPL tokens
- Set up monitoring for the indexer worker health
- Add Sentry or similar for production error tracking
- Connect Adrena adapter URLs when available
