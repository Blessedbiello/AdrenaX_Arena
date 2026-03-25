# AdrenaX Arena API Reference

Base URL: `http://localhost:3000` (development) or your deployed host.

All responses follow a consistent envelope format:

```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": "ERROR_CODE", "message": "Human-readable message" }
```

**Rate Limiting:** 100 requests per minute per IP (general), 30 per minute per wallet (authenticated). SSE streams are limited to 10 connections per minute. Revenge duels are limited to 3 per 5 minutes per wallet. Rate limit headers follow the `RateLimit-*` standard.

---

## Table of Contents

- [Authentication](#authentication)
- [Duels](#duels)
- [Duel Escrow Intents](#duel-escrow-intents)
- [Competitions](#competitions)
- [Users](#users)
- [Clans](#clans)
- [Clan War Escrow Intents](#clan-war-escrow-intents)
- [Seasons](#seasons)
- [Webhooks](#webhooks)
- [Admin](#admin)
- [Challenge Cards](#challenge-cards)
- [WebSocket](#websocket)
- [Health](#health)
- [Error Codes](#error-codes)
- [Data Types Reference](#data-types-reference)

---

## Authentication

AdrenaX Arena uses Solana wallet signature authentication. The flow is:

1. Request a nonce for your wallet address.
2. Sign the message `AdrenaX Arena Authentication\nNonce: <nonce>` with your wallet.
3. Include the wallet, signature, and nonce in request headers.

Nonces expire after 5 minutes and are single-use.

### Required Headers (Authenticated Endpoints)

| Header | Type | Description |
|--------|------|-------------|
| `x-wallet` | `string` | Base58-encoded Solana public key |
| `x-signature` | `string` | Base58-encoded Ed25519 signature of the auth message |
| `x-nonce` | `string` | The nonce obtained from the nonce endpoint |

### GET /api/arena/users/nonce/:wallet

Get an authentication nonce for a wallet address.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `wallet` | `string` | Solana wallet address (32-44 characters, base58) |

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "nonce": "a1b2c3d4e5f6...64-char-hex-string",
    "message": "AdrenaX Arena Authentication\nNonce: a1b2c3d4e5f6...64-char-hex-string"
  }
}
```

The `message` field contains the exact string that must be signed by the wallet.

**Error Response: 400 Bad Request**

```json
{
  "success": false,
  "error": "INVALID_WALLET"
}
```

---

## Duels

### POST /api/arena/duels

Create a new duel challenge. Requires authentication. Omit `defenderPubkey` to create an open challenge.

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `defenderPubkey` | `string` | No | -- | Solana wallet of the challenged player (32-44 chars). Omit for open challenges. |
| `assetSymbol` | `string` | Yes | -- | Trading asset. One of: `SOL`, `BTC`, `ETH`, `BONK`, `JTO`, `JITOSOL` |
| `durationHours` | `number` | Yes | -- | Duel duration. Must be `24` or `48` |
| `stakeAmount` | `number` | No | `0` | Token amount each player stakes (minimum 0) |
| `stakeToken` | `string` | No | `"ADX"` | Stake token type. One of: `ADX`, `USDC` |
| `isHonorDuel` | `boolean` | No | `false` | If true, no stakes are required (reputation only) |

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/arena/duels \
  -H 'Content-Type: application/json' \
  -H 'x-wallet: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' \
  -H 'x-signature: 3bNfR2Y8vPm...' \
  -H 'x-nonce: a1b2c3d4e5f6...' \
  -d '{
    "defenderPubkey": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "assetSymbol": "SOL",
    "durationHours": 24,
    "stakeAmount": 100,
    "stakeToken": "ADX",
    "isHonorDuel": false
  }'
```

**Response: 201 Created**

```json
{
  "success": true,
  "data": {
    "duel": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "competition_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "challenger_pubkey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "defender_pubkey": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      "asset_symbol": "SOL",
      "stake_amount": 100,
      "stake_token": "ADX",
      "is_honor_duel": false,
      "duration_hours": 24,
      "status": "pending",
      "escrow_state": "awaiting_challenger_deposit",
      "winner_pubkey": null,
      "challenger_roi": null,
      "defender_roi": null,
      "escrow_tx": null,
      "settlement_tx": null,
      "challenger_deposit_tx": null,
      "defender_deposit_tx": null,
      "challenge_card_url": null,
      "accepted_at": null,
      "expires_at": "2026-03-20T13:00:00.000Z",
      "created_at": "2026-03-20T12:00:00.000Z"
    },
    "competition": {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "mode": "duel",
      "status": "pending",
      "season_id": null,
      "start_time": "2026-03-20T12:00:00.000Z",
      "end_time": "2026-03-21T12:00:00.000Z",
      "current_round": 1,
      "total_rounds": 1,
      "config": { "asset": "SOL", "durationHours": 24 },
      "created_at": "2026-03-20T12:00:00.000Z",
      "updated_at": "2026-03-20T12:00:00.000Z"
    },
    "challengeUrl": "/arena/challenge/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "cardUrl": "/api/arena/challenge/a1b2c3d4-e5f6-7890-abcd-ef1234567890/card.png",
    "escrowAction": null
  }
}
```

For staked duels, `escrowAction` contains the unsigned transaction data for the challenger to sign and submit via the escrow intent flow.

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `CANNOT_SELF_DUEL` | Cannot challenge yourself |
| 400 | `VALIDATION_ERROR` | Invalid request body (includes `details` array from Zod) |
| 401 | -- | Missing or invalid authentication headers |
| 500 | `INTERNAL_ERROR` | Server error |

---

### POST /api/arena/duels/:id/accept

Accept a pending duel challenge. Requires authentication. The authenticated wallet becomes the defender (for open challenges) or must match the specified defender.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` (UUID) | Duel ID |

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "duel": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "status": "active",
      "escrow_state": "not_required",
      "accepted_at": "2026-03-20T12:30:00.000Z",
      "...": "..."
    },
    "startTime": "2026-03-20T12:30:00.000Z",
    "endTime": "2026-03-21T12:30:00.000Z"
  }
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `CANNOT_SELF_DUEL` | Cannot accept your own challenge |
| 400 | `WRONG_DEFENDER` | Duel was challenged to a different wallet |
| 400 | `DUEL_EXPIRED` | Challenge acceptance window has passed |
| 404 | `DUEL_NOT_AVAILABLE` | Duel not found or no longer pending |
| 401 | -- | Missing or invalid authentication headers |
| 500 | `INTERNAL_ERROR` | Server error |

---

### GET /api/arena/duels

List duels with optional filters. Public endpoint (no authentication required).

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | `string` | No | -- | Filter by status: `pending`, `accepted`, `active`, `settling`, `completed`, `expired`, `cancelled` |
| `wallet` | `string` | No | -- | Filter by participant wallet (matches challenger or defender) |
| `asset` | `string` | No | -- | Filter by asset symbol (e.g., `SOL`, `BTC`) |
| `type` | `string` | No | `all` | Filter by challenge type: `open` (no defender, pending), `direct` (has defender), `all` |
| `limit` | `number` | No | `20` | Results per page (1-100) |
| `offset` | `number` | No | `0` | Pagination offset |

**Example Request:**

```bash
curl 'http://localhost:3000/api/arena/duels?status=active&asset=SOL&limit=10'
curl 'http://localhost:3000/api/arena/duels?type=open'
```

**Response: 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "challenger_pubkey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "defender_pubkey": null,
      "asset_symbol": "SOL",
      "status": "pending",
      "escrow_state": "not_required",
      "is_honor_duel": true,
      "...": "..."
    }
  ]
}
```

---

### GET /api/arena/duels/:id

Get full details for a specific duel, including participant stats and predictions.

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "duel": { "...full duel object including escrow_state..." },
    "participants": [ "...participant objects with ROI, PnL, Arena Score..." ],
    "predictions": [ "...prediction objects..." ]
  }
}
```

---

### GET /api/arena/duels/:id/stream

Server-Sent Events (SSE) stream for live duel updates. Polls every 5 seconds. Automatically closes when the duel reaches a terminal status.

**Event Types:**

| Event | Description |
|-------|-------------|
| `snapshot` | Initial state sent immediately on connection |
| `update` | Periodic update with current duel details (every 5s) |
| `complete` | Final event when the duel reaches a terminal status |

---

### POST /api/arena/duels/:id/predict

Submit or update a prediction for who will win a duel. Requires authentication. Predictions lock in the last 10% of the duel duration. Participants in the duel cannot predict on their own match.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `predictedWinner` | `string` | Yes | Wallet address of the predicted winner (must be one of the two duel participants) |

**Response: 200 OK** -- Returns the prediction object with `is_correct: null` (resolved after settlement).

---

### GET /api/arena/duels/:id/predictions

Get aggregated prediction statistics for a duel.

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "total": 15,
    "challenger": { "pubkey": "7xKXtg2...", "votes": 9 },
    "defender": { "pubkey": "9WzDXwB...", "votes": 6 }
  }
}
```

---

### POST /api/arena/duels/revenge

Create a revenge duel after losing. Requires authentication. Rate-limited to 3 per 5 minutes per wallet. Uses the same asset and duration as the original duel. Awards 1.5x Mutagen multiplier.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `opponentPubkey` | `string` | Yes | Wallet address of the opponent to rematch |

**Response: 201 Created** -- Returns the new duel object with revenge config.

---

### GET /api/arena/duels/revenge/:wallet

Check active revenge windows for a wallet. Windows last 30 minutes from settlement.

**Response: 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "opponentPubkey": "TestAlice111...",
      "originalDuelId": "abc-123",
      "assetSymbol": "SOL",
      "ttlSeconds": 1742
    }
  ]
}
```

---

## Duel Escrow Intents

These endpoints support the on-chain escrow flow for staked duels. The flow is:

1. Challenger creates duel (duel status: `pending`, escrow_state: `awaiting_challenger_deposit`)
2. Challenger calls challenger-intent to get an unsigned transaction
3. Challenger signs and submits the transaction, then calls challenger-confirm
4. Escrow state transitions to `awaiting_defender_deposit`
5. Defender calls defender-intent to get an unsigned transaction
6. Defender signs and submits, then accepts the duel

### POST /api/arena/duels/:id/escrow/challenger-intent

Build an unsigned escrow creation transaction for the challenger. Requires authentication. Only callable by the challenger when `escrow_state` is `awaiting_challenger_deposit`.

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "transaction": "base64-encoded-unsigned-transaction",
    "escrowId": "a1b2c3d4e5f67890abcdef1234567890",
    "mint": "ADX_MINT_ADDRESS",
    "amount": 100000000
  }
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `ESCROW_NOT_REQUIRED` | Duel is an honor duel or has zero stake |
| 400 | `ESCROW_STATE_INVALID` | Escrow is not in the expected state |
| 403 | `FORBIDDEN` | Caller is not the challenger |
| 404 | `DUEL_NOT_FOUND` | No duel with this ID |

---

### POST /api/arena/duels/:id/escrow/challenger-confirm

Confirm the challenger's escrow deposit after the on-chain transaction is submitted.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `txSignature` | `string` | Yes | Solana transaction signature (32-128 chars) |

**Response: 200 OK** -- Returns the updated duel with `escrow_state: 'awaiting_defender_deposit'`.

---

### POST /api/arena/duels/:id/escrow/defender-intent

Build an unsigned escrow funding transaction for the defender. Requires authentication. Only callable by the defender when `escrow_state` is `awaiting_defender_deposit`.

**Response: 200 OK** -- Returns the unsigned transaction data for the defender to sign.

---

## Competitions

### GET /api/arena/competitions

List competitions with optional filters.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `mode` | `string` | No | -- | Filter by mode: `gauntlet`, `duel`, `clan_war`, `season` |
| `status` | `string` | No | -- | Filter by status: `pending`, `registration`, `active`, `round_transition`, `settling`, `completed`, `rewards_distributed`, `cancelled` |
| `limit` | `number` | No | `20` | Results per page (1-100) |
| `offset` | `number` | No | `0` | Pagination offset |

---

### GET /api/arena/competitions/:id

Get competition details including all participants ranked by ROI.

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "competition": { "...competition object..." },
    "participants": [ "...ranked participant objects..." ]
  }
}
```

---

### POST /api/arena/competitions/gauntlet

Create a new Gauntlet competition. Requires authentication. A 2-hour registration period begins immediately.

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | -- | Gauntlet name (3-64 characters) |
| `maxParticipants` | `number` | No | `16` | Maximum participants (2-128) |
| `durationHours` | `number` | No | `24` | Competition duration in hours (1-168) |

**Response: 201 Created** -- Returns the competition object with `status: 'registration'`.

---

### POST /api/arena/competitions/:id/register

Register for a Gauntlet competition. Requires authentication. Registration must be open and the Gauntlet must not be full.

**Response: 201 Created** -- Returns the participant object.

---

### GET /api/arena/competitions/:id/stream

Server-Sent Events (SSE) stream for live leaderboard updates. Polls every 10 seconds.

**Event Types:**

| Event | Description |
|-------|-------------|
| `snapshot` | Initial leaderboard state on connection |
| `update` | Periodic leaderboard update (every 10s) |
| `error` | Error loading leaderboard |

---

### GET /api/arena/competitions/:id/rounds

Get round snapshots for a multi-round competition.

**Response: 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "competition_id": "...",
      "round_number": 1,
      "snapshot_time": "2026-03-20T18:00:00.000Z",
      "participant_scores": [ "...per-participant scores..." ],
      "eliminated_pubkeys": [ "wallet1", "wallet2" ]
    }
  ]
}
```

---

### GET /api/arena/competitions/:id/settlement

Get settlement snapshots for a competition. Provides an immutable audit trail of raw positions, computed scores, and settlement results.

**Response: 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "competition_id": "...",
      "snapshot_type": "final",
      "raw_positions": { "...raw position data from Adrena API..." },
      "computed_scores": { "...ROI, PnL, Arena Score per participant..." },
      "settlement_result": { "...winner, loser, draw flag..." },
      "created_at": "2026-03-21T12:30:05.000Z"
    }
  ]
}
```

---

### GET /api/arena/competitions/seasons/:id/leaderboard

Get the season leaderboard for a specific season.

**Response: 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "user_pubkey": "7xKXtg2...",
      "total_points": 150,
      "duel_points": 80,
      "gauntlet_points": 50,
      "clan_points": 20
    }
  ]
}
```

---

## Users

### GET /api/arena/users/:wallet/profile

Get a user's Arena profile with aggregated duel and gauntlet statistics.

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "duels": {
      "total": 12,
      "wins": 8,
      "losses": 4,
      "winRate": 0.6667
    },
    "gauntlets": {
      "entered": 5,
      "won": 2
    },
    "streak": {
      "current_streak": 3,
      "best_streak": 5,
      "streak_type": "win",
      "title": "hot_streak",
      "mutagen_multiplier": 1.15
    },
    "recentDuels": [ "...up to 10 most recent duels..." ]
  }
}
```

Note: If the wallet has no Arena history, the response returns zeroed stats and an empty `recentDuels` array -- it does not return a 404.

---

### GET /api/arena/users/:wallet/streak

Get streak statistics for a specific wallet.

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "current_streak": 3,
    "best_streak": 5,
    "streak_type": "win",
    "total_wins": 15,
    "total_losses": 7,
    "title": "hot_streak",
    "mutagen_multiplier": 1.15
  }
}
```

---

### GET /api/arena/users/leaderboard

Get the global user leaderboard.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `period` | `string` | No | `weekly` | Time period: `weekly`, `monthly` |

**Response: 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "rank": 1,
      "wallet": "7xKXtg2...",
      "wins": 8,
      "losses": 2,
      "winRate": 0.8,
      "totalROI": 45.23
    }
  ]
}
```

---

## Clans

### POST /api/arena/clans

Create a new clan. Requires authentication. The creator becomes the clan leader.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Clan name (3-32 characters, must be unique) |
| `tag` | `string` | Yes | Clan tag (2-5 characters, must be unique) |

**Response: 201 Created**

```json
{
  "success": true,
  "data": {
    "id": "...",
    "name": "Alpha Wolves",
    "tag": "AWLF",
    "leader_pubkey": "7xKXtg2...",
    "member_count": 1,
    "total_war_score": 0,
    "wars_won": 0,
    "wars_played": 0,
    "created_at": "2026-03-25T12:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `ALREADY_IN_CLAN` | Wallet is already a member of a clan |
| 400 | `NAME_TAKEN` | Clan name is already in use |
| 400 | `TAG_TAKEN` | Clan tag is already in use |

---

### POST /api/arena/clans/:id/join

Join an existing clan. Requires authentication. Maximum 5 members per clan. One clan per wallet. Subject to cooldown after leaving a clan.

**Response: 201 Created** -- Returns the clan member object.

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `ALREADY_IN_CLAN` | Wallet is already in a clan |
| 400 | `CLAN_FULL` | Clan has reached the 5-member limit |
| 400 | `COOLDOWN_ACTIVE` | Must wait before joining a new clan |
| 404 | `CLAN_NOT_FOUND` | No clan with this ID |

---

### DELETE /api/arena/clans/membership

Leave your current clan. Requires authentication. Clan leaders cannot leave (must transfer leadership or disband).

**Response: 200 OK**

```json
{
  "success": true,
  "data": { "left": true, "cooldown_until": "2026-03-26T12:00:00.000Z" }
}
```

---

### GET /api/arena/clans/rankings

Get clan rankings sorted by war score.

**Response: 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "name": "Alpha Wolves",
      "tag": "AWLF",
      "member_count": 4,
      "total_war_score": 1250.50,
      "wars_won": 7,
      "wars_played": 10
    }
  ]
}
```

---

### GET /api/arena/clans/:id

Get clan details including all members.

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "clan": { "...clan object..." },
    "members": [
      {
        "user_pubkey": "7xKXtg2...",
        "role": "leader",
        "joined_at": "2026-03-20T12:00:00.000Z"
      }
    ]
  }
}
```

---

### GET /api/arena/clans/:id/wars

Get war history for a clan.

**Response: 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "competition_id": "...",
      "challenger_clan_id": "...",
      "defender_clan_id": "...",
      "duration_hours": 48,
      "is_honor_war": true,
      "status": "completed",
      "winner_clan_id": "...",
      "escrow_state": "not_required"
    }
  ]
}
```

---

### POST /api/arena/clans/:id/challenge

Challenge another clan to a war. Requires authentication. Caller must be the leader of their clan. The challenged clan's ID is in the path parameter.

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `durationHours` | `number` | Yes | -- | War duration: `24`, `48`, or `168` hours |
| `isHonorWar` | `boolean` | No | `true` | If false, stakes are required |
| `stakeAmount` | `number` | No | `0` | Stake per side |
| `stakeToken` | `string` | No | `"ADX"` | `ADX` or `USDC` |

**Response: 201 Created** -- Returns the war object and optional `escrowAction` for staked wars.

---

### POST /api/arena/clans/wars/:warId/accept

Accept a pending clan war challenge. Requires authentication. Caller must be the leader of the defending clan.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `txSignature` | `string` | No | Transaction signature if escrow deposit was required |

**Response: 200 OK** -- Returns the updated war object.

---

## Clan War Escrow Intents

These endpoints mirror the duel escrow intent flow but for clan wars. Only clan leaders can interact with them.

### POST /api/arena/clans/wars/:warId/escrow/challenger-intent

Build an unsigned escrow creation transaction for the challenging clan leader.

**Response: 200 OK** -- Returns unsigned transaction data.

### POST /api/arena/clans/wars/:warId/escrow/challenger-confirm

Confirm the challenger clan's escrow deposit.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `txSignature` | `string` | Yes | Solana transaction signature |

### POST /api/arena/clans/wars/:warId/escrow/defender-intent

Build an unsigned escrow funding transaction for the defending clan leader.

**Response: 200 OK** -- Returns unsigned transaction data.

---

## Seasons

### GET /api/arena/season/current

Get the current active or upcoming season.

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Season 1: Genesis",
    "start_time": "2026-03-01T00:00:00.000Z",
    "end_time": "2026-03-29T00:00:00.000Z",
    "status": "active"
  }
}
```

**Error Response: 404** -- `SEASON_NOT_FOUND` if no active or upcoming season exists.

---

### GET /api/arena/season/standings

Get season point standings.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `seasonId` | `number` | No | Specific season ID. Defaults to current active/upcoming season. |

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "season": { "...season object..." },
    "standings": [
      {
        "season_id": 1,
        "user_pubkey": "7xKXtg2...",
        "total_points": 150,
        "duel_points": 80,
        "gauntlet_points": 50,
        "clan_points": 20
      }
    ]
  }
}
```

---

### GET /api/arena/season/pass/:wallet

Get season pass progress for a wallet, including unlocked milestones and next milestone.

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "season": { "...season object..." },
    "wallet": "7xKXtg2...",
    "totalPoints": 150,
    "unlockedMilestones": [
      { "threshold": 50, "reward": "Bronze Badge" },
      { "threshold": 100, "reward": "Silver Badge" }
    ],
    "nextMilestone": { "threshold": 200, "reward": "Gold Badge" }
  }
}
```

---

## Webhooks

All webhook endpoints require admin authentication (API key via `x-admin-key` header or `ADMIN_API_KEY` environment variable).

### POST /api/arena/webhooks

Register a new webhook subscription.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `string` | Yes | Webhook delivery URL (must be a valid URL) |
| `events` | `string[]` | Yes | Event types to subscribe to (at least 1) |
| `secret` | `string` | Yes | HMAC-SHA256 signing secret (8-128 chars) |
| `active` | `boolean` | No | Whether the webhook is active (default: `true`) |

**Available Events:**

`duel_created`, `duel_accepted`, `duel_settled`, `gauntlet_created`, `gauntlet_activated`, `gauntlet_settled`, `participant_registered`, `reward_distributed`, `prediction_made`

**Response: 201 Created**

```json
{
  "success": true,
  "data": {
    "id": "...",
    "url": "https://api.example.com/arena/events",
    "events": ["duel_settled", "gauntlet_settled"],
    "active": true,
    "created_at": "2026-03-25T12:00:00.000Z"
  }
}
```

Each webhook delivery includes:
- `X-Arena-Signature` header: HMAC-SHA256 of the body using your secret
- `X-Arena-Event` header: Event type string
- JSON body with `type`, `timestamp`, and `payload`

Deliveries use exponential backoff retry and are tracked in the `arena_webhook_deliveries` table.

---

### GET /api/arena/webhooks

List all registered webhooks.

**Response: 200 OK** -- Returns array of webhook subscription objects.

---

### DELETE /api/arena/webhooks/:id

Delete a webhook subscription.

**Response: 200 OK**

```json
{ "success": true, "data": { "id": "...", "removed": true } }
```

---

## Admin

All admin endpoints require API key authentication. Set the `ADMIN_API_KEY` environment variable and pass it via the appropriate header.

### POST /api/admin/seasons

Create a new season.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Season name (3-64 characters) |
| `start_time` | `string` | Yes | ISO 8601 start time |
| `end_time` | `string` | Yes | ISO 8601 end time |

**Response: 201 Created** -- Returns the season object with `status: 'upcoming'`.

---

### PATCH /api/admin/seasons/:id

Update a season's status.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | `string` | Yes | New status: `upcoming`, `active`, or `completed` |

**Response: 200 OK** -- Returns the updated season object.

---

### GET /api/admin/seasons

List all seasons, ordered by start time descending.

---

### POST /api/admin/competitions/:id/cancel

Cancel a competition. Sets status to `cancelled`.

**Response: 200 OK** -- Returns the cancelled competition object.

---

### POST /api/admin/users/:wallet/ban

Ban a user from Arena.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | `string` | Yes | Ban reason |

**Response: 200 OK**

```json
{ "success": true, "data": { "wallet": "...", "banned": true, "reason": "..." } }
```

---

### POST /api/admin/users/:wallet/unban

Remove a ban from a user.

**Response: 200 OK**

```json
{ "success": true, "data": { "wallet": "...", "banned": false } }
```

---

### POST /api/admin/escrow/pause

Pause the on-chain escrow program. Blocks new escrow creation, funding, settlement, and refunds.

**Response: 200 OK** -- Returns the transaction signature.

---

### POST /api/admin/escrow/resume

Resume the on-chain escrow program after a pause.

**Response: 200 OK** -- Returns the transaction signature.

---

### GET /api/admin/webhooks

List all webhook subscriptions (admin view, includes all fields).

---

## Challenge Cards

### GET /api/arena/challenge/:id/card.png

Generate an Open Graph challenge card image for social sharing. Returns a 1200x630 PNG image rendered with Satori and bundled Inter font.

**Response: 200 OK**

```
Content-Type: image/png
Cache-Control: public, max-age=3600
```

**Fallback Response:** If the card renderer fails, returns JSON metadata:

```json
{
  "challenger": "7xKXtg2...",
  "defender": "9WzDXwB...",
  "asset": "SOL",
  "duration": 24,
  "stake": "100 ADX"
}
```

For honor duels, the `stake` field reads `"Honor Duel"`.

---

## WebSocket

### ws://host/ws/duels

Real-time WebSocket connection for live duel updates.

**Client Messages:**

```json
{ "type": "subscribe", "duelId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
```

A client can only be subscribed to one duel at a time. Sending a new `subscribe` message automatically unsubscribes from the previous duel.

**Server Messages:**

```json
{ "type": "subscribed", "duelId": "..." }
{ "type": "duel_update", "duelId": "...", "data": { "duel": {}, "participants": [], "predictions": [] } }
```

---

## Health

### GET /api/health

Health check endpoint. Verifies database connectivity.

**Response: 200 OK**

```json
{ "status": "ok", "timestamp": "2026-03-25T12:00:00.000Z" }
```

**Response: 503 Service Unavailable**

```json
{ "status": "error", "message": "Database unavailable" }
```

---

## Error Codes

All error responses follow the standard envelope format:

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable description"
}
```

Validation errors include an additional `details` array with per-field information from Zod.

### Error Code Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request body or query parameters failed validation |
| `CANNOT_SELF_DUEL` | 400 | Attempted to challenge or accept your own duel |
| `WRONG_DEFENDER` | 400 | Duel was directed at a specific wallet and you are not that wallet |
| `DUEL_EXPIRED` | 400 | Challenge acceptance window (1 hour) has passed |
| `DUEL_NOT_AVAILABLE` | 404 | Duel not found or not in pending status |
| `DUEL_NOT_FOUND` | 404 | No duel exists with the given ID |
| `DUEL_NOT_ACTIVE` | 400 | Duel is not in active status (required for predictions) |
| `CANNOT_PREDICT_OWN_DUEL` | 400 | Duel participants cannot predict on their own match |
| `INVALID_PREDICTION_TARGET` | 400 | Predicted winner must be one of the two duel participants |
| `PREDICTION_WINDOW_CLOSED` | 400 | Predictions lock in the last 10% of duel duration |
| `ESCROW_NOT_REQUIRED` | 400 | Duel is an honor duel or has zero stake |
| `ESCROW_STATE_INVALID` | 400 | Escrow is not in the expected state for this operation |
| `FORBIDDEN` | 403 | Caller does not have permission for this action |
| `NOT_FOUND` | 404 | Competition not found |
| `NOT_REGISTRABLE` | 400 | Gauntlet not found or registration is closed |
| `GAUNTLET_FULL` | 400 | Gauntlet has reached maximum participant count |
| `ALREADY_REGISTERED` | 400 | Wallet is already registered for this Gauntlet |
| `ALREADY_IN_CLAN` | 400 | Wallet is already a member of a clan |
| `CLAN_FULL` | 400 | Clan has reached the 5-member limit |
| `CLAN_NOT_FOUND` | 404 | No clan with this ID |
| `WAR_NOT_FOUND` | 404 | No clan war with this ID |
| `SEASON_NOT_FOUND` | 404 | No active or upcoming season |
| `WEBHOOK_NOT_FOUND` | 404 | No webhook with this ID |
| `INVALID_WALLET` | 400 | Wallet address is malformed (must be 32-44 characters) |
| `RATE_LIMIT` | 429 | Too many requests (100/min general, 30/min authenticated, 10/min SSE, 3/5min revenge) |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Authentication Errors

Authentication failures return 401 without the standard envelope:

```json
{ "error": "Missing authentication headers (x-wallet, x-signature, x-nonce)" }
```

```json
{ "error": "Invalid or expired nonce" }
```

```json
{ "error": "Invalid signature" }
```

---

## Data Types Reference

### Duel Status Lifecycle

```
pending --> accepted --> active --> settling --> completed
   |                                               |
   +--> expired                                    +--> (rewards distributed)
   |
   +--> cancelled
```

- **pending**: Challenge created, waiting for defender to accept (1-hour window for direct, 24-hour for open).
- **accepted**: Defender has accepted (transient, immediately moves to active).
- **active**: Competition window is running. Trades are being indexed.
- **settling**: Duration ended, scores are being finalized.
- **completed**: Winner determined, results are final.
- **expired**: Defender did not accept within the acceptance window.
- **cancelled**: Duel was cancelled before starting.

### Escrow State Lifecycle (Staked Duels)

```
not_required                    (honor duels)
awaiting_challenger_deposit --> awaiting_defender_deposit --> funded --> settlement_pending --> settled
                                                                                          +--> settlement_failed
                           +--> cancelled (expired without full funding)
```

### Competition Status Lifecycle

```
pending --> registration --> active --> round_transition --> settling --> completed --> rewards_distributed
   |            |                                              |
   +--> cancelled (at any point before completion)             +--> cancelled
```

### Supported Assets

| Symbol | Description |
|--------|-------------|
| `SOL` | Solana |
| `BTC` | Bitcoin |
| `ETH` | Ethereum |
| `BONK` | Bonk |
| `JTO` | Jito |
| `JITOSOL` | Jito Staked SOL |

### Stake Tokens

| Token | Description |
|-------|-------------|
| `ADX` | Adrena governance token |
| `USDC` | USD Coin |
