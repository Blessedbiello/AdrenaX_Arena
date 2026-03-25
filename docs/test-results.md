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

## Unit Test Results (93/93 passing)

```
 ✓ src/engine/__tests__/streaks.test.ts (26 tests) 9ms
 ✓ src/engine/__tests__/duel-features.test.ts (27 tests) 18ms
 ✓ src/engine/__tests__/scoring.test.ts (40 tests) 24ms

 Test Files  3 passed (3)
      Tests  93 passed (93)
```

Test coverage:
- **scoring.test.ts** (40 tests): tradeROI, totalROI, arenaScore, duelROI, mutagenMultiplier, duelWinner, eligibleTrades
- **streaks.test.ts** (26 tests): title thresholds, multiplier formula, streak progression simulation
- **duel-features.test.ts** (27 tests): open challenge rules, revenge windows, type filters, reward calculations, API error handling, config safety

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

### Infrastructure
- Bundled Inter fonts for Docker reliability
- Production safety: refuse to start with dev auth bypass
- Production warnings for localhost URLs
- Adrena API schema validated against real data with passthrough
- Rate limiter on revenge endpoint (3 per 5 min per wallet)
- 93 unit tests across 3 test files

## Recommendations
- Run with real Adrena wallets on mainnet for production validation
- Set up monitoring for the indexer worker health
- Add Sentry or similar for production error tracking
