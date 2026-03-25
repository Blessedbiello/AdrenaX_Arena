import { sql } from 'kysely';
import { getDb } from '../db/connection.js';
import type { Clan, ClanMember } from '../db/types.js';

export class ClanError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = 'ClanError';
  }
}

export async function createClan(name: string, tag: string, leaderPubkey: string): Promise<Clan> {
  const db = getDb();

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
      return { disbanded: true };
    }

    // Regular member leaves
    await trx.deleteFrom('arena_clan_members').where('id', '=', membership.id).execute();
    await trx
      .updateTable('arena_clans')
      .set({ member_count: sql`member_count - 1` })
      .where('id', '=', membership.clan_id)
      .execute();

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
 * Synergy bonus: +5% per member beyond 1 (so 5 members = +20%).
 */
export function calculateClanScore(memberScores: number[]): number {
  if (memberScores.length === 0) return 0;
  const avg = memberScores.reduce((a, b) => a + b, 0) / memberScores.length;
  const synergyBonus = 1 + 0.05 * (memberScores.length - 1);
  return avg * synergyBonus;
}
