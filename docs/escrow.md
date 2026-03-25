# AdrenaX Arena — On-Chain Escrow Program

## Deployment

| Field | Value |
|---|---|
| **Program ID** | `BQQnoKSbNBVjFuiGB33QWymz6PhczDmRFmeLMJ3MGvwQ` |
| **IDL Account** | `9aYKXk2ppRD4PJfxtA9MLtdLuMV41TwuffqQ1EZJaoKy` |
| **Cluster** | Devnet (`https://api.devnet.solana.com`) |
| **Upgrade Authority** | `3fMoA42W8MzvA86ZUFiRj5ayoEuwmDkz1qtZGiY5ooWR` |
| **Framework** | Anchor 0.30.1 |
| **Size** | 366,152 bytes |
| **Last Deployed** | 2026-03-25 (post-audit fix redeployment) |

## Overview

The Arena Escrow program provides trustless custody for staked competitions (duels and clan wars) on Solana. Both sides deposit SPL tokens into a PDA-owned associated token vault. The server authority settles the winner or refunds on void/draw. Protocol fees route to a configurable treasury. The program is generic — the same instructions handle both 1v1 duels and clan war escrows via the `CompetitionKind` enum.

## Instructions (9 total)

### `initialize_config`
Creates the global ArenaConfig PDA. Sets treasury wallet, fee basis points (max 500 = 5%), and allowed token mints.

**Seeds:** `[b"config"]`
**Signer:** Authority (upgrade authority)
**Constraints:**
- `fee_bps` <= 500
- `allowed_mints` must not be empty

### `update_config`
Updates treasury, fee, or allowed mints. Authority-only.

**Signer:** Authority
**Constraints:**
- Caller must be `config.authority`
- If updating `fee_bps`: must be <= 500
- If updating `allowed_mints`: must not be empty
- Emits `ConfigUpdated` event

### `create_competition_escrow`
Creates a CompetitionEscrow PDA and transfers side A's (challenger's) stake to the escrow vault. Supports both duels (`CompetitionKind::Duel`) and clan wars (`CompetitionKind::ClanWar`).

**Seeds:** `[b"competition", escrow_id.as_bytes()]`
**Signer:** Side A controller (challenger)
**Constraints:**
- Program must not be paused
- Mint must be in `allowed_mints` list
- `escrow_id` must be 1-32 bytes (UUIDs must have hyphens stripped)
- `expires_at` must be in the future
- `expected_side_b_amount` must be > 0
- Side B controller must differ from side A (if pre-specified)
- Vault is an associated token account owned by the escrow PDA

### `fund_competition_side`
Either side deposits tokens into the escrow. Used by side B (defender) to match the challenger's stake. Can also be used for incremental deposits.

**Signer:** Contributor
**Constraints:**
- Escrow must be in `PartiallyFunded` status
- Not expired
- Contributor must match the side's controller
- Deposit must not exceed the expected amount for that side (`checked_add`)
- Side B controller is assigned on first funding if initially `Pubkey::default()` (open challenge)
- When both sides meet their expected amounts, status transitions to `Funded`

### `cancel_competition_escrow`
Refunds deposited tokens after the escrow expires without being fully funded. Closes both the escrow account and the vault.

**Signer:** Side A controller, side B controller, or authority
**Constraints:**
- Escrow must be `PartiallyFunded`
- Current time >= `expires_at`
- Side A token account owner must match `side_a_controller` (Anchor-level constraint)
- Side B token account owner must match `side_b_controller` OR `side_b_amount == 0` (Anchor-level)
- Vault closed via `close_account` CPI; escrow closed via Anchor `close = caller`

### `settle_competition_winner`
Authority transfers total stake minus fee to the winner and fee to treasury. Closes escrow + vault.

**Signer:** Authority
**Constraints:**
- Program must not be paused
- Escrow must be `Funded`
- Caller must be `config.authority`
- Winner token account owner must match the winning side's controller
- Treasury token account owner must match `config.treasury`
- Total computed via `checked_add`; fee via `checked_mul` + `checked_sub`
- Vault closed; escrow closed via `close = authority`
- Emits `CompetitionEscrowSettled` event

### `refund_competition_draw`
Authority refunds both parties (draw/void). No protocol fee. Closes escrow + vault.

**Signer:** Authority
**Constraints:**
- Program must not be paused
- Escrow must be `Funded`
- `side_b_controller` must not be `Pubkey::default()`
- Side A/B token account owners must match their controllers (Anchor-level)
- Vault closed; escrow closed via `close = authority`

### `pause_program` / `resume_program`
Emergency controls. When paused, `create_competition_escrow`, `fund_competition_side`, `settle_competition_winner`, and `refund_competition_draw` are blocked.

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
  allowed_mints:  Vec<Pubkey> (max 8)
  bump:           u8
```

### CompetitionEscrow
```
Seeds: [b"competition", escrow_id.as_bytes()]
Fields:
  escrow_id:              String              (max 32 bytes, UUID with hyphens stripped)
  competition_kind:       CompetitionKind     (Duel | ClanWar)
  mint:                   Pubkey
  side_a_controller:      Pubkey              (challenger / clan leader)
  side_b_controller:      Pubkey              (defender, Pubkey::default() until claimed)
  expected_side_a_amount: u64
  expected_side_b_amount: u64
  side_a_amount:          u64                 (actual deposited)
  side_b_amount:          u64                 (actual deposited)
  status:                 CompetitionEscrowStatus
  created_at:             i64
  expires_at:             i64
  winning_side:           u8                  (0=SideA, 1=SideB, 255=none)
  bump:                   u8
```

### Status Enum
```
Pending          — reserved (not currently used)
PartiallyFunded  — side A deposited, waiting for side B
Funded           — both sides met expected amounts
Settled          — winner paid, fee to treasury
Refunded         — both sides refunded (draw/void)
Cancelled        — expired, deposits refunded
```

## Events

| Event | Emitted By | Key Fields |
|---|---|---|
| `CompetitionEscrowCreated` | create_competition_escrow | escrow_id, kind, mint, controllers, amounts, expires_at |
| `CompetitionSideFunded` | create/fund | escrow_id, side, contributor, amount, side_total, status |
| `CompetitionEscrowCancelled` | cancel | escrow_id, side_a_refund, side_b_refund |
| `CompetitionEscrowSettled` | settle | escrow_id, winner_side, winner_controller, winner_amount, fee |
| `CompetitionEscrowRefunded` | refund | escrow_id, side_a_refund, side_b_refund |
| `ProgramPaused` | pause | authority |
| `ProgramResumed` | resume | authority |
| `ConfigUpdated` | update_config | authority |

## Security (Audit Findings Addressed)

All findings from the security review have been fixed and redeployed:

- **Vault ownership**: Associated token account derived from escrow PDA via `associated_token::authority = escrow` on every context
- **Winner/treasury token accounts**: Owner validated against winning side controller and `config.treasury`
- **Cancel/refund token accounts**: Owner constraints at Anchor struct level (not just runtime)
- **escrow_id length**: Limited to 32 bytes; server strips UUID hyphens before PDA derivation
- **Account closing**: All terminal states (Settled/Refunded/Cancelled) close both escrow PDA and vault, returning rent
- **Arithmetic**: `checked_add`, `checked_mul`, `checked_sub` throughout fee/total calculations
- **Pause enforcement**: settle and refund also check `config.paused`
- **Side B default guard**: `refund_competition_draw` rejects `Pubkey::default()` side B
- **Config updates**: `update_config` instruction allows treasury/fee/mints changes without redeployment

## Fee Calculation

```
total = side_a_amount + side_b_amount         (checked_add)
fee = total * fee_bps / 10_000                (checked_mul, integer truncation)
winner_amount = total - fee                    (checked_sub)
```

Fee truncates toward zero (integer division), slightly favoring the winner. This is intentional.

## Integration with Server

The `EscrowClient` in `packages/arena-server/src/solana/escrow-client.ts` wraps all instructions:

1. `createDuel()` → `create_competition_escrow` (server builds unsigned tx for challenger to sign)
2. `fundSide()` → `fund_competition_side` (defender deposits via frontend signing)
3. `settleDuel()` → `settle_competition_winner` (server signs as authority)
4. `refundDraw()` → `refund_competition_draw` (server signs as authority)
5. `cancelExpired()` → `cancel_competition_escrow` (permissionless after expiry)

**UUID handling:** Duel IDs are UUIDs (36 chars with hyphens). The escrow client strips hyphens to produce 32 hex chars that fit the on-chain `#[max_len(32)]` constraint.

**Settlement recovery:** The server uses `settlement_pending` → `settled`/`settlement_failed` escrow states. Failed settlements are logged for manual retry via admin endpoints.
