import type { Request, Response, NextFunction } from 'express';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { randomBytes } from 'crypto';

// In-memory nonce store (should be Redis in production)
const nonceStore = new Map<string, { nonce: string; expires: number }>();

// Clean expired nonces periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of nonceStore) {
    if (val.expires < now) nonceStore.delete(key);
  }
}, 60_000);

/**
 * Generate a nonce for wallet authentication.
 */
export function generateNonce(wallet: string): string {
  const nonce = randomBytes(32).toString('hex');
  nonceStore.set(wallet, {
    nonce,
    expires: Date.now() + 5 * 60 * 1000, // 5 minutes
  });
  return nonce;
}

/**
 * Verify a wallet signature against a stored nonce.
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
 * Expects headers:
 *   x-wallet: <base58 public key>
 *   x-signature: <base58 signature>
 *   x-nonce: <nonce string>
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const wallet = req.headers['x-wallet'] as string | undefined;
  const signature = req.headers['x-signature'] as string | undefined;
  const nonce = req.headers['x-nonce'] as string | undefined;

  if (!wallet || !signature || !nonce) {
    res.status(401).json({ error: 'Missing authentication headers (x-wallet, x-signature, x-nonce)' });
    return;
  }

  // Verify nonce exists and hasn't expired
  const stored = nonceStore.get(wallet);
  if (!stored || stored.nonce !== nonce || stored.expires < Date.now()) {
    res.status(401).json({ error: 'Invalid or expired nonce' });
    return;
  }

  // Verify signature
  const message = `AdrenaX Arena Authentication\nNonce: ${nonce}`;
  if (!verifyWalletSignature(wallet, signature, message)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Consume nonce (one-time use)
  nonceStore.delete(wallet);

  // Attach wallet to request
  (req as any).wallet = wallet;
  next();
}

/**
 * Optional auth — attaches wallet if present, doesn't block if absent.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const wallet = req.headers['x-wallet'] as string | undefined;
  const signature = req.headers['x-signature'] as string | undefined;
  const nonce = req.headers['x-nonce'] as string | undefined;

  if (wallet && signature && nonce) {
    const stored = nonceStore.get(wallet);
    if (stored && stored.nonce === nonce && stored.expires >= Date.now()) {
      const message = `AdrenaX Arena Authentication\nNonce: ${nonce}`;
      if (verifyWalletSignature(wallet, signature, message)) {
        nonceStore.delete(wallet);
        (req as any).wallet = wallet;
      }
    }
  }

  next();
}
