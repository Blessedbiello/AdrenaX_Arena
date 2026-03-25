import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default('postgresql://arena:arena_dev@localhost:5432/adrenax_arena'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ADRENA_API_BASE: z.string().default('https://datapi.adrena.trade'),
  DEV_MODE_SKIP_AUTH: z.coerce.boolean().default(false),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_CHANNEL_ID: z.string().optional(),
  CHALLENGE_CARD_BASE_URL: z.string().default('http://localhost:3001'),
  CORS_ORIGIN: z.string().default('http://localhost:3001'),
  SOLANA_RPC_URL: z.string().default('http://localhost:8899'),
  PROGRAM_ID: z.string().optional(),
  ESCROW_CONFIG_PDA: z.string().optional(),
  TREASURY_PUBKEY: z.string().optional(),
  OPERATOR_KEYPAIR_PATH: z.string().optional(),
  ADX_MINT: z.string().optional(),
  USDC_MINT: z.string().optional(),
  ADMIN_API_KEY: z.string().optional(),
  ADMIN_WALLETS: z.string().optional(),
  ADRENA_MUTAGEN_API_URL: z.string().optional(),
  ADRENA_QUEST_WEBHOOK_URL: z.string().optional(),
  ADRENA_LEADERBOARD_API_URL: z.string().optional(),
  ENABLE_SYBIL_CHECKS: z.coerce.boolean().default(false),
  MIN_WALLET_AGE_DAYS: z.coerce.number().default(7),
  MIN_CLOSED_POSITIONS: z.coerce.number().default(3),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);

// Production safety checks
if (env.NODE_ENV === 'production') {
  if (env.CHALLENGE_CARD_BASE_URL.includes('localhost')) {
    console.warn('[Config] WARNING: CHALLENGE_CARD_BASE_URL contains "localhost" — challenge cards will not work on public URLs');
  }
  if (env.CORS_ORIGIN.includes('localhost')) {
    console.warn('[Config] WARNING: CORS_ORIGIN contains "localhost" — frontend will be blocked by CORS in production');
  }
  if (env.DEV_MODE_SKIP_AUTH) {
    console.error('[Config] CRITICAL: DEV_MODE_SKIP_AUTH is enabled in production — this is a security risk!');
    process.exit(1);
  }
  if (env.PROGRAM_ID) {
    const missing = [
      !env.TREASURY_PUBKEY ? 'TREASURY_PUBKEY' : null,
      !env.OPERATOR_KEYPAIR_PATH ? 'OPERATOR_KEYPAIR_PATH' : null,
      !env.ADX_MINT ? 'ADX_MINT' : null,
      !env.USDC_MINT ? 'USDC_MINT' : null,
    ].filter(Boolean);

    if (missing.length > 0) {
      console.error(`[Config] CRITICAL: Escrow is enabled but required settings are missing: ${missing.join(', ')}`);
      process.exit(1);
    }
  }
}
