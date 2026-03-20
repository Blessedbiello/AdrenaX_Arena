# AdrenaX Arena — Integration Guide

How Arena connects to Adrena's existing infrastructure.

## Architecture Overview

Arena operates as a modular competition layer on top of Adrena's perpetual trading platform. It reads trade data from Adrena's public API (`datapi.adrena.trade`) and emits competition lifecycle events that Adrena's systems can subscribe to.

```
┌─────────────────────────────────────────────────────┐
│                  Adrena Frontend                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ Leaderboard │  │   Quests    │  │   Profile    │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
│         │                │                │         │
│  ┌──────┴────────────────┴────────────────┴──────┐  │
│  │           Adrena Backend (adapters)           │  │
│  └───────────────────┬───────────────────────────┘  │
│                      │                              │
│  ┌───────────────────┴───────────────────────────┐  │
│  │         Arena Event Bus (webhooks)            │  │
│  └───────────────────┬───────────────────────────┘  │
│                      │                              │
│  ┌───────────────────┴───────────────────────────┐  │
│  │           AdrenaX Arena Server                │  │
│  │  ┌──────┐  ┌─────────┐  ┌────────────────┐   │  │
│  │  │Duels │  │Gauntlets│  │Position Indexer│   │  │
│  │  └──────┘  └─────────┘  └────────┬───────┘   │  │
│  └───────────────────────────────────┼───────────┘  │
│                                      │              │
│  ┌───────────────────────────────────┴───────────┐  │
│  │         datapi.adrena.trade (read-only)       │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Integration Points

### 1. Event System (Recommended)

Arena emits typed events for all competition lifecycle actions. Adrena subscribes via **webhooks** or **in-process adapters**.

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

```typescript
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

#### In-Process Adapters

For tighter integration, Adrena implements adapter interfaces and registers them at boot:

```typescript
import { setAdapter } from 'arena-server/adrena/integration';

setAdapter('mutagen', {
  async awardMutagen(userPubkey, amount, reason, metadata) {
    // Call Adrena's Mutagen service
    await mutagenService.award({ wallet: userPubkey, points: amount, source: 'arena', reason });
  },
  async getMutagenBalance(userPubkey) {
    return mutagenService.getBalance(userPubkey);
  },
  async applyMultiplier(userPubkey, multiplier, expiresAt) {
    await mutagenService.setMultiplier(userPubkey, multiplier, expiresAt);
  },
});
```

### 2. Mutagen Integration

Arena awards Mutagen for:

| Action | Mutagen Amount | Notes |
|---|---|---|
| Win an honor duel | 50 | Base amount, multiplied by streak |
| Win a staked duel | 50 + stake bonus | Proportional to stake size |
| Gauntlet 1st place | 100 | |
| Gauntlet 2nd place | 60 | |
| Gauntlet 3rd place | 30 | |
| Correct prediction | 10 | Per correct duel prediction |

The `MutagenAdapter` interface allows Adrena to:
- Process Mutagen awards through their existing system
- Apply multipliers from Arena streaks
- Query balances for display in Arena UI

### 3. Leaderboard Sync

Arena maintains its own competition-scoped leaderboards. To sync with Adrena's global leaderboard:

The `LeaderboardAdapter` pushes:
- Per-user Arena stats (wins, losses, ROI, PnL, streak)
- Completed competition results with ranked participants
- Arena Score (weighted combination of ROI + win rate)

### 4. Quest System Integration

Arena actions that can trigger quest progress:

| Quest Trigger | Action |
|---|---|
| `duel_created` | "Challenge a trader" quest |
| `duel_won` | "Win X duels" quest |
| `gauntlet_completed` | "Survive a gauntlet" quest |
| `prediction_correct` | "Predict X winners" quest |
| `streak_3` | "Win 3 duels in a row" quest |

The `QuestAdapter` receives action notifications that Adrena's quest engine evaluates against active quest conditions.

### 5. Streak System

Arena tracks duel win/loss streaks and maps them to Adrena's existing streak mechanic:

- 3 consecutive wins → "Hot Streak" badge + 1.2x Mutagen
- 5 wins → "Arena Champion" title
- 10 wins → "Legendary Duelist"

The `StreakAdapter` records each duel result and returns current/best streak data.

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
| `POST /mutagen/award` | Award Mutagen points | Replace sentinel signatures with real API calls |
| `GET /mutagen/balance/:wallet` | Show Mutagen in Arena UI | Display user's total Mutagen |
| `POST /leaderboard/sync` | Push Arena results | Unified leaderboard across Adrena |
| `POST /quests/track` | Trigger quest progress | Arena activities count toward quests |
| `GET /user/:wallet/streaks` | Get streak data | Display in Arena profile |
| `POST /webhooks/register` | Subscribe to Adrena events | Know when a user completes a trade on Adrena (for real-time updates) |

## Migration Path: Standalone → Fully Integrated

### Phase 1: Standalone (Current)
- Arena runs as independent service
- Reads trade data from public API
- Awards simulated Mutagen (sentinel signatures in DB)
- No on-chain escrow (honor duels only)

### Phase 2: Event Integration
- Adrena registers webhooks for Arena events
- Arena events trigger quest progress on Adrena's side
- Mutagen awards go through Adrena's real API
- Leaderboard syncs to Adrena's global rankings

### Phase 3: Embedded
- Arena components embedded in Adrena frontend via SDK
- "Challenge this trader" button on Adrena user profiles
- Live duel feed in Adrena's main navigation
- Shared authentication (Adrena's existing wallet auth)

### Phase 4: On-Chain
- Anchor escrow program for staked duels
- Verifiable competition results via Merkle root on-chain
- On-chain settlement for token rewards
- DAO-governed competition parameters

## Deployment for Adrena Team

Arena can be deployed as:

1. **Sidecar service**: Separate container alongside Adrena's backend, connected via webhooks/HTTP
2. **NPM package**: `@adrenax/arena-server` imported directly into Adrena's backend
3. **Embedded module**: Arena engine functions called directly from Adrena's route handlers

Recommended for initial integration: **Option 1 (Sidecar)** — minimal coupling, independent scaling, can be replaced or upgraded without affecting Adrena's core.

## Environment Variables

```bash
# Arena Server
DATABASE_URL=postgresql://...          # Shared or separate DB
REDIS_URL=redis://...                  # Shared or separate Redis
ADRENA_API_BASE=https://datapi.adrena.trade
CORS_ORIGIN=https://app.adrena.xyz    # Adrena's frontend URL

# Integration
ADRENA_MUTAGEN_API=https://api.adrena.xyz/mutagen
ADRENA_WEBHOOK_SECRET=whsec_...
```
