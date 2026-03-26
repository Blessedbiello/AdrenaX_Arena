# AdrenaX Arena — Demo Video Script (3 minutes)

## Setup Before Recording

- Server running on localhost:3000 with seeded data (run `run-full-competition.ts` first)
- UI running on localhost:3001
- Browser: Chrome, dark mode, clean tabs
- Have Phantom wallet connected with a test wallet
- Have two browser windows or tabs ready (to show both sides of a duel)

---

## INTRO (0:00 - 0:15)

**Show:** Arena hub page (localhost:3001/arena)

**Say:**
> "This is AdrenaX Arena — a peer-to-peer trading competition platform built for Adrena on Solana. Instead of boring leaderboards, traders challenge each other to head-to-head duels, compete in multi-round gauntlets, form clans for team battles, and climb seasonal rankings. Let me show you how it works."

---

## THE HUB (0:15 - 0:30)

**Show:** Scroll the arena hub slowly — point out the "How It Works" section, open challenges with pulsing OPEN badges, live duels, recent results

**Say:**
> "The arena hub shows everything at a glance — open challenges anyone can accept, live duels in progress, and recent results. Notice the asset icons, the OPEN badges pulsing for broadcast challenges, and the challenge cards that are shareable on Twitter and Discord."

---

## CREATE A DUEL (0:30 - 1:00)

**Show:** Click "Challenge Someone" → Duels page → Create form

**Do:**
1. Toggle "Open Challenge" mode
2. Select SOL asset, 24h duration, Honor Duel
3. Click "Send Challenge"
4. Show the created duel with the challenge card image

**Say:**
> "Creating a duel is simple. I can challenge a specific wallet or broadcast an open challenge for anyone to accept. I pick the asset, the duration, and whether it's an honor duel for Mutagen rewards or a staked duel with real tokens locked in our on-chain escrow. Every challenge generates a shareable card optimized for Twitter and Discord embeds."

---

## DUEL DETAIL + PREDICTIONS (1:00 - 1:25)

**Show:** Click into a completed duel from the recent results

**Point out:**
- The battle view showing challenger vs defender with ROI percentages
- The winner badge
- The prediction widget showing vote counts
- The streak badge if the winner has one (🔥 Hot Streak)
- The revenge button (if visible)

**Say:**
> "Each duel has a live battle view. Spectators can predict the winner and earn Mutagen rewards. After settlement, the winner gets their streak updated — three wins earns you the Hot Streak title with a 1.15x Mutagen multiplier. And losers get a 30-minute revenge window to challenge back for 1.5x rewards."

---

## CLANS (1:25 - 1:45)

**Show:** Navigate to /arena/clans

**Point out:**
- Clan rankings with war scores
- Click into a clan to show members with role badges
- Member count, war record

**Say:**
> "Traders can form clans of 3 to 5 members. Clans compete in team-based wars where every member's trades contribute to the clan score, plus a synergy bonus for coordination. Clan rankings create a meta-game that keeps teams coming back."

---

## GAUNTLET (1:45 - 1:55)

**Show:** Navigate to /arena/gauntlet

**Say:**
> "The Gauntlet is our multi-round elimination tournament. Up to 128 traders enter, and the bottom 50% are eliminated each round using a 4-component Arena Score — ROI, win rate, risk-adjusted return, and consistency. Only the most skilled traders survive all 5 rounds."

---

## LEADERBOARD + SEASONS (1:55 - 2:15)

**Show:** Navigate to /arena/leaderboard — show the weekly tab with medal styling for top 3

**Then:** Navigate to /arena/seasons — show the season standings

**Say:**
> "The global leaderboard tracks all-time performance with weekly and monthly filters. Everything feeds into the Seasonal Championship where duel wins, gauntlet placements, and clan wars all earn season points. Top performers each season get exclusive rewards."

---

## PROFILE (2:15 - 2:30)

**Show:** Navigate to /arena/profile (wallet connected)

**Point out:**
- Stats grid: total duels, win rate, current streak, best streak
- Streak title badge
- Recent duels list

**Say:**
> "Every trader has a profile showing their arena stats, current streak title, and Mutagen multiplier. This is where you track your progression across all competition modes."

---

## TECHNICAL DEPTH (2:30 - 2:50)

**Show:** Split screen or quick cuts:
1. Terminal showing `anchor build` completing
2. Solana Explorer showing the program ID on devnet
3. Terminal showing 132/132 tests passing
4. Terminal showing 115/115 competition checks

**Say:**
> "Under the hood, this is production-grade. We have an Anchor escrow program deployed to Solana devnet for trustless staked duels — security audited with 27 findings addressed. 132 unit tests, 115 end-to-end competition checks with real Solana wallets, validated against Adrena's live API. 10 database migrations, 52 API endpoints, persistent webhooks, anti-sybil controls, and admin tools."

---

## CLOSE (2:50 - 3:00)

**Show:** Back to the arena hub

**Say:**
> "AdrenaX Arena turns Adrena's trading into a social competition platform. Duels, gauntlets, clan wars, seasons, revenge mechanics, streak titles, spectator predictions, and on-chain escrow — all working, all tested, all documented. No other perp DEX has anything like this. Thanks for watching."

---

## Recording Tips

- **Resolution:** 1920x1080 minimum
- **Speed:** Don't rush — let each page load and breathe for 1-2 seconds before narrating
- **Mouse:** Move deliberately, don't wiggle. Click precisely.
- **Audio:** Use a quiet room. A decent mic matters more than video quality.
- **Tool:** Loom (free, instant share link) or OBS + YouTube upload
- **Length:** Aim for 2:30-3:00. Under 3 minutes respects judges' time.
- **Thumbnail:** Screenshot of the arena hub with a duel card visible
