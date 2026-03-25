import type { Request, Response, NextFunction } from 'express';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { randomBytes } from 'crypto';
import { Redis } from 'ioredis';
import { env } from '../config.js';
import { getDb } from '../db/connection.js';

const NONCE_PREFIX = 'arena:nonce:';
const NONCE_TTL_SECONDS = 300; // 5 minutes

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    redis.connect().catch((err: Error) => {
      console.warn('[Auth] Redis connection failed, falling back to in-memory nonces:', err.message);
      redis = null;
    });
  }
  return redis;
}

// In-memory fallback for when Redis is unavailable (dev/testing)
const memoryNonces = new Map<string, { nonce: string; expires: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of memoryNonces) {
    if (val.expires < now) memoryNonces.delete(key);
  }
}, 60_000);

/**
 * Generate a nonce for wallet authentication.
 * Stored in Redis with 5-minute TTL for atomic get-and-delete.
 */
export async function generateNonce(wallet: string): Promise<string> {
  const nonce = randomBytes(32).toString('hex');

  try {
    const r = getRedis();
    if (r.status === 'ready') {
      await r.set(`${NONCE_PREFIX}${wallet}`, nonce, 'EX', NONCE_TTL_SECONDS);
      return nonce;
    }
  } catch {}

  // Fallback to in-memory
  memoryNonces.set(wallet, {
    nonce,
    expires: Date.now() + NONCE_TTL_SECONDS * 1000,
  });
  return nonce;
}

/**
 * Verify and consume a nonce atomically.
 * Returns the stored nonce if valid, null if invalid/expired.
 */
async function verifyAndConsumeNonce(wallet: string, nonce: string): Promise<boolean> {
  try {
    const r = getRedis();
    if (r.status === 'ready') {
      // Atomic get-and-delete via Lua script
      const script = `
        local val = redis.call('GET', KEYS[1])
        if val == ARGV[1] then
          redis.call('DEL', KEYS[1])
          return 1
        end
        return 0
      `;
      const result = await r.eval(script, 1, `${NONCE_PREFIX}${wallet}`, nonce);
      return result === 1;
    }
  } catch {}

  // Fallback to in-memory
  const stored = memoryNonces.get(wallet);
  if (stored && stored.nonce === nonce && stored.expires >= Date.now()) {
    memoryNonces.delete(wallet);
    return true;
  }
  return false;
}

/**
 * Verify a wallet signature against a nonce message.
 */
export function verifyWalletSignature(
  wallet: string,
  signature: string,
  message: string
): boolean {
  try {
    const publicKey = bs58.decode(wallet);
    const sig = bs58.decode(signature);
    const msgBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(msgBytes, sig, publicKey);
  } catch {
    return false;
  }
}

/**
 * Express middleware that requires wallet signature authentication.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const wallet = req.headers['x-wallet'] as string | undefined;
  const signature = req.headers['x-signature'] as string | undefined;
  const nonce = req.headers['x-nonce'] as string | undefined;

  if (!wallet || !signature || !nonce) {
    res.status(401).json({ error: 'Missing authentication headers (x-wallet, x-signature, x-nonce)' });
    return;
  }

  // Dev mode: skip signature verification for testing
  if (env.DEV_MODE_SKIP_AUTH && env.NODE_ENV !== 'production') {
    console.warn(`[Auth] DEV_MODE: Bypassing signature verification for ${wallet}`);
    (req as any).wallet = wallet;
    next();
    return;
  }

  // Async nonce verification
  verifyAndConsumeNonce(wallet, nonce).then(async valid => {
    if (!valid) {
      res.status(401).json({ error: 'Invalid or expired nonce' });
      return;
    }

    const message = `AdrenaX Arena Authentication\nNonce: ${nonce}`;
    if (!verifyWalletSignature(wallet, signature, message)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const bannedUser = await getDb()
      .selectFrom('arena_user_stats')
      .where('user_pubkey', '=', wallet)
      .where('banned_at', 'is not', null)
      .select('user_pubkey')
      .executeTakeFirst();

    if (bannedUser) {
      res.status(403).json({ error: 'Wallet is banned from Arena competitions' });
      return;
    }

    (req as any).wallet = wallet;
    next();
  }).catch(() => {
    res.status(500).json({ error: 'Authentication service error' });
  });
}

/**
 * Optional auth — attaches wallet if present, doesn't block if absent.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const wallet = req.headers['x-wallet'] as string | undefined;
  const signature = req.headers['x-signature'] as string | undefined;
  const nonce = req.headers['x-nonce'] as string | undefined;

  if (wallet && signature && nonce) {
    // Dev mode bypass
    if (env.DEV_MODE_SKIP_AUTH && env.NODE_ENV !== 'production') {
      (req as any).wallet = wallet;
      next();
      return;
    }

    verifyAndConsumeNonce(wallet, nonce).then(valid => {
      if (valid) {
        const message = `AdrenaX Arena Authentication\nNonce: ${nonce}`;
        if (verifyWalletSignature(wallet, signature, message)) {
          (req as any).wallet = wallet;
        }
      }
      next();
    }).catch(() => next());
  } else {
    next();
  }
}

export async function closeAuthRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
