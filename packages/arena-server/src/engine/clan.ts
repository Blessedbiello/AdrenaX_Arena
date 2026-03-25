import { sql, type Kysely, type Transaction } from 'kysely';
import { getDb } from '../db/connection.js';
import type { Clan, ClanMember, ClanWar, DB } from '../db/types.js';
import { env } from '../config.js';
import { scheduleClanWarSettlement, startIndexingParticipant, stopIndexingParticipant } from './indexer.js';
import { awardSeasonPoints } from './season.js';
import { scheduleRewardProcessing } from '../rewards/distributor.js';
import { getEscrowClient } from '../solana/escrow-client.js';

export class ClanError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = 'ClanError';
  }
}

export async function createClan(name: string, tag: string, leaderPubkey: string): Promise<Clan> {
  const db = getDb();

  await assertNoClanCooldown(db, leaderPubkey);

  // Verify leader is not already in a clan
  const existing = await db
    .selectFrom('arena_clan_members')
    .where('user_pubkey', '=', leaderPubkey)
    .selectAll()
    .executeTakeFirst();

  if (existing) {
    throw new ClanError('ALREADY_IN_CLAN', 'You are already in a clan');
  }

  return db.transaction().execute(async (trx) => {
    const clan = await trx
      .insertInto('arena_clans')
      .values({
        name,
        tag: tag.toUpperCase(),
        leader_pubkey: leaderPubkey,
        member_count: 1,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx
      .insertInto('arena_clan_members')
      .values({
        clan_id: clan.id,
        user_pubkey: leaderPubkey,
        role: 'leader',
      })
      .execute();

    return clan;
  });
}

export async function joinClan(clanId: string, userPubkey: string): Promise<ClanMember> {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    await assertNoClanCooldown(trx, userPubkey);

    // Check not already in a clan
    const existing = await trx
      .selectFrom('arena_clan_members')
      .where('user_pubkey', '=', userPubkey)
      .selectAll()
      .executeTakeFirst();

    if (existing) {
      throw new ClanError('ALREADY_IN_CLAN', 'You are already in a clan');
    }

    // Check clan exists and has room
    const clan = await trx
      .selectFrom('arena_clans')
      .where('id', '=', clanId)
      .forUpdate()
      .selectAll()
      .executeTakeFirst();

    if (!clan) {
      throw new ClanError('CLAN_NOT_FOUND', 'Clan not found');
    }

    if (await hasActiveClanWar(trx, clanId)) {
      throw new ClanError('CLAN_ROSTER_LOCKED', 'Clan roster is locked while a clan war is active or pending');
    }

    if (clan.member_count >= 5) {
      throw new ClanError('CLAN_FULL', 'Clan is full (5 members max)');
    }

    // Add member
    const member = await trx
      .insertInto('arena_clan_members')
      .values({
        clan_id: clanId,
        user_pubkey: userPubkey,
        role: 'member',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Increment count
    await trx
      .updateTable('arena_clans')
      .set({ member_count: sql`member_count + 1` })
      .where('id', '=', clanId)
      .execute();

    return member;
  });
}

export async function leaveClan(userPubkey: string): Promise<{ disbanded: boolean }> {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    const membership = await trx
      .selectFrom('arena_clan_members')
      .where('user_pubkey', '=', userPubkey)
      .selectAll()
      .executeTakeFirst();

    if (!membership) {
      throw new ClanError('NOT_IN_CLAN', 'You are not in a clan');
    }

    if (await hasActiveClanWar(trx, membership.clan_id)) {
      throw new ClanError('CLAN_ROSTER_LOCKED', 'Cannot leave while your clan is in an active or pending war');
    }

    // Leaders can't leave unless they're the only member
    if (membership.role === 'leader') {
      const clan = await trx
        .selectFrom('arena_clans')
        .where('id', '=', membership.clan_id)
        .selectAll()
        .executeTakeFirstOrThrow();

      if (clan.member_count > 1) {
        throw new ClanError('LEADER_CANNOT_LEAVE', 'Transfer leadership before leaving (or remove all members)');
      }

      // Delete the clan if leader is the only member
      await trx.deleteFrom('arena_clan_members').where('id', '=', membership.id).execute();
      await trx.deleteFrom('arena_clans').where('id', '=', membership.clan_id).execute();
      await recordClanCooldown(trx, userPubkey, membership.clan_id);
      return { disbanded: true };
    }

    // Regular member leaves
    await trx.deleteFrom('arena_clan_members').where('id', '=', membership.id).execute();
    await trx
      .updateTable('arena_clans')
      .set({ member_count: sql`member_count - 1` })
      .where('id', '=', membership.clan_id)
      .execute();
    await recordClanCooldown(trx, userPubkey, membership.clan_id);

    return { disbanded: false };
  });
}

export async function getClanRankings(): Promise<Clan[]> {
  const db = getDb();
  return db
    .selectFrom('arena_clans')
    .orderBy('total_war_score', 'desc')
    .limit(50)
    .selectAll()
    .execute();
}

export async function getClanDetails(clanId: string): Promise<{ clan: Clan; members: ClanMember[] } | null> {
  const db = getDb();
  const clan = await db
    .selectFrom('arena_clans')
    .where('id', '=', clanId)
    .selectAll()
    .executeTakeFirst();

  if (!clan) return null;

  const members = await db
    .selectFrom('arena_clan_members')
    .where('clan_id', '=', clanId)
    .selectAll()
    .execute();

  return { clan, members };
}

/**
 * Calculate clan score: average member arena_score * synergy bonus.
 * Synergy bonus matches the design doc:
 * - +5% when all members are profitable
 * - +3% when more than 80% are profitable
 * - +0% otherwise
 */
export function calculateClanScore(memberScores: number[], profitableMemberCount = memberScores.filter(score => score > 0).length): number {
  if (memberScores.length === 0) return 0;
  const avg = memberScores.reduce((a, b) => a + b, 0) / memberScores.length;
  const profitableRatio = profitableMemberCount / memberScores.length;
  const synergyBonus = profitableRatio === 1 ? 1.05 : profitableRatio > 0.8 ? 1.03 : 1;
  return avg * synergyBonus;
}

export async function createClanWar(
  leaderPubkey: string,
  opponentClanId: string,
  durationHours: 24 | 48 | 168,
  isHonorWar = true,
  stakeAmount = 0,
  stakeToken: 'ADX' | 'USDC' = 'ADX'
): Promise<{ war: ClanWar; competitionId: string }> {
  if (isHonorWar && stakeAmount > 0) {
    throw new ClanError('INVALID_WAR_CONFIG', 'Honor wars cannot include escrow stakes');
  }
  if (!isHonorWar && stakeAmount <= 0) {
    throw new ClanError('INVALID_WAR_CONFIG', 'Staked clan wars must specify a positive escrow amount');
  }

  if (!isHonorWar || stakeAmount > 0) {
    try {
      getEscrowClient().assertAvailable();
    } catch {
      throw new ClanError('ESCROW_NOT_CONFIGURED', 'Staked clan wars are unavailable until escrow is configured');
    }
  }

  const db = getDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  return db.transaction().execute(async (trx) => {
    const leaderMembership = await trx
      .selectFrom('arena_clan_members')
      .where('user_pubkey', '=', leaderPubkey)
      .selectAll()
      .executeTakeFirst();

    if (!leaderMembership || leaderMembership.role !== 'leader') {
      throw new ClanError('LEADER_REQUIRED', 'Only clan leaders can issue clan war challenges');
    }

    if (leaderMembership.clan_id === opponentClanId) {
      throw new ClanError('INVALID_OPPONENT', 'Cannot challenge your own clan');
    }

    if (await hasActiveClanWar(trx, leaderMembership.clan_id) || await hasActiveClanWar(trx, opponentClanId)) {
      throw new ClanError('ACTIVE_WAR_EXISTS', 'Both clans must be free of active or pending wars');
    }

    const clans = await trx
      .selectFrom('arena_clans')
      .where('id', 'in', [leaderMembership.clan_id, opponentClanId])
      .selectAll()
      .execute();

    if (clans.length !== 2) {
      throw new ClanError('CLAN_NOT_FOUND', 'Both clans must exist');
    }

    if (clans.some((clan) => clan.member_count < 3 || clan.member_count > 5)) {
      throw new ClanError('INVALID_ROSTER', 'Both clans must have 3 to 5 members');
    }

    const competition = await trx
      .insertInto('arena_competitions')
      .values({
        mode: 'clan_war',
        status: 'pending',
        start_time: now,
        end_time: new Date(now.getTime() + durationHours * 60 * 60 * 1000),
        current_round: 1,
        total_rounds: 1,
        config: JSON.stringify({
          name: `${clans[0].tag} vs ${clans[1].tag}`,
          durationHours,
          maxClans: 2,
        }),
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const war = await trx
      .insertInto('arena_clan_wars')
      .values({
        competition_id: competition.id,
        challenger_clan_id: leaderMembership.clan_id,
        defender_clan_id: opponentClanId,
        duration_hours: durationHours,
        stake_amount: stakeAmount,
        stake_token: stakeAmount > 0 ? stakeToken : null,
        is_honor_war: isHonorWar,
        status: 'pending',
        escrow_state: !isHonorWar && stakeAmount > 0 ? 'awaiting_challenger_deposit' : 'not_required',
        expires_at: expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return { war, competitionId: competition.id };
  });
}

export async function confirmChallengerClanWarDeposit(warId: string, challengerLeaderWallet: string, txSignature: string): Promise<ClanWar> {
  const db = getDb();

  const war = await db
    .selectFrom('arena_clan_wars as war')
    .innerJoin('arena_clans as challenger_clan', 'challenger_clan.id', 'war.challenger_clan_id')
    .where('war.id', '=', warId)
    .where('war.status', '=', 'pending')
    .where('challenger_clan.leader_pubkey', '=', challengerLeaderWallet)
    .selectAll('war')
    .executeTakeFirst();

  if (!war) {
    throw new ClanError('WAR_NOT_FOUND', 'Clan war not found or no longer fundable');
  }

  if (war.is_honor_war || Number(war.stake_amount) <= 0 || !war.stake_token) {
    throw new ClanError('ESCROW_NOT_REQUIRED', 'This clan war does not require escrow funding');
  }

  if (war.escrow_state !== 'awaiting_challenger_deposit') {
    return war;
  }

  await getEscrowClient().verifyUserEscrowSignature(txSignature, challengerLeaderWallet, warId);

  return db
    .updateTable('arena_clan_wars')
    .set({
      challenger_deposit_tx: txSignature,
      escrow_tx: txSignature,
      escrow_state: 'awaiting_defender_deposit',
    })
    .where('id', '=', warId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function acceptClanWar(warId: string, leaderPubkey: string, defenderDepositTxSignature?: string): Promise<ClanWar> {
  const db = getDb();

  return db.transaction().execute(async (trx) => {
    const war = await trx
      .selectFrom('arena_clan_wars')
      .where('id', '=', warId)
      .where('status', '=', 'pending')
      .forUpdate()
      .selectAll()
      .executeTakeFirst();

    if (!war) {
      throw new ClanError('WAR_NOT_FOUND', 'Clan war not found or no longer pending');
    }

    const membership = await trx
      .selectFrom('arena_clan_members')
      .where('user_pubkey', '=', leaderPubkey)
      .selectAll()
      .executeTakeFirst();

    if (!membership || membership.role !== 'leader' || membership.clan_id !== war.defender_clan_id) {
      throw new ClanError('LEADER_REQUIRED', 'Only the challenged clan leader can accept this war');
    }

    if (new Date(war.expires_at) < new Date()) {
      throw new ClanError('WAR_EXPIRED', 'Clan war challenge has expired');
    }

    if (!war.is_honor_war && Number(war.stake_amount) > 0) {
      if (war.escrow_state === 'awaiting_challenger_deposit') {
        throw new ClanError('CHALLENGER_DEPOSIT_PENDING', 'The challenger clan must fund escrow before this war can be accepted');
      }
      if (war.escrow_state !== 'awaiting_defender_deposit') {
        throw new ClanError('WAR_NOT_FOUND', 'This clan war is not ready for defender escrow funding');
      }
      if (!defenderDepositTxSignature) {
        throw new ClanError('DEFENDER_DEPOSIT_REQUIRED', 'A confirmed defender clan escrow deposit is required to accept this war');
      }
      await getEscrowClient().verifyUserEscrowSignature(defenderDepositTxSignature, leaderPubkey, warId);
    }

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + war.duration_hours * 60 * 60 * 1000);

    await trx
      .updateTable('arena_competitions')
      .set({ status: 'active', start_time: startTime, end_time: endTime, updated_at: startTime })
      .where('id', '=', war.competition_id)
      .execute();

    const members = await trx
      .selectFrom('arena_clan_members')
      .where('clan_id', 'in', [war.challenger_clan_id, war.defender_clan_id])
      .select(['clan_id', 'user_pubkey'])
      .execute();

    await trx
      .insertInto('arena_participants')
      .values(members.map((member) => ({
        competition_id: war.competition_id,
        user_pubkey: member.user_pubkey,
        team_id: member.clan_id,
        status: 'active' as const,
      })))
      .execute();

    const updatedWar = await trx
      .updateTable('arena_clan_wars')
      .set({
        status: 'active',
        accepted_at: startTime,
        defender_deposit_tx: defenderDepositTxSignature ?? war.defender_deposit_tx,
        escrow_state: !war.is_honor_war && Number(war.stake_amount) > 0 ? 'funded' : war.escrow_state,
      })
      .where('id', '=', warId)
      .returningAll()
      .executeTakeFirstOrThrow();

    for (const member of members) {
      await startIndexingParticipant(env.REDIS_URL, war.competition_id, member.user_pubkey);
    }

    await scheduleClanWarSettlement(env.REDIS_URL, war.id, endTime);
    return updatedWar;
  });
}

export async function settleClanWar(warId: string): Promise<{ war: ClanWar; scores: Record<string, number> }> {
  const db = getDb();

  const txResult = await db.transaction().execute(async (trx) => {
    const war = await trx
      .selectFrom('arena_clan_wars')
      .where('id', '=', warId)
      .where('status', '=', 'active')
      .forUpdate()
      .selectAll()
      .executeTakeFirst();

    if (!war) {
      throw new ClanError('WAR_NOT_SETTLEABLE', 'Clan war not found or not active');
    }

    const clans = await trx
      .selectFrom('arena_clans')
      .where('id', 'in', [war.challenger_clan_id, war.defender_clan_id])
      .select(['id', 'leader_pubkey'])
      .execute();

    const challengerClan = clans.find((clan) => clan.id === war.challenger_clan_id);
    const defenderClan = clans.find((clan) => clan.id === war.defender_clan_id);
    if (!challengerClan || !defenderClan) {
      throw new ClanError('CLAN_NOT_FOUND', 'Both clans must exist to settle the war');
    }

    const participants = await trx
      .selectFrom('arena_participants')
      .where('competition_id', '=', war.competition_id)
      .selectAll()
      .execute();

    const challengerMembers = participants.filter((participant) => participant.team_id === war.challenger_clan_id);
    const defenderMembers = participants.filter((participant) => participant.team_id === war.defender_clan_id);

    const challengerScore = calculateClanScore(
      challengerMembers.map((member) => Number(member.arena_score)),
      challengerMembers.filter((member) => Number(member.roi_percent) > 0).length
    );
    const defenderScore = calculateClanScore(
      defenderMembers.map((member) => Number(member.arena_score)),
      defenderMembers.filter((member) => Number(member.roi_percent) > 0).length
    );

    const scoreDelta = Math.abs(challengerScore - defenderScore);
    const winnerClanId = scoreDelta <= 0.1
      ? null
      : challengerScore > defenderScore
        ? war.challenger_clan_id
        : war.defender_clan_id;

    await trx
      .updateTable('arena_competitions')
      .set({ status: 'completed', updated_at: new Date() })
      .where('id', '=', war.competition_id)
      .execute();

    await trx
      .updateTable('arena_clan_wars')
      .set({ status: 'completed', winner_clan_id: winnerClanId })
      .where('id', '=', warId)
      .execute();

    await trx
      .updateTable('arena_clans')
      .set({
        total_war_score: sql`total_war_score + CASE WHEN id = ${war.challenger_clan_id} THEN ${challengerScore} ELSE ${defenderScore} END`,
        wars_played: sql`wars_played + 1`,
      })
      .where('id', 'in', [war.challenger_clan_id, war.defender_clan_id])
      .execute();

    if (winnerClanId) {
      await trx
        .updateTable('arena_clans')
        .set({ wars_won: sql`wars_won + 1` })
        .where('id', '=', winnerClanId)
        .execute();

      await trx
        .updateTable('arena_participants')
        .set({ status: 'winner' })
        .where('competition_id', '=', war.competition_id)
        .where('team_id', '=', winnerClanId)
        .execute();

      await trx
        .updateTable('arena_participants')
        .set({ status: 'eliminated' })
        .where('competition_id', '=', war.competition_id)
        .where('team_id', '!=', winnerClanId)
        .execute();

      const winners = participants.filter((participant) => participant.team_id === winnerClanId);
      for (const winner of winners) {
        await awardSeasonPoints(war.competition_id, winner.user_pubkey, 5, 'clan');
        if (war.is_honor_war) {
          await trx
            .insertInto('arena_rewards')
            .values({
              competition_id: war.competition_id,
              user_pubkey: winner.user_pubkey,
              amount: 20,
              token: 'MUTAGEN',
              reward_type: 'mutagen_bonus',
            })
            .execute();
        }
      }
    } else {
      await trx
        .updateTable('arena_participants')
        .set({ status: 'eliminated' })
        .where('competition_id', '=', war.competition_id)
        .execute();
    }

    for (const participant of participants) {
      await stopIndexingParticipant(env.REDIS_URL, war.competition_id, participant.user_pubkey);
    }

    return {
      war: {
        ...war,
        status: 'completed' as const,
        winner_clan_id: winnerClanId,
      },
      scores: {
        [war.challenger_clan_id]: challengerScore,
        [war.defender_clan_id]: defenderScore,
      },
      challengerLeaderPubkey: challengerClan.leader_pubkey,
      defenderLeaderPubkey: defenderClan.leader_pubkey,
      winnerLeaderPubkey: winnerClanId === war.challenger_clan_id
        ? challengerClan.leader_pubkey
        : winnerClanId === war.defender_clan_id
          ? defenderClan.leader_pubkey
          : null,
      winnerSide: winnerClanId === war.challenger_clan_id
        ? ('side_a' as const)
        : winnerClanId === war.defender_clan_id
          ? ('side_b' as const)
          : null,
      shouldProcessRewards: !!winnerClanId && war.is_honor_war,
    };
  });

  if (txResult.shouldProcessRewards) {
    await scheduleRewardProcessing(env.REDIS_URL, txResult.war.competition_id);
  }

  if (!txResult.war.is_honor_war && Number(txResult.war.stake_amount) > 0 && txResult.war.stake_token) {
    let settlementTx: string | null = null;
    if (txResult.winnerLeaderPubkey && txResult.winnerSide) {
      settlementTx = await getEscrowClient().settleClanWarWinner(
        { competitionId: warId, mint: txResult.war.stake_token as 'ADX' | 'USDC' },
        txResult.winnerLeaderPubkey,
        txResult.winnerSide,
      );
    } else {
      settlementTx = await getEscrowClient().refundClanWarDraw(
        { competitionId: warId, mint: txResult.war.stake_token as 'ADX' | 'USDC' },
        txResult.challengerLeaderPubkey,
        txResult.defenderLeaderPubkey,
      );
    }

    if (settlementTx) {
      await db
        .updateTable('arena_clan_wars')
        .set({
          settlement_tx: settlementTx,
          escrow_state: txResult.winnerLeaderPubkey ? 'settled' : 'refunded',
        })
        .where('id', '=', warId)
        .execute();
      txResult.war.settlement_tx = settlementTx;
    }
  }

  return { war: txResult.war, scores: txResult.scores };
}

export async function getClanWars(clanId: string): Promise<ClanWar[]> {
  const db = getDb();
  return db
    .selectFrom('arena_clan_wars')
    .where(eb => eb.or([
      eb('challenger_clan_id', '=', clanId),
      eb('defender_clan_id', '=', clanId),
    ]))
    .orderBy('created_at', 'desc')
    .selectAll()
    .execute();
}

export async function expireStaleClanWars(): Promise<number> {
  const db = getDb();
  const now = new Date();
  const escrowClient = getEscrowClient();

  const expiredWars = await db
    .updateTable('arena_clan_wars')
    .set({
      status: 'expired',
      escrow_state: sql`CASE
        WHEN is_honor_war = TRUE OR COALESCE(stake_amount, 0) = 0 THEN escrow_state
        WHEN challenger_deposit_tx IS NULL THEN 'cancelled'
        ELSE escrow_state
      END`,
    })
    .where('status', '=', 'pending')
    .where('expires_at', '<', now)
    .returningAll()
    .execute();

  for (const war of expiredWars) {
    const clans = await db
      .selectFrom('arena_clans')
      .where('id', 'in', [war.challenger_clan_id, war.defender_clan_id])
      .select(['id', 'leader_pubkey'])
      .execute();

    const challengerLeader = clans.find((clan) => clan.id === war.challenger_clan_id)?.leader_pubkey;
    const defenderLeader = clans.find((clan) => clan.id === war.defender_clan_id)?.leader_pubkey;

    if (!war.is_honor_war && Number(war.stake_amount) > 0 && war.stake_token && war.challenger_deposit_tx && challengerLeader) {
      const settlementTx = await escrowClient.cancelExpiredClanWar(
        { competitionId: war.id, mint: war.stake_token as 'ADX' | 'USDC' },
        challengerLeader,
        defenderLeader ?? challengerLeader,
      );
      if (settlementTx) {
        await db
          .updateTable('arena_clan_wars')
          .set({ settlement_tx: settlementTx, escrow_state: 'cancelled' })
          .where('id', '=', war.id)
          .execute();
      }
    }

    await db
      .updateTable('arena_competitions')
      .set({ status: 'cancelled', updated_at: now })
      .where('id', '=', war.competition_id)
      .execute();
  }

  return expiredWars.length;
}

type ClanDb = Kysely<DB> | Transaction<DB>;

async function assertNoClanCooldown(db: ClanDb, userPubkey: string): Promise<void> {
  const cooldown = await db
    .selectFrom('arena_clan_cooldowns')
    .where('user_pubkey', '=', userPubkey)
    .selectAll()
    .executeTakeFirst();

  if (cooldown && new Date(cooldown.cooldown_until) > new Date()) {
    throw new ClanError('CLAN_COOLDOWN_ACTIVE', 'You must wait 7 days after leaving a clan before joining or creating another');
  }
}

async function hasActiveClanWar(db: ClanDb, clanId: string): Promise<boolean> {
  const war = await db
    .selectFrom('arena_clan_wars')
    .where((eb) => eb.or([
      eb('challenger_clan_id', '=', clanId),
      eb('defender_clan_id', '=', clanId),
    ]))
    .where('status', 'in', ['pending', 'active'])
    .select('id')
    .executeTakeFirst();

  return !!war;
}

async function recordClanCooldown(db: ClanDb, userPubkey: string, clanId: string): Promise<void> {
  const cooldownUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db
    .insertInto('arena_clan_cooldowns')
    .values({
      user_pubkey: userPubkey,
      last_clan_id: clanId,
      cooldown_until: cooldownUntil,
    })
    .onConflict((oc) => oc.column('user_pubkey').doUpdateSet({
      last_clan_id: clanId,
      cooldown_until: cooldownUntil,
    }))
    .execute();
}
