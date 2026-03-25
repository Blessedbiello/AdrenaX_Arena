import { Kysely, PostgresDialect, sql, type Migration, type MigrationProvider } from 'kysely';
import pg from 'pg';

const { Pool } = pg;

const migrations: Record<string, Migration> = {
  '001_initial': {
    async up(db: Kysely<unknown>) {
      // Seasons
      await db.schema
        .createTable('arena_seasons')
        .addColumn('id', 'serial', col => col.primaryKey())
        .addColumn('name', 'varchar(64)', col => col.notNull())
        .addColumn('start_time', 'timestamptz', col => col.notNull())
        .addColumn('end_time', 'timestamptz', col => col.notNull())
        .addColumn('status', 'varchar(20)', col => col.notNull().defaultTo('upcoming'))
        .execute();

      // Competitions
      await db.schema
        .createTable('arena_competitions')
        .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('mode', 'varchar(20)', col => col.notNull())
        .addColumn('status', 'varchar(24)', col => col.notNull().defaultTo('pending'))
        .addColumn('season_id', 'integer', col => col.references('arena_seasons.id'))
        .addColumn('start_time', 'timestamptz', col => col.notNull())
        .addColumn('end_time', 'timestamptz', col => col.notNull())
        .addColumn('current_round', 'integer', col => col.defaultTo(0))
        .addColumn('total_rounds', 'integer', col => col.defaultTo(1))
        .addColumn('config', 'jsonb', col => col.notNull().defaultTo('{}'))
        .addColumn('created_at', 'timestamptz', col => col.defaultTo(sql`NOW()`))
        .addColumn('updated_at', 'timestamptz', col => col.defaultTo(sql`NOW()`))
        .execute();

      await db.schema.createIndex('idx_comp_status').on('arena_competitions').column('status').execute();
      await db.schema.createIndex('idx_comp_mode').on('arena_competitions').column('mode').execute();

      // Participants
      await db.schema
        .createTable('arena_participants')
        .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('competition_id', 'uuid', col => col.notNull().references('arena_competitions.id'))
        .addColumn('user_pubkey', 'varchar(44)', col => col.notNull())
        .addColumn('team_id', 'uuid')
        .addColumn('status', 'varchar(20)', col => col.notNull().defaultTo('active'))
        .addColumn('eliminated_round', 'integer')
        .addColumn('pnl_usd', sql`numeric(20,6)`, col => col.defaultTo(0))
        .addColumn('roi_percent', sql`numeric(10,4)`, col => col.defaultTo(0))
        .addColumn('total_volume_usd', sql`numeric(20,6)`, col => col.defaultTo(0))
        .addColumn('positions_closed', 'integer', col => col.defaultTo(0))
        .addColumn('win_rate', sql`numeric(6,4)`, col => col.defaultTo(0))
        .addColumn('arena_score', sql`numeric(12,4)`, col => col.defaultTo(0))
        .addColumn('last_indexed_at', 'timestamptz')
        .addColumn('cursor_position_id', 'integer')
        .addColumn('created_at', 'timestamptz', col => col.defaultTo(sql`NOW()`))
        .addColumn('updated_at', 'timestamptz', col => col.defaultTo(sql`NOW()`))
        .execute();

      await sql`ALTER TABLE arena_participants ADD CONSTRAINT uq_part_comp_user UNIQUE(competition_id, user_pubkey)`.execute(db);
      await db.schema.createIndex('idx_part_comp').on('arena_participants').column('competition_id').execute();
      await db.schema.createIndex('idx_part_user').on('arena_participants').column('user_pubkey').execute();
      await db.schema.createIndex('idx_part_status').on('arena_participants').column('status').execute();

      // Trades
      await db.schema
        .createTable('arena_trades')
        .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('competition_id', 'uuid', col => col.notNull().references('arena_competitions.id'))
        .addColumn('user_pubkey', 'varchar(44)', col => col.notNull())
        .addColumn('position_id', 'integer', col => col.notNull())
        .addColumn('symbol', 'varchar(16)', col => col.notNull())
        .addColumn('side', 'varchar(5)', col => col.notNull())
        .addColumn('entry_price', sql`numeric(20,10)`)
        .addColumn('exit_price', sql`numeric(20,10)`)
        .addColumn('entry_size', sql`numeric(20,6)`)
        .addColumn('collateral_usd', sql`numeric(20,6)`)
        .addColumn('pnl_usd', sql`numeric(20,6)`)
        .addColumn('fees_usd', sql`numeric(20,6)`)
        .addColumn('entry_date', 'timestamptz')
        .addColumn('exit_date', 'timestamptz')
        .addColumn('is_liquidated', 'boolean', col => col.defaultTo(false))
        .execute();

      await sql`ALTER TABLE arena_trades ADD CONSTRAINT uq_trades_comp_pos UNIQUE(competition_id, position_id)`.execute(db);
      await db.schema.createIndex('idx_trades_comp_user').on('arena_trades').columns(['competition_id', 'user_pubkey']).execute();

      // Duels
      await db.schema
        .createTable('arena_duels')
        .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('competition_id', 'uuid', col => col.notNull().references('arena_competitions.id'))
        .addColumn('challenger_pubkey', 'varchar(44)', col => col.notNull())
        .addColumn('defender_pubkey', 'varchar(44)')
        .addColumn('asset_symbol', 'varchar(16)', col => col.notNull())
        .addColumn('stake_amount', sql`numeric(20,6)`, col => col.defaultTo(0))
        .addColumn('stake_token', 'varchar(10)', col => col.defaultTo('ADX'))
        .addColumn('is_honor_duel', 'boolean', col => col.defaultTo(false))
        .addColumn('duration_hours', 'integer', col => col.notNull())
        .addColumn('status', 'varchar(20)', col => col.notNull().defaultTo('pending'))
        .addColumn('winner_pubkey', 'varchar(44)')
        .addColumn('challenger_roi', sql`numeric(10,4)`)
        .addColumn('defender_roi', sql`numeric(10,4)`)
        .addColumn('escrow_tx', 'varchar(88)')
        .addColumn('settlement_tx', 'varchar(88)')
        .addColumn('challenge_card_url', 'text')
        .addColumn('accepted_at', 'timestamptz')
        .addColumn('expires_at', 'timestamptz', col => col.notNull())
        .addColumn('created_at', 'timestamptz', col => col.defaultTo(sql`NOW()`))
        .execute();

      await db.schema.createIndex('idx_duels_status').on('arena_duels').column('status').execute();
      await db.schema.createIndex('idx_duels_challenger').on('arena_duels').column('challenger_pubkey').execute();
      await db.schema.createIndex('idx_duels_defender').on('arena_duels').column('defender_pubkey').execute();

      // Predictions
      await db.schema
        .createTable('arena_predictions')
        .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('duel_id', 'uuid', col => col.notNull().references('arena_duels.id'))
        .addColumn('predictor_pubkey', 'varchar(44)', col => col.notNull())
        .addColumn('predicted_winner', 'varchar(44)', col => col.notNull())
        .addColumn('prediction_locked_at', 'timestamptz', col => col.notNull().defaultTo(sql`NOW()`))
        .addColumn('is_correct', 'boolean')
        .addColumn('mutagen_reward', sql`numeric(20,6)`, col => col.defaultTo(0))
        .execute();

      await sql`ALTER TABLE arena_predictions ADD CONSTRAINT uq_pred_duel_user UNIQUE(duel_id, predictor_pubkey)`.execute(db);

      // Round Snapshots
      await db.schema
        .createTable('arena_round_snapshots')
        .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('competition_id', 'uuid', col => col.notNull().references('arena_competitions.id'))
        .addColumn('round_number', 'integer', col => col.notNull())
        .addColumn('snapshot_time', 'timestamptz', col => col.notNull().defaultTo(sql`NOW()`))
        .addColumn('participant_scores', 'jsonb', col => col.notNull())
        .addColumn('eliminated_pubkeys', sql`TEXT[]`, col => col.notNull().defaultTo(sql`'{}'`))
        .execute();

      await sql`ALTER TABLE arena_round_snapshots ADD CONSTRAINT uq_snap_comp_round UNIQUE(competition_id, round_number)`.execute(db);

      // Rewards
      await db.schema
        .createTable('arena_rewards')
        .addColumn('id', 'serial', col => col.primaryKey())
        .addColumn('competition_id', 'uuid', col => col.references('arena_competitions.id'))
        .addColumn('user_pubkey', 'varchar(44)', col => col.notNull())
        .addColumn('amount', sql`numeric(20,6)`, col => col.notNull())
        .addColumn('token', 'varchar(10)', col => col.notNull().defaultTo('ADX'))
        .addColumn('reward_type', 'varchar(20)', col => col.notNull())
        .addColumn('tx_signature', 'varchar(88)', col => col.unique())
        .addColumn('created_at', 'timestamptz', col => col.defaultTo(sql`NOW()`))
        .execute();

      await db.schema.createIndex('idx_rewards_unprocessed').on('arena_rewards').column('tx_signature').where(sql.ref('tx_signature'), 'is', null).execute();

      // Season Points
      await db.schema
        .createTable('arena_season_points')
        .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('season_id', 'integer', col => col.notNull().references('arena_seasons.id'))
        .addColumn('user_pubkey', 'varchar(44)', col => col.notNull())
        .addColumn('total_points', 'integer', col => col.defaultTo(0))
        .addColumn('gauntlet_points', 'integer', col => col.defaultTo(0))
        .addColumn('duel_points', 'integer', col => col.defaultTo(0))
        .addColumn('clan_points', 'integer', col => col.defaultTo(0))
        .execute();

      await sql`ALTER TABLE arena_season_points ADD CONSTRAINT uq_season_user UNIQUE(season_id, user_pubkey)`.execute(db);
    },

    async down(db: Kysely<unknown>) {
      const tables = [
        'arena_season_points', 'arena_rewards', 'arena_round_snapshots',
        'arena_predictions', 'arena_duels', 'arena_trades',
        'arena_participants', 'arena_competitions', 'arena_seasons'
      ];
      for (const table of tables) {
        await db.schema.dropTable(table).ifExists().execute();
      }
    },
  },

  '002_user_stats': {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable('arena_user_stats')
        .addColumn('user_pubkey', 'varchar(44)', col => col.primaryKey())
        .addColumn('current_streak', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('best_streak', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('streak_type', 'varchar(4)', col => col.notNull().defaultTo('none'))
        .addColumn('total_wins', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('total_losses', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('title', 'varchar(24)')
        .addColumn('mutagen_multiplier', sql`numeric(4,2)`, col => col.notNull().defaultTo(1.0))
        .addColumn('updated_at', 'timestamptz', col => col.defaultTo(sql`NOW()`))
        .execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable('arena_user_stats').ifExists().execute();
    },
  },

  '003_clans': {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable('arena_clans')
        .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('name', 'varchar(32)', col => col.notNull().unique())
        .addColumn('tag', 'varchar(5)', col => col.notNull().unique())
        .addColumn('leader_pubkey', 'varchar(44)', col => col.notNull())
        .addColumn('member_count', 'integer', col => col.notNull().defaultTo(1))
        .addColumn('total_war_score', sql`numeric(12,4)`, col => col.notNull().defaultTo(0))
        .addColumn('wars_won', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('wars_played', 'integer', col => col.notNull().defaultTo(0))
        .addColumn('created_at', 'timestamptz', col => col.defaultTo(sql`NOW()`))
        .execute();

      await db.schema
        .createTable('arena_clan_members')
        .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('clan_id', 'uuid', col => col.notNull().references('arena_clans.id'))
        .addColumn('user_pubkey', 'varchar(44)', col => col.notNull().unique())
        .addColumn('role', 'varchar(10)', col => col.notNull().defaultTo('member'))
        .addColumn('joined_at', 'timestamptz', col => col.defaultTo(sql`NOW()`))
        .addColumn('cooldown_until', 'timestamptz')
        .execute();

      await db.schema.createIndex('idx_clan_members_clan').on('arena_clan_members').column('clan_id').execute();
      await db.schema.createIndex('idx_clan_members_user').on('arena_clan_members').column('user_pubkey').execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable('arena_clan_members').ifExists().execute();
      await db.schema.dropTable('arena_clans').ifExists().execute();
    },
  },
};

class InlineMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return migrations;
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://arena:arena_dev@localhost:5432/adrenax_arena';

  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: databaseUrl }),
    }),
  });

  const { Migrator } = await import('kysely');
  const migrator = new Migrator({
    db,
    provider: new InlineMigrationProvider(),
  });

  console.log('Running migrations...');
  const { error, results } = await migrator.migrateToLatest();

  results?.forEach(r => {
    if (r.status === 'Success') {
      console.log(`  ✓ ${r.migrationName}`);
    } else if (r.status === 'Error') {
      console.error(`  ✗ ${r.migrationName}`);
    }
  });

  if (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }

  console.log('Migrations complete.');
  await db.destroy();
}

main();
