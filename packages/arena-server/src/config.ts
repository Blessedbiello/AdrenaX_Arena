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
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
