# AdrenaX Arena: Competition Design Specification

**Version:** 1.0.0
**Date:** 2026-03-20
**Status:** Bounty Submission Draft
**Authors:** AdrenaX Arena Team
**Target Platform:** Adrena (adrena.xyz) -- Solana Perpetual DEX

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Mode A: The Gauntlet](#2-mode-a-the-gauntlet)
3. [Mode B: Clan Wars](#3-mode-b-clan-wars)
4. [Mode C: Head-to-Head Duels](#4-mode-c-head-to-head-duels)
5. [Mode D: Seasonal Championship](#5-mode-d-seasonal-championship)
6. [Scoring System](#6-scoring-system)
7. [Mutagen Integration](#7-mutagen-integration)
8. [Onboarding Flow](#8-onboarding-flow)
9. [Abuse Prevention](#9-abuse-prevention)
10. [Prize Pool Economics](#10-prize-pool-economics)
11. [Regulatory Framing](#11-regulatory-framing)
12. [Technical Architecture](#12-technical-architecture)

---

## 1. Executive Summary

### What Is AdrenaX Arena?

AdrenaX Arena is a competitive trading layer built on top of Adrena, the Solana-native perpetual DEX. It transforms isolated trading activity into structured, multi-format competitions that drive sustained engagement, volume growth, and protocol revenue.

Arena introduces four competition modes -- progressive elimination tournaments (The Gauntlet), team-based Clan Wars, peer-to-peer Head-to-Head Duels, and a meta-level Seasonal Championship -- none of which exist on any competing perpetual DEX today.

### Why It Matters for Adrena

Adrena's own data shows that approximately 50% of protocol trading volume originates from competitions. Current competition formats across the perp DEX landscape are limited to simple leaderboards ranked by PnL or volume over a fixed window. These formats suffer from:

- **Front-loading:** Whales establish insurmountable leads early; most participants disengage.
- **Single-dimension ranking:** Pure PnL leaderboards reward reckless leverage, not skill.
- **No social layer:** Competitions are solitary experiences with no peer interaction.
- **No retention loop:** Once a competition ends, there is no structural reason to return.

AdrenaX Arena addresses every one of these problems:

| Problem | Arena Solution |
|---|---|
| Front-loading & early disengagement | Progressive elimination with shrinking round durations |
| Single-dimension ranking | Multi-factor scoring (ROI, win rate, risk-adjusted, consistency) |
| No social layer | Clan Wars, duels, spectator predictions, shareable challenge cards |
| No retention loop | Seasonal Championship with compounding incentives |

### Design Principles

1. **Skill over capital.** Scoring is normalized so a trader with $100 competes fairly against a trader with $10,000.
2. **No on-chain program changes.** Arena reads Adrena's existing trade data via the public API at `datapi.adrena.trade`. All competition logic runs off-chain.
3. **Self-sustaining economics.** Prize pools are funded by protocol fees and staked duel escrow, not perpetual treasury subsidy.
4. **Progressive engagement.** A new user can start with a single honor duel and build toward Gauntlet entry and Seasonal Championship contention over time.

---

## 2. Mode A: The Gauntlet

### Overview

The Gauntlet is AdrenaX Arena's flagship tournament format. It is a multi-round, progressive elimination tournament where 64 to 128 traders compete through increasingly intense rounds. Bottom performers are eliminated each round until a champion is crowned.

The Gauntlet solves the core problem with traditional trading competitions: engagement decay. By compressing time windows and raising stakes each round, every surviving trader remains fully engaged through the final round.

### Registration

| Parameter | Value |
|---|---|
| Minimum entrants | 64 |
| Maximum entrants | 128 |
| Registration window | 72 hours before Round 1 |
| Entry requirement | Minimum 5 closed trades on Adrena in the prior 30 days |
| Entry fee | Configurable per tournament (free, ADX-staked, or USDC) |

If fewer than 64 traders register, the tournament start is delayed by 24 hours. If still below threshold, it is cancelled and any entry fees are refunded.

If registration exceeds 128, a qualifying round (24 hours) is run to reduce the field to 128. The qualifying round uses standard Arena scoring.

### Round Structure

The Gauntlet runs 5 rounds with progressively shorter durations, creating increasing pressure as the field narrows.

| Round | Duration | Survivors In | Eliminated | Survivors Out |
|---|---|---|---|---|
| 1 | 48 hours | 64-128 | Bottom 50% | 32-64 |
| 2 | 36 hours | 32-64 | Bottom 50% | 16-32 |
| 3 | 24 hours | 16-32 | Bottom 50% | 8-16 |
| 4 | 12 hours | 8-16 | Bottom 50% | 4-8 |
| 5 (Final) | 6 hours | 4-8 | Ranked by score | Top 3 awarded |

**Between rounds:** There is a 30-minute intermission between rounds. During this time:

- Scores are finalized and published.
- Eliminated traders are notified and redirected to a spectator view.
- Surviving traders see their updated rank and the next round countdown.
- A live bracket visualization updates to reflect eliminations.

### Minimum Trade Requirement

Each trader must complete at least 1 closed trade per round. A trader who opens no positions or closes no trades in a round receives a score of 0 and is automatically eliminated, regardless of their prior standing.

### Scoring

Gauntlet scoring uses the full Arena composite score with the following weights:

| Component | Weight | Description |
|---|---|---|
| ROI (Normalized) | 40% | Percentage return on capital deployed, normalized to [0,1] |
| Win Rate | 20% | Fraction of trades closed in profit |
| Risk-Adjusted Return | 25% | Sharpe-like ratio: mean trade return / std deviation of trade returns |
| Consistency Bonus | 15% | Penalizes erratic performance across trades within the round |

All components are normalized to the [0,1] range within the context of each round's participant pool. See [Section 6: Scoring System](#6-scoring-system) for detailed formulas.

**Composite formula:**

```
GauntletScore = 0.40 * ROI_norm + 0.20 * WinRate_norm + 0.25 * RiskAdj_norm + 0.15 * Consistency_norm
```

### Tiebreaker

If two or more traders have identical composite scores (to 6 decimal places), the tiebreaker is **total notional trading volume** during that round. Higher volume wins.

If volume is also identical (extremely unlikely), the trader who registered earlier is ranked higher.

### Prize Distribution

Prizes are distributed from the tournament pool (entry fees + any treasury seed):

| Placement | Share of Pool |
|---|---|
| 1st Place | 50% |
| 2nd Place | 30% |
| 3rd Place | 20% |

Additionally, all participants who survive to Round 3 or beyond receive Mutagen multipliers (see [Section 7](#7-mutagen-integration)).

### Spectator Experience

Eliminated traders and non-participants can spectate the Gauntlet:

- Live leaderboard with real-time score updates.
- Round-by-round bracket visualization.
- Trader profile cards showing current round stats.
- Spectators can make non-binding predictions on round outcomes for Mutagen rewards.

### Gauntlet Cadence

The Gauntlet runs on a regular cadence: one tournament per two-week period. This aligns with the Seasonal Championship so that each 4-week season contains exactly 2 Gauntlet tournaments.

---

## 3. Mode B: Clan Wars

### Overview

Clan Wars introduces team-based competition to AdrenaX Arena. Traders form persistent clans of 3 to 5 members and compete collectively. Clan Wars reward coordination, consistent team performance, and strategic roster composition -- mechanics that no existing DEX competition offers.

### Clan Formation

| Parameter | Value |
|---|---|
| Minimum members | 3 |
| Maximum members | 5 |
| Formation method | Clan leader creates, shares invite link, members join |
| Membership lock | Members cannot switch clans during an active war or season |
| Clan name | Unique, 3-24 characters, alphanumeric + underscores |
| Clan creation cost | Free (may require minimum combined trade history) |

**Roster rules:**

- Each wallet can belong to only one clan at a time.
- Leaving a clan imposes a 7-day cooldown before joining another.
- Clans with fewer than 3 active members during a war period forfeit that period.

### Clan Scoring

The Clan Score is computed as the average Arena Score of all members, plus an optional synergy bonus.

```
ClanScore = avg(member_arena_scores) * (1 + synergy_bonus)
```

**Synergy bonuses reward coordinated team performance:**

| Condition | Bonus |
|---|---|
| All members are individually profitable (ROI > 0) during the period | +5% |
| More than 80% of members are individually profitable | +3% |
| Below 80% profitable | +0% |

The synergy bonus incentivizes clans to ensure every member trades competently, not just carry a single star trader.

### Weekly Clan Rankings

Clans are ranked weekly based on their Clan Score over rolling 7-day windows. Rankings reset each Monday at 00:00 UTC.

**Weekly rewards (distributed to clan treasury or split among members):**

| Rank | Reward |
|---|---|
| 1st | Highest Mutagen multiplier tier + ADX bonus |
| 2nd-3rd | Mid-tier Mutagen multiplier |
| 4th-10th | Base Mutagen multiplier |
| 11th+ | Participation Mutagen only |

### Inter-Clan Challenges

Clans can challenge other clans to direct team duels:

1. **Challenge issuance:** Clan leader selects an opponent clan and proposes terms (duration: 24h, 48h, or 7 days; honor or staked).
2. **Accept window:** Opponent clan leader has 4 hours to accept.
3. **War execution:** Both clans trade normally on Adrena during the war period.
4. **Scoring:** Each clan's war score is computed using the standard Clan Score formula.
5. **Settlement:** Winning clan receives the staked prize or Mutagen reward.

**Staked clan wars:**

- Each clan contributes a symmetric stake (e.g., 100 ADX per member).
- Stakes are held in escrow.
- Winning clan receives the combined pool minus a 2% protocol fee.
- In case of tie (Clan Scores within 0.1%), stakes are returned.

### Clan Statistics

Each clan maintains a persistent profile showing:

- Win/loss record in inter-clan challenges.
- Weekly ranking history.
- Member roster and individual contributions.
- Clan-level aggregate statistics (total volume, average ROI, best round).
- Clan badge/tier earned from seasonal performance.

---

## 4. Mode C: Head-to-Head Duels

### Overview

Head-to-Head Duels are the most granular competition unit in AdrenaX Arena. One trader challenges another to a direct, time-boxed performance comparison on a specific asset. Duels can be casual (honor) or high-stakes (escrowed ADX/USDC). They are designed to be viral, shareable, and deeply engaging for both participants and spectators.

### Challenge Flow

#### Step 1: Challenge Creation

The challenger specifies:

| Field | Options | Required |
|---|---|---|
| Opponent | Wallet address (any Adrena trader) | Yes |
| Asset | SOL, ETH, BTC, or "Any" | Yes |
| Duration | 24 hours or 48 hours | Yes |
| Duel type | Honor or Staked | Yes |
| Stake amount | ADX or USDC amount (staked only) | If staked |

When "Any" is selected as the asset, both traders may trade any Adrena-supported asset. ROI is computed across all positions opened during the duel window.

When a specific asset is selected, only positions in that asset count toward the duel score.

#### Step 2: Accept Window

- The challenged trader has **1 hour** to accept.
- A notification is sent via the Arena UI (and optionally via connected wallet notification services).
- If the challenged trader does not accept within 1 hour, the challenge expires. The challenger's escrowed stake (if any) is returned.
- The challenged trader may decline explicitly at any time within the window.

#### Step 3: Duel Execution

- The duel begins immediately upon acceptance.
- Both traders trade on Adrena normally. Arena polls position data from `datapi.adrena.trade/position` to track relevant trades.
- A live duel view shows both traders' real-time ROI, number of trades, and positions.

#### Step 4: Settlement

At duel expiration:

1. Each trader's ROI is computed from positions opened and closed during the duel window.
2. Positions opened during the window but not yet closed are marked-to-market at the duel end timestamp.
3. **The trader with the higher ROI wins.**
4. If a trader made zero closed trades and has no open positions, they forfeit.
5. If both traders forfeit, the duel is voided and stakes are returned.

### Minimum Trade Requirement

Each participant must complete at least **1 closed trade** during the duel window, or they forfeit. This prevents a trader from simply not trading to force a draw or exploit edge cases.

### Scoring

Duels use **pure ROI comparison** -- not the composite Arena score. This keeps duels simple, legible, and visceral: you either made more money (percentage-wise) or you did not.

```
DuelROI = (total_realized_pnl + unrealized_pnl_at_expiry) / total_capital_deployed
```

Capital deployed is the sum of initial margin for all positions opened during the duel window.

### Duel Types

#### Honor Duels

- No financial stake required.
- Winner receives Mutagen rewards (see [Section 7](#7-mutagen-integration)).
- Loser receives reduced participation Mutagen.
- Results contribute to seasonal rankings at a reduced point value.
- Designed as the low-friction entry point for new competitors.

#### Staked Duels

- Both traders escrow symmetric stakes (challenger sets the amount; acceptor must match).
- Supported currencies: ADX, USDC.
- **Escrow:** Stakes are held by the Arena server in a custodial escrow wallet. (Future: on-chain escrow via a simple Solana program.)
- **Protocol fee:** 2% of the total prize pool is retained as a protocol fee.
- **Payout:** Winner receives 98% of the combined pool (their stake + opponent's stake - protocol fee).
- **Minimum stake:** 10 ADX or 5 USDC.
- **Maximum stake:** Configurable per season; initial cap at 1,000 ADX or 500 USDC.

### Challenge Cards

Every duel generates a **shareable challenge card** -- a dynamically rendered OG image suitable for sharing on Twitter/X, Discord, and other platforms.

The challenge card displays:

- Both traders' wallet addresses (truncated) and avatars.
- The asset, duration, and stake amount.
- A "VS" visual treatment.
- A unique URL that links directly to the duel spectator view.
- After settlement: the result overlay (winner/loser, ROI delta).

Challenge cards are generated as PNG images via server-side rendering and served with appropriate OpenGraph meta tags so they unfurl correctly when shared as links.

### Spectator Predictions

Any Arena user can predict the outcome of an active duel:

- Prediction window opens when the duel begins and closes at the 50% duration mark (e.g., 12 hours into a 24-hour duel).
- Predictors select a winner (Trader A or Trader B).
- Correct predictions earn Mutagen.
- Predictions are free (no stake required).
- A prediction leaderboard tracks lifetime prediction accuracy.

### Duel History and Statistics

Each trader maintains a duel record:

- Lifetime win/loss/forfeit counts.
- Win streak (current and best).
- Average ROI in won duels.
- Preferred asset performance breakdown.
- Rival tracking (most frequent opponents).

---

## 5. Mode D: Seasonal Championship

### Overview

The Seasonal Championship is the meta-competition that ties all Arena modes together. It runs in 4-week cycles, accumulating points from Gauntlet placements, duel outcomes, and Clan War results into a single seasonal ranking. The Championship gives every competition meaning beyond its immediate prize -- every duel won, every Gauntlet round survived, and every Clan War contributes to a trader's seasonal standing.

### Season Structure

| Parameter | Value |
|---|---|
| Season duration | 4 weeks (28 days) |
| Start day | Monday, 00:00 UTC |
| End day | Sunday, 23:59:59 UTC (4 weeks later) |
| Gauntlets per season | 2 |
| Ranking updates | Real-time, recalculated on every scoring event |

### Point System

Points are earned from all three active competition modes:

#### Gauntlet Points

| Outcome | Points |
|---|---|
| 1st Place | 100 |
| 2nd Place | 75 |
| 3rd Place | 50 |
| Eliminated in Round 5 (4th-8th) | 40 |
| Eliminated in Round 4 | 30 |
| Eliminated in Round 3 | 20 |
| Eliminated in Round 2 | 10 |
| Eliminated in Round 1 | 10 |

With 2 Gauntlets per season, the maximum Gauntlet contribution is 200 points (winning both).

#### Duel Points

| Outcome | Points |
|---|---|
| Staked duel win | 15 |
| Staked duel loss | 5 (participation) |
| Honor duel win | 10 |
| Honor duel loss | 3 (participation) |
| Duel forfeit (opponent no-show) | 5 (for the non-forfeiting party) |

There is no cap on duel points per season, but diminishing engagement returns are managed by a daily duel limit of 3 active duels simultaneously.

#### Clan War Points

| Outcome | Points |
|---|---|
| Clan war win | 20 per team member |
| Clan war loss | 5 per team member (participation) |
| Weekly clan ranking: 1st | 30 per team member |
| Weekly clan ranking: 2nd-3rd | 20 per team member |
| Weekly clan ranking: 4th-10th | 10 per team member |

Clan war points are awarded individually to each member of the clan. A 5-member clan that wins a war earns 20 points per member (100 total points distributed).

### Seasonal Rankings

Traders are ranked by total accumulated points. The leaderboard displays:

- Current rank and point total.
- Point breakdown by mode (Gauntlet / Duels / Clan Wars).
- Rank trajectory (rising/falling/stable indicator).
- Points needed to reach the next reward tier.

### Season Rewards

The top 10 traders at the end of each season receive progressive ADX rewards:

| Rank | ADX Reward | Multiplier of Base |
|---|---|---|
| 1st | 10x base | Highest |
| 2nd | 7x base | |
| 3rd | 5x base | |
| 4th | 4x base | |
| 5th | 3x base | |
| 6th-7th | 2x base | |
| 8th-10th | 1x base | |

The "base" amount is configured per season based on treasury allocation and protocol revenue. Example: if base = 500 ADX, the champion receives 5,000 ADX.

### Season Pass

Each season features a **Season Pass** with milestone-based unlocks:

| Milestone | Threshold | Unlock |
|---|---|---|
| First Blood | 1 duel completed | Arena profile badge |
| Contender | 50 points | Mutagen bonus multiplier (1.1x for remainder of season) |
| Warrior | 150 points | Exclusive challenge card skin |
| Elite | 300 points | Enhanced Mutagen multiplier (1.25x) |
| Champion | 500 points | Seasonal title + maximum Mutagen multiplier (1.5x) |

Season Pass progress is visible on the trader's profile and persists as historical record after the season ends (titles and badges remain; multipliers reset).

### Season Transitions

At the end of each season:

1. Final rankings are frozen and published.
2. Rewards are distributed within 24 hours.
3. All point totals reset to 0.
4. Active duels that span the season boundary are settled and their points count toward the season in which the duel started.
5. Clan membership and statistics carry over.
6. A new Season Pass activates.

---

## 6. Scoring System

### Design Philosophy

The Arena scoring system is designed to reward **skill, not capital**. A trader deploying $100 of margin should be able to outscore a trader deploying $100,000 if they trade more skillfully. This is achieved through normalization: all raw metrics are mapped to the [0,1] range relative to the participant pool in each competition context.

### Component Definitions

#### 6.1 ROI (Normalized)

**Raw ROI:**

```
ROI_raw = total_realized_pnl / total_capital_deployed
```

Where:
- `total_realized_pnl` = sum of PnL from all closed positions in the scoring window.
- `total_capital_deployed` = sum of initial margin for all positions opened in the scoring window.

For rounds where mark-to-market of open positions is required (e.g., duel settlement), unrealized PnL is included:

```
ROI_raw = (total_realized_pnl + unrealized_pnl_at_snapshot) / total_capital_deployed
```

**Normalization (min-max within the participant pool):**

```
ROI_norm = (ROI_raw - ROI_min) / (ROI_max - ROI_min)
```

If all participants have identical ROI, `ROI_norm = 0.5` for everyone.

#### 6.2 Win Rate

**Raw Win Rate:**

```
WinRate_raw = count(trades where PnL > 0) / count(all_closed_trades)
```

A trade that closes at exactly 0 PnL (break-even) is counted as neither a win nor a loss -- it is excluded from both numerator and denominator. If this results in 0 qualifying trades, win rate defaults to 0.

**Normalization:**

```
WinRate_norm = (WinRate_raw - WinRate_min) / (WinRate_max - WinRate_min)
```

#### 6.3 Risk-Adjusted Return (Sharpe Proxy)

This component rewards traders who achieve returns with lower variance -- a proxy for the Sharpe ratio adapted to the context of short competition windows.

**Raw calculation:**

```
mean_return = mean(individual_trade_returns)
std_return  = stddev(individual_trade_returns)
RiskAdj_raw = mean_return / std_return    (if std_return > 0)
RiskAdj_raw = mean_return * 10            (if std_return == 0, i.e., single trade)
```

Where `individual_trade_returns` is the array of per-trade ROI values: `trade_pnl / trade_margin` for each closed trade.

The single-trade case (stddev = 0) applies a fixed multiplier to avoid division by zero while still rewarding profitable single trades proportionally.

**Normalization:**

```
RiskAdj_norm = (RiskAdj_raw - RiskAdj_min) / (RiskAdj_max - RiskAdj_min)
```

#### 6.4 Consistency Bonus

Consistency rewards traders whose individual trade returns cluster tightly around their mean -- penalizing "lottery ticket" strategies where one massive win masks many losses.

**Raw calculation:**

```
cv = std_return / |mean_return|    (coefficient of variation, if mean != 0)
Consistency_raw = 1 / (1 + cv)     (maps to (0, 1], lower cv = higher consistency)
```

If `mean_return == 0`, consistency defaults to 0.5 (neutral).

**Normalization:**

```
Consistency_norm = (Consistency_raw - Consistency_min) / (Consistency_max - Consistency_min)
```

### Composite Arena Score

The composite Arena Score is mode-dependent:

#### Gauntlet Weights

```
ArenaScore = 0.40 * ROI_norm + 0.20 * WinRate_norm + 0.25 * RiskAdj_norm + 0.15 * Consistency_norm
```

#### Clan Wars Weights

Clan Wars uses the same weights as the Gauntlet for individual member scores. The clan-level score adds the synergy bonus on top.

#### Duels

Duels use **pure ROI only**. The composite score is not applied. This keeps duels simple and immediately legible.

#### Seasonal Championship

The Seasonal Championship does not use Arena Score directly -- it uses the point system described in [Section 5](#5-mode-d-seasonal-championship).

### Normalization Scope

Normalization is always performed within the relevant participant pool:

- **Gauntlet:** Normalized across all traders still active in the current round.
- **Clan Wars:** Normalized across all individual traders in both competing clans (for inter-clan challenges) or all active clan members (for weekly rankings).
- **Duels:** Not applicable (pure ROI comparison).

### Edge Cases

| Scenario | Handling |
|---|---|
| Trader has 0 closed trades in a round | Score = 0; auto-eliminated |
| Trader has exactly 1 trade | Win rate is 0 or 1; risk-adjusted uses single-trade formula; consistency = 0.5 |
| All traders have identical metrics | All normalized values = 0.5 |
| Negative ROI for all traders | Normalization still applies; the least-negative trader scores highest |
| Trader only has break-even trades | Win rate = 0; ROI ~ 0; ranked low but not auto-eliminated |

---

## 7. Mutagen Integration

### Background

Mutagen is Adrena's existing engagement reward token/point system. AdrenaX Arena integrates with Mutagen to provide non-financial incentives across all competition modes, reinforcing the engagement loop without requiring additional token emissions.

### Arena Mutagen Multipliers

Arena participation applies a multiplier to the Mutagen a trader would normally earn from their Adrena trading activity:

| Arena Activity | Mutagen Multiplier |
|---|---|
| Active in any competition | 1.1x (base arena bonus) |
| Survived to Gauntlet Round 3+ | 1.25x |
| Gauntlet Top 3 | 1.5x |
| Duel win (staked) | 1.3x for 24 hours post-settlement |
| Duel win (honor) | 1.15x for 24 hours post-settlement |
| Clan weekly ranking Top 3 | 1.2x for the following week |
| Season Pass: Elite tier | 1.25x for remainder of season |
| Season Pass: Champion tier | 1.5x for remainder of season |
| Correct spectator prediction | Flat Mutagen award (not multiplier) |

Multipliers are **not cumulative** -- the highest applicable multiplier is used. This prevents runaway Mutagen inflation while still rewarding peak achievement.

### Spectator Mutagen

Spectators who correctly predict duel or Gauntlet round outcomes earn flat Mutagen awards:

- Correct duel prediction: small fixed award.
- Correct Gauntlet round survivor prediction: medium fixed award.
- Prediction streak bonus: 3+ correct predictions in a row earn a 1.5x bonus on the base prediction award.

### Mutagen Sink

To maintain Mutagen economy health, Arena also introduces optional Mutagen sinks:

- Premium challenge card skins (cosmetic, costs Mutagen).
- Clan name change fee (Mutagen cost).
- Tournament registration for special "Mutagen-entry" Gauntlets.

---

## 8. Onboarding Flow

### User Journey: Discovery to Full Engagement

The onboarding flow is designed to progressively introduce complexity. A new user should be able to go from zero to their first duel in under 5 minutes.

#### Stage 1: Discovery

**Trigger:** User visits AdrenaX Arena landing page (linked from Adrena main UI, Twitter, or shared duel card).

**Experience:**
1. Hero section explains the Arena concept in one sentence: "Compete against real traders. Prove your skill."
2. Live activity feed shows recent duel results, active Gauntlet round status, and clan rankings.
3. Clear CTA: "Connect Wallet to Enter the Arena."

#### Stage 2: Wallet Connection and Eligibility Check

**Trigger:** User connects their Solana wallet.

**Experience:**
1. Arena checks the wallet's trade history on Adrena via `datapi.adrena.trade/position`.
2. If the wallet has prior Adrena trades: "Welcome back, trader. You're eligible for all modes."
3. If the wallet has no Adrena history: "Start trading on Adrena to unlock competitions." with a direct link to the Adrena trading UI.

#### Stage 3: Profile Creation

**Trigger:** Eligible wallet connects for the first time.

**Experience:**
1. Auto-generated trader profile with wallet address as default display name.
2. Optional: set a display name (3-20 characters).
3. Profile shows lifetime Adrena stats pulled from the API.
4. Arena dashboard becomes the user's home screen.

#### Stage 4: First Competition -- Honor Duel

**Trigger:** Profile created.

**Experience:**
1. A guided prompt suggests: "Challenge someone to your first duel."
2. The UI presents a curated list of "Open to Challenges" traders (those who have opted in to receive random challenges).
3. User selects an opponent, picks an asset, and chooses 24-hour duration.
4. Duel type defaults to Honor (no financial stake) for first-time users.
5. Challenge card is generated. User is prompted to share it.

#### Stage 5: Escalation

**After first duel completion:**
1. User sees their duel record on their profile.
2. Prompt: "Ready for higher stakes? Try a Staked Duel." (if user has ADX/USDC).
3. Prompt: "Join a Clan to compete as a team."
4. If a Gauntlet registration window is open: "The Gauntlet is accepting registrations."

#### Stage 6: Full Engagement

**After multiple competitions:**
1. Seasonal Championship standings appear on the dashboard.
2. Season Pass progress is visible and motivating.
3. Clan membership provides social accountability.
4. The user is now in the retention loop: every trade on Adrena contributes to their Arena standing.

---

## 9. Abuse Prevention

Trading competitions are vulnerable to manipulation. AdrenaX Arena implements layered defenses against the most common attack vectors.

### 9.1 Wash Trading

**Attack:** A trader opens and immediately closes positions (or trades against themselves via multiple wallets) to inflate volume or manipulate scoring metrics.

**Defenses:**

- **Minimum position duration:** Trades held for less than 60 seconds are excluded from scoring.
- **Minimum PnL threshold:** Trades with absolute PnL below 0.01% of margin are flagged and excluded.
- **Volume-score decoupling:** Volume is only used as a tiebreaker, never as a primary scoring component. This removes the primary incentive for wash trading.
- **Pattern detection:** Server-side analysis flags wallets that exhibit repetitive open-close patterns with minimal price movement between open and close.

### 9.2 Sybil Attacks

**Attack:** A single entity registers multiple wallets to gain unfair advantages (e.g., filling a Gauntlet bracket with puppet accounts, or creating multiple clans).

**Defenses:**

- **Trade history requirement:** Gauntlet entry requires 5 closed trades in the prior 30 days with meaningful PnL variance. This raises the cost of maintaining sybil wallets.
- **Stake-based gating:** Staked competitions require real capital, making sybil attacks economically expensive.
- **Behavioral clustering:** Wallets that consistently trade the same assets at the same times with similar position sizes are flagged for review.
- **One clan per wallet:** Enforced at the application level.

### 9.3 Self-Dueling

**Attack:** A trader challenges their own second wallet to a duel, ensuring they win the staked prize (minus protocol fee) with certainty.

**Defenses:**

- **Correlated wallet detection:** Wallets that have transferred SOL, ADX, or USDC to each other within the prior 90 days are flagged. Duels between flagged wallet pairs require manual approval.
- **Behavioral analysis:** If two wallets consistently duel each other and one always forfeits or loses with minimal activity, the pair is flagged and suspended from staked duels.
- **Protocol fee as friction:** The 2% protocol fee on staked duels ensures self-dueling is always a net loss, removing the financial incentive.
- **Minimum trade requirement:** Both sides must make at least 1 trade, forcing capital commitment and market risk on both wallets.

### 9.4 ROI Manipulation

**Attack:** A trader uses an extremely small position to generate an outsized ROI percentage (e.g., $1 margin with 50x leverage on a volatile asset).

**Defenses:**

- **Minimum capital deployment:** Each competition mode enforces a minimum total margin deployed during the scoring window. For the Gauntlet: at least $50 equivalent. For duels: at least $10 equivalent.
- **Capital-weighted ROI option:** For future iterations, ROI can be weighted by capital deployed to reduce the impact of micro-positions. The current design uses simple ROI with minimum thresholds as the pragmatic first step.
- **Outlier capping:** ROI values beyond 3 standard deviations from the participant mean are capped at the 3-sigma boundary for normalization purposes. The raw ROI is still displayed, but the normalized score is capped.

### 9.5 Sandbagging

**Attack:** A skilled trader intentionally performs poorly in early Gauntlet rounds to face weaker opponents later, or in early-season duels to manipulate matchmaking.

**Defenses:**

- **No matchmaking in Gauntlet:** All survivors compete in the same pool each round. There is no bracket seeding that rewards lower performance.
- **No ELO-based duel matching:** Duels are freely chosen by participants. There is no matchmaking algorithm to exploit.
- **Elimination pressure:** Bottom 50% are eliminated each Gauntlet round. Sandbagging in Round 1 risks elimination.
- **Seasonal point incentives:** Every competition awards points. Deliberately losing duels still earns participation points, but winning earns 3x more. The opportunity cost of sandbagging is always negative.

### 9.6 Additional Measures

- **Rate limiting:** Maximum 3 simultaneous active duels per wallet. Maximum 10 duel challenges issued per day.
- **Cooldown periods:** After a Gauntlet elimination, the wallet cannot enter another Gauntlet qualifying round for 24 hours (prevents rage-re-entry on alt accounts).
- **Reporting system:** Users can flag suspicious behavior. Flagged accounts are reviewed within 48 hours.
- **Ban policy:** Confirmed abusers are banned from Arena competitions for the remainder of the season (first offense) or permanently (repeat offense). Staked funds in active competitions are forfeited.

---

## 10. Prize Pool Economics

### Design Goal

AdrenaX Arena's prize pool economics are designed to be **self-sustaining**. After an initial treasury seed phase, the system should fund itself entirely through protocol fees and participant stakes.

### Revenue Sources

| Source | Mechanism | Expected Contribution |
|---|---|---|
| Staked duel protocol fees | 2% of every staked duel prize pool | Primary recurring revenue |
| Gauntlet entry fees | Configurable per tournament | Significant for premium tournaments |
| Staked Clan War fees | 2% of inter-clan war stakes | Moderate recurring revenue |
| Adrena protocol fee share | Portion of trading fees from Arena-driven volume | Negotiated with Adrena treasury |

### Cost Structure

| Cost | Description |
|---|---|
| Gauntlet prizes | 100% of Gauntlet entry fees + optional treasury top-up |
| Seasonal Championship rewards | ADX allocation from treasury or fee revenue |
| Clan War weekly rewards | Mutagen (zero marginal cost) + small ADX allocation |
| Infrastructure | Server, database, API polling costs |

### Funding Phases

#### Phase 1: Treasury Seed (Months 1-3)

- Gauntlet prize pools are subsidized by the Adrena treasury.
- Staked duels are live but volume is low; protocol fee revenue is minimal.
- Goal: build participant base and demonstrate engagement metrics.

**Transition criteria to Phase 2:**
- 50+ unique wallets participating in competitions per week.
- 20+ staked duels per week.
- At least 2 full Gauntlets completed.

#### Phase 2: Hybrid (Months 4-6)

- Gauntlet prizes are funded 50% by entry fees, 50% by treasury.
- Staked duel protocol fees cover operational costs.
- Seasonal rewards are still treasury-funded but reduced in absolute terms.

**Transition criteria to Phase 3:**
- 200+ unique wallets participating per week.
- 100+ staked duels per week.
- Protocol fee revenue covers infrastructure costs.

#### Phase 3: Self-Sustaining (Month 7+)

- Gauntlet prizes are 100% funded by entry fees.
- Protocol fee revenue funds seasonal rewards and operational costs.
- Treasury allocation is zero or reserved only for special promotional events.
- Surplus protocol fees are returned to the Adrena treasury.

### Prize Pool Transparency

All prize pool funding, fee collection, and distribution is logged and publicly queryable via the Arena API. Traders can verify:

- Total pool size for any competition.
- Fee deductions.
- Payout amounts and recipient wallets.
- Treasury seed contributions (during Phases 1-2).

---

## 11. Regulatory Framing

### Context

Staked duels and prize pool competitions in the crypto space occupy regulatory gray areas. AdrenaX Arena is designed with a defensible legal framing from the outset.

### Performance Bond Framing for Staked Duels

Staked duels are framed as **performance bonds**, not wagers:

- Each participant deposits a performance bond (stake) representing their commitment to actively participate in the competition.
- The bond is forfeited if the participant fails to meet minimum activity requirements (at least 1 closed trade).
- The bond is returned (with bonus from the opponent's forfeiture) based on **demonstrated trading performance**, not on a chance outcome.
- The outcome is determined by the participant's own skill and decisions, not by an external random event.

**Key distinctions from gambling:**

| Factor | Gambling | Arena Staked Duels |
|---|---|---|
| Outcome determination | Chance or house edge | Participant skill (trading performance) |
| Participant agency | Minimal (slots, roulette) or partial (poker) | Full -- trader controls all decisions |
| House participation | House takes opposing position | Protocol is neutral facilitator |
| Skill correlation | Low to moderate | High -- better traders win more often |
| Activity requirement | None (can place bet passively) | Must actively trade to avoid forfeiture |

### Skill-Based Competition Precedent

The Arena model aligns with **skill-based competition** frameworks that are broadly legal:

- Fantasy sports platforms (DraftKings, FanDuel) operate legally under skill-game exemptions in most U.S. states and internationally.
- Trading competitions on centralized exchanges (Binance, Bybit) operate globally without gambling classification.
- The key legal test is whether skill predominates over chance in determining outcomes. Arena's multi-factor scoring and active participation requirements strongly favor a skill classification.

### Risk Mitigations

- **No house edge on outcomes:** The protocol fee is a flat service fee, not a risk-based margin. The protocol does not take a position against participants.
- **Symmetric stakes:** Both participants deposit equal amounts. There are no odds, spreads, or asymmetric payouts.
- **Geographic restrictions:** The Arena UI can implement geo-blocking for jurisdictions where skill-based competitions with stakes are restricted. This is an application-layer configuration.
- **Terms of service:** Clear ToS framing staked duels as competitive performance bonds with explicit acknowledgment of skill-based outcomes.

### Disclaimer

This section describes the intended legal framing and is not legal advice. Actual regulatory compliance should be reviewed by qualified counsel in each target jurisdiction.

---

## 12. Technical Architecture

### High-Level System Design

```
+------------------+     +------------------+     +-------------------+
|                  |     |                  |     |                   |
|   Arena UI       |<--->|   Arena Server   |<--->|   PostgreSQL      |
|   (Next.js)      |     |   (Express/TS)   |     |   (Persistent)    |
|                  |     |                  |     |                   |
+------------------+     +--------+---------+     +-------------------+
                                  |
                         +--------+---------+
                         |                  |
                         |   Redis          |
                         |   (Cache/Pubsub) |
                         |                  |
                         +--------+---------+
                                  |
                         +--------+---------+
                         |                  |
                         |  Adrena Data API |
                         |  (External)      |
                         |                  |
                         +------------------+
                         datapi.adrena.trade
```

### Component Responsibilities

#### Arena UI (Next.js)

- Server-side rendered pages for SEO and OG card generation.
- Client-side WebSocket connection for real-time leaderboard and duel updates.
- Wallet connection via Solana wallet adapter.
- Challenge card image generation (server-side via OG image routes).
- Responsive design for desktop and mobile.

#### Arena Server (Express + TypeScript)

- **Competition Engine:** Manages Gauntlet state machine (registration, rounds, eliminations, settlement), duel lifecycle, and clan war orchestration.
- **Scoring Engine:** Computes Arena Score components from trade data. Runs normalization per competition context.
- **Data Poller:** Periodically polls `datapi.adrena.trade/position` for trade data. Configurable polling interval (default: 30 seconds for active competitions, 5 minutes for idle).
- **Escrow Manager:** Manages stake deposits and payouts for staked duels. (Phase 1: custodial wallet. Future: on-chain program.)
- **Notification Service:** Sends duel challenges, round transitions, and elimination notifications via WebSocket push.
- **REST API:** Exposes endpoints for the UI and third-party integrations.
- **Abuse Detection:** Runs pattern analysis on trade data and wallet relationships.

#### PostgreSQL

Persistent storage for:

- Trader profiles and Arena statistics.
- Competition definitions, rounds, and results.
- Duel records and settlement history.
- Clan rosters and Clan War records.
- Seasonal Championship point ledgers.
- Audit logs for all financial transactions (stakes, payouts, fees).

#### Redis

- **Caching:** Hot leaderboard data, active competition state, trader score snapshots.
- **Pub/Sub:** Real-time event distribution to WebSocket connections (score updates, round transitions, duel settlements).
- **Rate limiting:** Per-wallet API and challenge rate limits.
- **Session management:** WebSocket connection tracking.

### Data Flow: Gauntlet Round

```
1. Round starts (timer-triggered)
   |
2. Poller begins high-frequency polling (30s interval)
   |  - GET datapi.adrena.trade/position?wallet={each_participant}
   |  - Parse new/closed positions
   |  - Store raw trade data in PostgreSQL
   |
3. Scoring engine recalculates (every 60 seconds)
   |  - Compute ROI, WinRate, RiskAdj, Consistency per trader
   |  - Normalize across active participants
   |  - Compute composite ArenaScore
   |  - Cache results in Redis
   |
4. UI receives updated leaderboard via WebSocket
   |
5. Round timer expires
   |  - Final score calculation with position mark-to-market
   |  - Rank all participants
   |  - Eliminate bottom 50%
   |  - Persist results to PostgreSQL
   |  - Push elimination notifications
   |  - Start 30-minute intermission timer
   |
6. Next round begins (return to step 1)
```

### Data Flow: Duel Lifecycle

```
1. Challenger creates duel
   |  - Validate challenger eligibility
   |  - If staked: verify and escrow challenger's stake
   |  - Create duel record (status: PENDING)
   |  - Send challenge notification to opponent
   |  - Generate challenge card image
   |
2. Accept window (1 hour)
   |  - If accepted: escrow opponent's stake (if staked), set status: ACTIVE
   |  - If expired/declined: refund challenger's stake, set status: EXPIRED/DECLINED
   |
3. Duel execution
   |  - Poller tracks both wallets' positions on the specified asset
   |  - Real-time ROI displayed to participants and spectators
   |  - Spectator predictions accepted until 50% duration mark
   |
4. Settlement
   |  - Compute final ROI for both traders
   |  - Determine winner
   |  - If staked: distribute prize pool (winner gets 98%, protocol gets 2%)
   |  - Award Mutagen and seasonal points
   |  - Settle spectator predictions
   |  - Update duel record (status: SETTLED)
   |  - Generate result overlay on challenge card
```

### API Endpoints (Arena Server)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/connect` | Authenticate via wallet signature |
| `GET` | `/api/profile/:wallet` | Get trader profile and stats |
| `POST` | `/api/gauntlet/register` | Register for active Gauntlet |
| `GET` | `/api/gauntlet/:id/leaderboard` | Get current round leaderboard |
| `GET` | `/api/gauntlet/:id/bracket` | Get elimination bracket |
| `POST` | `/api/duels/challenge` | Create a duel challenge |
| `POST` | `/api/duels/:id/accept` | Accept a duel challenge |
| `POST` | `/api/duels/:id/decline` | Decline a duel challenge |
| `GET` | `/api/duels/:id` | Get duel details and live status |
| `GET` | `/api/duels/:id/card` | Get challenge card OG image |
| `POST` | `/api/duels/:id/predict` | Submit spectator prediction |
| `POST` | `/api/clans/create` | Create a new clan |
| `POST` | `/api/clans/:id/join` | Join a clan |
| `POST` | `/api/clans/:id/challenge` | Issue inter-clan challenge |
| `GET` | `/api/clans/rankings` | Get weekly clan rankings |
| `GET` | `/api/season/standings` | Get seasonal championship standings |
| `GET` | `/api/season/pass/:wallet` | Get Season Pass progress |
| `WS` | `/ws/live` | WebSocket for real-time updates |

### Real-Time Updates

The WebSocket connection at `/ws/live` supports the following event channels:

- `gauntlet:{id}:leaderboard` -- Score updates every 60 seconds during active rounds.
- `gauntlet:{id}:round` -- Round start, end, and elimination events.
- `duel:{id}:update` -- Live ROI updates for active duels.
- `duel:{id}:settlement` -- Duel result announcement.
- `clan:{id}:update` -- Clan score and ranking changes.
- `season:standings` -- Seasonal leaderboard changes.

Clients subscribe to relevant channels based on their current view. The server uses Redis Pub/Sub to fan out events to all connected WebSocket clients subscribed to a given channel.

### Infrastructure Requirements

| Component | Specification |
|---|---|
| Arena Server | Node.js 20+, 2+ CPU cores, 4GB RAM minimum |
| PostgreSQL | Version 15+, 50GB storage (growing with history) |
| Redis | Version 7+, 2GB RAM |
| Polling bandwidth | ~1 request/30s per active participant during competitions |
| WebSocket connections | Support for 1,000+ concurrent connections |

### Security Considerations

- **Wallet authentication:** All state-changing API calls require a signed message from the caller's Solana wallet.
- **Escrow security:** Staked funds are held in a server-controlled hot wallet with multisig for withdrawals above threshold. Transition to on-chain escrow in future phases.
- **Rate limiting:** All API endpoints are rate-limited per wallet to prevent abuse.
- **Data integrity:** All scoring calculations are logged with inputs and outputs for auditability. Historical scores are immutable once a round/duel is settled.

---

## Appendix A: Glossary

| Term | Definition |
|---|---|
| **Arena Score** | The composite score used to rank traders in Gauntlet and Clan Wars, combining ROI, Win Rate, Risk-Adjusted Return, and Consistency |
| **Challenge Card** | A shareable image summarizing a duel challenge or result, optimized for social media embedding |
| **Clan Score** | The average Arena Score of all clan members, plus synergy bonus |
| **Honor Duel** | A duel with no financial stake; rewards are Mutagen-only |
| **Mutagen** | Adrena's existing engagement reward points/tokens |
| **Normalization** | Mapping raw metric values to the [0,1] range relative to a participant pool |
| **Performance Bond** | Legal framing for staked duel deposits -- a commitment to participate, forfeited on inactivity |
| **Season Pass** | A milestone-based progression system within each 4-week season |
| **Staked Duel** | A duel where both participants escrow ADX or USDC; winner takes the pool |
| **Synergy Bonus** | A percentage boost to Clan Score when most or all members are individually profitable |
| **The Gauntlet** | The flagship tournament: multi-round progressive elimination |

## Appendix B: Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0.0 | 2026-03-20 | AdrenaX Arena Team | Initial design specification |
