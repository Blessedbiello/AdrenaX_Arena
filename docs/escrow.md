# AdrenaX Arena — On-Chain Escrow Program

## Deployment

| Field | Value |
|---|---|
| **Program ID** | `BQQnoKSbNBVjFuiGB33QWymz6PhczDmRFmeLMJ3MGvwQ` |
| **IDL Account** | `9aYKXk2ppRD4PJfxtA9MLtdLuMV41TwuffqQ1EZJaoKy` |
| **Cluster** | Devnet (`https://api.devnet.solana.com`) |
| **Upgrade Authority** | `3fMoA42W8MzvA86ZUFiRj5ayoEuwmDkz1qtZGiY5ooWR` |
| **Framework** | Anchor 0.30.1 |
| **Size** | 331,144 bytes |

## Overview

The Arena Escrow program provides trustless custody for staked duels on Solana. Both participants deposit SPL tokens into a PDA-owned vault. The server authority settles the winner or refunds on void/draw. Protocol fees route to a configurable treasury.

## Instructions

### `initialize_config`
Creates the global ArenaConfig PDA. Sets treasury wallet, fee basis points (max 500 = 5%), and allowed token mints.

**Seeds:** `[b"config"]`
**Signer:** Authority (upgrade authority)

### `create_duel_escrow`
Creates a DuelEscrow PDA and transfers the challenger's stake to the escrow vault.

**Seeds:** `[b"duel", duel_id.as_bytes()]`
**Signer:** Challenger
**Constraints:**
- Program must not be paused
- Mint must be in allowed_mints list
- `duel_id` must be 1-32 bytes
- `expires_at` must be in the future

### `accept_duel_escrow`
Defender deposits a matching stake into the escrow vault. Status transitions from Pending to Funded.

**Signer:** Defender
**Constraints:**
- Escrow must be Pending
- Not expired
- Defender != Challenger (no self-duels)
- Amount must match challenger's deposit

### `cancel_expired_duel`
Permissionless refund after the duel expires without being accepted. Refunds challenger and closes the escrow account.

**Signer:** Anyone (permissionless)
**Constraints:** Escrow must be Pending AND current time >= expires_at

### `settle_duel_winner`
Authority transfers total stake minus fee to the winner and fee to treasury. Closes the escrow account.

**Signer:** Authority
**Constraints:**
- Escrow must be Funded
- Winner must be challenger or defender
- Winner token account must be owned by winner
- Treasury token account must be owned by config.treasury

### `refund_void_duel`
Authority refunds both parties (draw/void). No protocol fee. Closes the escrow account.

**Signer:** Authority
**Constraints:** Escrow must be Funded

### `pause_program` / `resume_program`
Emergency controls. When paused, `create_duel_escrow` and `accept_duel_escrow` are blocked.

**Signer:** Authority

## Account Structure

### ArenaConfig
```
Seeds: [b"config"]
Fields:
  authority:      Pubkey     (upgrade authority)
  treasury:       Pubkey     (fee destination)
  fee_bps:        u16        (max 500 = 5%)
  paused:         bool
  allowed_mints:  Vec<Pubkey> (max 4)
  bump:           u8
```

### DuelEscrow
```
Seeds: [b"duel", duel_id.as_bytes()]
Fields:
  duel_id:            String     (max 32 bytes)
  challenger:         Pubkey
  defender:           Pubkey     (default until accepted)
  mint:               Pubkey
  challenger_amount:  u64
  defender_amount:    u64
  status:             EscrowStatus (Pending/Funded/Settled/Refunded/Cancelled)
  created_at:         i64
  expires_at:         i64
  winner:             Pubkey     (default until settled)
  bump:               u8
```

## Events

| Event | Emitted By | Key Fields |
|---|---|---|
| `EscrowCreated` | create_duel_escrow | duel_id, challenger, mint, amount, expires_at |
| `EscrowAccepted` | accept_duel_escrow | duel_id, defender, amount |
| `EscrowCancelled` | cancel_expired_duel | duel_id, challenger, refund_amount |
| `EscrowSettled` | settle_duel_winner | duel_id, winner, winner_amount, fee_amount |
| `EscrowRefunded` | refund_void_duel | duel_id, challenger_refund, defender_refund |
| `ProgramPaused` | pause_program | authority |
| `ProgramResumed` | resume_program | authority |

## Security

- Vault ownership constrained to escrow PDA on every instruction
- Winner and treasury token accounts verified against expected owners
- `duel_id` limited to 32 bytes to prevent PDA seed overflow
- Accounts closed on terminal states (Settled/Refunded/Cancelled) to reclaim rent
- `checked_add` used for total amount to prevent overflow
- Mint validated on all token account constraints
- `expires_at` must be in the future at creation time
- Authority checks on settle/refund/pause/resume

## Fee Calculation

```
total = challenger_amount + defender_amount
fee = total * fee_bps / 10000
winner_amount = total - fee
```

Integer division truncates downward, guaranteeing `winner_amount + fee <= total`.

## Integration with Server

The `EscrowClient` in `packages/arena-server/src/solana/escrow-client.ts` wraps all instructions. When `PROGRAM_ID` is not configured (dev mode), operations are no-ops that log intent. In production:

1. `createDuel()` calls `createDuelEscrow` after DB insert
2. `acceptDuel()` verifies on-chain acceptance before DB update
3. `settleDuel()` calls `settleDuelWinner` or `refundVoidDuel` via the reward distributor
4. `expireStaleDuels()` calls `cancelExpiredDuel` for cleanup
