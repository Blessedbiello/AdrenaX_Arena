# AdrenaX Arena API Reference

Base URL: `http://localhost:3000` (development) or your deployed host.

All responses follow a consistent envelope format:

```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": "ERROR_CODE", "message": "Human-readable message" }
```

**Rate Limiting:** 100 requests per minute per IP (general), 30 per minute per wallet (authenticated). SSE streams are limited to 10 connections per minute. Rate limit headers follow the `RateLimit-*` standard.

---

## Table of Contents

- [Authentication](#authentication)
- [Duels](#duels)
- [Competitions](#competitions)
- [Users](#users)
- [Challenge Cards](#challenge-cards)
- [WebSocket](#websocket)
- [Health](#health)
- [Error Codes](#error-codes)

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

Create a new duel challenge. Requires authentication.

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `defenderPubkey` | `string` | Yes | -- | Solana wallet of the challenged player (32-44 chars) |
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
      "winner_pubkey": null,
      "challenger_roi": null,
      "defender_roi": null,
      "escrow_tx": null,
      "settlement_tx": null,
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
    "cardUrl": "/api/arena/challenge/a1b2c3d4-e5f6-7890-abcd-ef1234567890/card.png"
  }
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `CANNOT_SELF_DUEL` | Cannot challenge yourself |
| 400 | `VALIDATION_ERROR` | Invalid request body (includes `details` array from Zod) |
| 401 | -- | Missing or invalid authentication headers |
| 500 | `INTERNAL_ERROR` | Server error |

---

### POST /api/arena/duels/:id/accept

Accept a pending duel challenge. Requires authentication. The authenticated wallet becomes the defender.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` (UUID) | Duel ID |

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/arena/duels/a1b2c3d4-e5f6-7890-abcd-ef1234567890/accept \
  -H 'x-wallet: 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' \
  -H 'x-signature: 4cOgS3Z9wQn...' \
  -H 'x-nonce: d4e5f6a7b8c9...'
```

**Response: 200 OK**

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
      "status": "active",
      "winner_pubkey": null,
      "challenger_roi": null,
      "defender_roi": null,
      "escrow_tx": null,
      "settlement_tx": null,
      "challenge_card_url": null,
      "accepted_at": "2026-03-20T12:30:00.000Z",
      "expires_at": "2026-03-20T13:00:00.000Z",
      "created_at": "2026-03-20T12:00:00.000Z"
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
| `limit` | `number` | No | `20` | Results per page (1-100) |
| `offset` | `number` | No | `0` | Pagination offset |

**Example Request:**

```bash
curl 'http://localhost:3000/api/arena/duels?status=active&asset=SOL&limit=10'
```

**Response: 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "competition_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "challenger_pubkey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "defender_pubkey": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      "asset_symbol": "SOL",
      "stake_amount": 100,
      "stake_token": "ADX",
      "is_honor_duel": false,
      "duration_hours": 24,
      "status": "active",
      "winner_pubkey": null,
      "challenger_roi": null,
      "defender_roi": null,
      "escrow_tx": null,
      "settlement_tx": null,
      "challenge_card_url": null,
      "accepted_at": "2026-03-20T12:30:00.000Z",
      "expires_at": "2026-03-20T13:00:00.000Z",
      "created_at": "2026-03-20T12:00:00.000Z"
    }
  ]
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid query parameters |
| 500 | `INTERNAL_ERROR` | Server error |

---

### GET /api/arena/duels/:id

Get full details for a specific duel, including participant stats and predictions.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` (UUID) | Duel ID |

**Example Request:**

```bash
curl http://localhost:3000/api/arena/duels/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**Response: 200 OK**

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
      "status": "active",
      "winner_pubkey": null,
      "challenger_roi": 12.45,
      "defender_roi": -3.21,
      "escrow_tx": null,
      "settlement_tx": null,
      "challenge_card_url": null,
      "accepted_at": "2026-03-20T12:30:00.000Z",
      "expires_at": "2026-03-20T13:00:00.000Z",
      "created_at": "2026-03-20T12:00:00.000Z"
    },
    "participants": [
      {
        "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
        "competition_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "user_pubkey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "team_id": null,
        "status": "active",
        "eliminated_round": null,
        "pnl_usd": 245.50,
        "roi_percent": 12.45,
        "total_volume_usd": 5000.00,
        "positions_closed": 3,
        "win_rate": 0.6667,
        "arena_score": 847.25,
        "last_indexed_at": "2026-03-20T14:00:00.000Z",
        "cursor_position_id": 4521,
        "created_at": "2026-03-20T12:00:00.000Z",
        "updated_at": "2026-03-20T14:00:00.000Z"
      },
      {
        "id": "d4e5f6a7-b8c9-0123-defa-234567890123",
        "competition_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "user_pubkey": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        "team_id": null,
        "status": "active",
        "eliminated_round": null,
        "pnl_usd": -64.20,
        "roi_percent": -3.21,
        "total_volume_usd": 2000.00,
        "positions_closed": 2,
        "win_rate": 0.5000,
        "arena_score": 312.80,
        "last_indexed_at": "2026-03-20T14:00:00.000Z",
        "cursor_position_id": 4519,
        "created_at": "2026-03-20T12:30:00.000Z",
        "updated_at": "2026-03-20T14:00:00.000Z"
      }
    ],
    "predictions": [
      {
        "id": "e5f6a7b8-c9d0-1234-efab-345678901234",
        "duel_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "predictor_pubkey": "3kPnR7YzDxMq8jEuTdBw5LcFgH9vNsAo2WQi6XJtRmKe",
        "predicted_winner": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "prediction_locked_at": "2026-03-20T13:15:00.000Z",
        "is_correct": null,
        "mutagen_reward": 0
      }
    ]
  }
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 404 | `DUEL_NOT_FOUND` | No duel with this ID |
| 500 | `INTERNAL_ERROR` | Server error |

---

### GET /api/arena/duels/:id/stream

Server-Sent Events (SSE) stream for live duel updates. Polls every 5 seconds. Automatically closes when the duel reaches a terminal status (`completed`, `expired`, or `cancelled`).

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` (UUID) | Duel ID |

**Example Request:**

```bash
curl -N http://localhost:3000/api/arena/duels/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stream
```

**Response Headers:**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

**Event Types:**

| Event | Description |
|-------|-------------|
| `snapshot` | Initial state sent immediately on connection |
| `update` | Periodic update with current duel details (every 5s) |
| `complete` | Final event when the duel reaches a terminal status |

**Event Data Format:**

`snapshot` and `update` events contain the same `DuelDetails` object returned by `GET /api/arena/duels/:id`.

```
event: snapshot
data: {"duel":{"id":"a1b2c3d4-...","status":"active",...},"participants":[...],"predictions":[...]}

event: update
data: {"duel":{"id":"a1b2c3d4-...","status":"active",...},"participants":[...],"predictions":[...]}

event: complete
data: {"status":"completed"}
```

---

### POST /api/arena/duels/:id/predict

Submit or update a prediction for who will win a duel. Requires authentication. Predictions lock in the last 10% of the duel duration. Participants in the duel cannot predict on their own match.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` (UUID) | Duel ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `predictedWinner` | `string` | Yes | Wallet address of the predicted winner (must be one of the two duel participants, 32-44 chars) |

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/arena/duels/a1b2c3d4-e5f6-7890-abcd-ef1234567890/predict \
  -H 'Content-Type: application/json' \
  -H 'x-wallet: 3kPnR7YzDxMq8jEuTdBw5LcFgH9vNsAo2WQi6XJtRmKe' \
  -H 'x-signature: 5dPhT4A0xRo...' \
  -H 'x-nonce: e5f6a7b8c9d0...' \
  -d '{
    "predictedWinner": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  }'
```

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "id": "e5f6a7b8-c9d0-1234-efab-345678901234",
    "duel_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "predictor_pubkey": "3kPnR7YzDxMq8jEuTdBw5LcFgH9vNsAo2WQi6XJtRmKe",
    "predicted_winner": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "prediction_locked_at": "2026-03-20T13:15:00.000Z",
    "is_correct": null,
    "mutagen_reward": 0
  }
}
```

If the user has already predicted on this duel, their prediction is updated (upsert behavior).

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `DUEL_NOT_ACTIVE` | Duel is not currently active |
| 400 | `CANNOT_PREDICT_OWN_DUEL` | Duel participants cannot predict on their own match |
| 400 | `INVALID_PREDICTION_TARGET` | `predictedWinner` must be one of the two duel participants |
| 400 | `PREDICTION_WINDOW_CLOSED` | Predictions are locked in the last 10% of duel duration |
| 400 | `VALIDATION_ERROR` | Invalid request body |
| 401 | -- | Missing or invalid authentication headers |
| 500 | `INTERNAL_ERROR` | Server error |

---

### GET /api/arena/duels/:id/predictions

Get aggregated prediction statistics for a duel.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` (UUID) | Duel ID |

**Example Request:**

```bash
curl http://localhost:3000/api/arena/duels/a1b2c3d4-e5f6-7890-abcd-ef1234567890/predictions
```

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "total": 15,
    "challenger": {
      "pubkey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      "votes": 9
    },
    "defender": {
      "pubkey": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      "votes": 6
    }
  }
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 404 | `DUEL_NOT_FOUND` | No duel with this ID |
| 500 | `INTERNAL_ERROR` | Server error |

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

**Example Request:**

```bash
curl 'http://localhost:3000/api/arena/competitions?mode=gauntlet&status=registration&limit=5'
```

**Response: 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "id": "f6a7b8c9-d0e1-2345-fgab-456789012345",
      "mode": "gauntlet",
      "status": "registration",
      "season_id": null,
      "start_time": "2026-03-20T14:00:00.000Z",
      "end_time": "2026-03-21T14:00:00.000Z",
      "current_round": 1,
      "total_rounds": 1,
      "config": {
        "name": "SOL Warriors Gauntlet",
        "maxParticipants": 16,
        "durationHours": 24
      },
      "created_at": "2026-03-20T12:00:00.000Z",
      "updated_at": "2026-03-20T12:00:00.000Z"
    }
  ]
}
```

---

### GET /api/arena/competitions/:id

Get competition details including all participants ranked by ROI.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` (UUID) | Competition ID |

**Example Request:**

```bash
curl http://localhost:3000/api/arena/competitions/f6a7b8c9-d0e1-2345-fgab-456789012345
```

**Response: 200 OK**

```json
{
  "success": true,
  "data": {
    "competition": {
      "id": "f6a7b8c9-d0e1-2345-fgab-456789012345",
      "mode": "gauntlet",
      "status": "active",
      "season_id": null,
      "start_time": "2026-03-20T14:00:00.000Z",
      "end_time": "2026-03-21T14:00:00.000Z",
      "current_round": 1,
      "total_rounds": 1,
      "config": {
        "name": "SOL Warriors Gauntlet",
        "maxParticipants": 16,
        "durationHours": 24
      },
      "created_at": "2026-03-20T12:00:00.000Z",
      "updated_at": "2026-03-20T14:00:00.000Z"
    },
    "participants": [
      {
        "id": "aaa11111-2222-3333-4444-555566667777",
        "competition_id": "f6a7b8c9-d0e1-2345-fgab-456789012345",
        "user_pubkey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "team_id": null,
        "status": "active",
        "eliminated_round": null,
        "pnl_usd": 1250.75,
        "roi_percent": 25.15,
        "total_volume_usd": 15000.00,
        "positions_closed": 8,
        "win_rate": 0.7500,
        "arena_score": 1523.40,
        "last_indexed_at": "2026-03-20T18:00:00.000Z",
        "cursor_position_id": 4600,
        "created_at": "2026-03-20T13:00:00.000Z",
        "updated_at": "2026-03-20T18:00:00.000Z"
      },
      {
        "id": "bbb22222-3333-4444-5555-666677778888",
        "competition_id": "f6a7b8c9-d0e1-2345-fgab-456789012345",
        "user_pubkey": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        "team_id": null,
        "status": "active",
        "eliminated_round": null,
        "pnl_usd": 320.10,
        "roi_percent": 6.40,
        "total_volume_usd": 8000.00,
        "positions_closed": 5,
        "win_rate": 0.6000,
        "arena_score": 892.15,
        "last_indexed_at": "2026-03-20T18:00:00.000Z",
        "cursor_position_id": 4595,
        "created_at": "2026-03-20T13:30:00.000Z",
        "updated_at": "2026-03-20T18:00:00.000Z"
      }
    ]
  }
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 404 | `NOT_FOUND` | No competition with this ID |
| 500 | `INTERNAL_ERROR` | Server error |

---

### POST /api/arena/competitions/gauntlet

Create a new Gauntlet competition. Requires authentication. A 2-hour registration period begins immediately; the competition starts after registration ends.

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | -- | Gauntlet name (3-64 characters) |
| `maxParticipants` | `number` | No | `16` | Maximum participants (2-128) |
| `durationHours` | `number` | No | `24` | Competition duration in hours (1-168) |

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/arena/competitions/gauntlet \
  -H 'Content-Type: application/json' \
  -H 'x-wallet: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' \
  -H 'x-signature: 3bNfR2Y8vPm...' \
  -H 'x-nonce: a1b2c3d4e5f6...' \
  -d '{
    "name": "SOL Warriors Gauntlet",
    "maxParticipants": 16,
    "durationHours": 24
  }'
```

**Response: 201 Created**

```json
{
  "success": true,
  "data": {
    "id": "f6a7b8c9-d0e1-2345-fgab-456789012345",
    "mode": "gauntlet",
    "status": "registration",
    "season_id": null,
    "start_time": "2026-03-20T14:00:00.000Z",
    "end_time": "2026-03-21T14:00:00.000Z",
    "current_round": 1,
    "total_rounds": 1,
    "config": {
      "name": "SOL Warriors Gauntlet",
      "maxParticipants": 16,
      "durationHours": 24
    },
    "created_at": "2026-03-20T12:00:00.000Z",
    "updated_at": "2026-03-20T12:00:00.000Z"
  }
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request body |
| 401 | -- | Missing or invalid authentication headers |
| 500 | `INTERNAL_ERROR` | Server error |

---

### POST /api/arena/competitions/:id/register

Register for a Gauntlet competition. Requires authentication. Registration must be open (status = `registration`) and the Gauntlet must not be full.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` (UUID) | Competition ID |

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/arena/competitions/f6a7b8c9-d0e1-2345-fgab-456789012345/register \
  -H 'x-wallet: 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' \
  -H 'x-signature: 4cOgS3Z9wQn...' \
  -H 'x-nonce: d4e5f6a7b8c9...'
```

**Response: 201 Created**

```json
{
  "success": true,
  "data": {
    "id": "bbb22222-3333-4444-5555-666677778888",
    "competition_id": "f6a7b8c9-d0e1-2345-fgab-456789012345",
    "user_pubkey": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "team_id": null,
    "status": "active",
    "eliminated_round": null,
    "pnl_usd": 0,
    "roi_percent": 0,
    "total_volume_usd": 0,
    "positions_closed": 0,
    "win_rate": 0,
    "arena_score": 0,
    "last_indexed_at": null,
    "cursor_position_id": null,
    "created_at": "2026-03-20T13:30:00.000Z",
    "updated_at": "2026-03-20T13:30:00.000Z"
  }
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `NOT_REGISTRABLE` | Gauntlet not found or registration is closed |
| 400 | `GAUNTLET_FULL` | Maximum participant count reached |
| 400 | `ALREADY_REGISTERED` | Wallet is already registered |
| 401 | -- | Missing or invalid authentication headers |
| 500 | `INTERNAL_ERROR` | Server error |

---

### GET /api/arena/competitions/:id/stream

Server-Sent Events (SSE) stream for live leaderboard updates. Polls every 10 seconds.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` (UUID) | Competition ID |

**Example Request:**

```bash
curl -N http://localhost:3000/api/arena/competitions/f6a7b8c9-d0e1-2345-fgab-456789012345/stream
```

**Response Headers:**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

**Event Types:**

| Event | Description |
|-------|-------------|
| `snapshot` | Initial leaderboard state on connection |
| `update` | Periodic leaderboard update (every 10s) |
| `error` | Error loading leaderboard |

**Event Data Format:**

```
event: snapshot
data: {"board":[{"rank":1,"pubkey":"7xKXtg2...","roi":25.15,"pnl":1250.75,"volume":15000.00,"trades":8,"winRate":0.75,"arenaScore":1523.40,"status":"active"},{"rank":2,"pubkey":"9WzDXwB...","roi":6.40,"pnl":320.10,"volume":8000.00,"trades":5,"winRate":0.60,"arenaScore":892.15,"status":"active"}]}

event: update
data: {"board":[...]}
```

**Leaderboard Entry Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `rank` | `number` | Current ranking position (1-indexed) |
| `pubkey` | `string` | Participant wallet address |
| `roi` | `number` | Return on investment percentage |
| `pnl` | `number` | Profit and loss in USD |
| `volume` | `number` | Total trading volume in USD |
| `trades` | `number` | Number of closed positions |
| `winRate` | `number` | Win rate (0-1) |
| `arenaScore` | `number` | Composite Arena Score |
| `status` | `string` | Participant status (`active` or `winner`) |

---

## Users

### GET /api/arena/users/:wallet/profile

Get a user's Arena profile with aggregated duel and gauntlet statistics.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `wallet` | `string` | Solana wallet address |

**Example Request:**

```bash
curl http://localhost:3000/api/arena/users/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU/profile
```

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
    "recentDuels": [
      {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "competition_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "challenger_pubkey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "defender_pubkey": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        "asset_symbol": "SOL",
        "stake_amount": 100,
        "stake_token": "ADX",
        "is_honor_duel": false,
        "duration_hours": 24,
        "status": "completed",
        "winner_pubkey": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "challenger_roi": 12.45,
        "defender_roi": -3.21,
        "escrow_tx": null,
        "settlement_tx": null,
        "challenge_card_url": null,
        "accepted_at": "2026-03-19T12:30:00.000Z",
        "expires_at": "2026-03-19T13:00:00.000Z",
        "created_at": "2026-03-19T12:00:00.000Z"
      }
    ]
  }
}
```

The `recentDuels` array contains up to 10 of the user's most recent duels (as challenger or defender), ordered by `created_at` descending.

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 500 | `INTERNAL_ERROR` | Server error |

Note: If the wallet has no Arena history, the response returns zeroed stats and an empty `recentDuels` array -- it does not return a 404.

---

## Challenge Cards

### GET /api/arena/challenge/:id/card.png

Generate an Open Graph challenge card image for social sharing. Returns a PNG image rendered with Satori.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` (UUID) | Duel ID |

**Response: 200 OK**

```
Content-Type: image/png
Cache-Control: public, max-age=3600
```

The response body is a binary PNG image.

**Fallback Response:** If the card renderer fails, the endpoint returns JSON with duel metadata instead:

```json
{
  "challenger": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "defender": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "asset": "SOL",
  "duration": 24,
  "stake": "100 ADX"
}
```

For honor duels, the `stake` field reads `"Honor Duel"`.

**Error Responses:**

| Status | Description |
|--------|-------------|
| 404 | `{ "error": "Duel not found" }` |
| 500 | `{ "error": "Card generation failed" }` |

---

## WebSocket

### ws://host/ws/duels

Real-time WebSocket connection for live duel updates. Clients subscribe to individual duels and receive updates as participant stats change.

**Connection:**

```javascript
const ws = new WebSocket('ws://localhost:3000/ws/duels');
```

**Client Messages:**

Subscribe to a duel:

```json
{
  "type": "subscribe",
  "duelId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

A client can only be subscribed to one duel at a time. Sending a new `subscribe` message automatically unsubscribes from the previous duel.

**Server Messages:**

Subscription confirmation:

```json
{
  "type": "subscribed",
  "duelId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

Duel update (broadcast to all subscribers when the indexer updates stats):

```json
{
  "type": "duel_update",
  "duelId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "data": {
    "duel": { "...full duel object..." },
    "participants": [ "...participant objects..." ],
    "predictions": [ "...prediction objects..." ]
  }
}
```

The `data` field contains the same `DuelDetails` structure returned by `GET /api/arena/duels/:id`.

**Error Handling:** Malformed messages are silently ignored. The WebSocket connection is cleaned up when the client disconnects.

---

## Health

### GET /api/health

Health check endpoint. Verifies database connectivity by executing a test query.

**Example Request:**

```bash
curl http://localhost:3000/api/health
```

**Response: 200 OK**

```json
{
  "status": "ok",
  "timestamp": "2026-03-20T12:00:00.000Z"
}
```

**Response: 503 Service Unavailable**

```json
{
  "status": "error",
  "message": "Database unavailable"
}
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

Validation errors include an additional `details` array with per-field information from Zod:

```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "details": [
    {
      "code": "invalid_type",
      "expected": "number",
      "received": "string",
      "path": ["durationHours"],
      "message": "Expected number, received string"
    }
  ]
}
```

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
| `NOT_FOUND` | 404 | Competition not found |
| `NOT_REGISTRABLE` | 400 | Gauntlet not found or registration is closed |
| `GAUNTLET_FULL` | 400 | Gauntlet has reached maximum participant count |
| `ALREADY_REGISTERED` | 400 | Wallet is already registered for this Gauntlet |
| `INVALID_WALLET` | 400 | Wallet address is malformed (must be 32-44 characters) |
| `RATE_LIMIT` | 429 | Too many requests (100/min general, 30/min authenticated, 10/min SSE) |
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

- **pending**: Challenge created, waiting for defender to accept (1-hour window).
- **accepted**: Defender has accepted (transient, immediately moves to active).
- **active**: Competition window is running. Trades are being indexed.
- **settling**: Duration ended, scores are being finalized.
- **completed**: Winner determined, results are final.
- **expired**: Defender did not accept within the 1-hour window.
- **cancelled**: Duel was cancelled before starting.

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
