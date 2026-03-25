import type { Request, Response, NextFunction } from 'express';
import { env } from '../config.js';

/**
 * Admin authentication middleware.
 * Accepts either:
 * - x-admin-key header matching ADMIN_API_KEY env var
 * - Verified wallet (req.wallet set by requireAuth) that is in ADMIN_WALLETS list
 *
 * IMPORTANT: For wallet-based admin auth, requireAuth must run first to verify
 * the signature. The raw x-wallet header is NOT trusted — only req.wallet
 * (set after signature verification) is checked.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // Option 1: API key auth
  const adminKey = req.headers['x-admin-key'] as string | undefined;
  if (env.ADMIN_API_KEY && adminKey === env.ADMIN_API_KEY) {
    next();
    return;
  }

  // Option 2: Wallet-based auth (only if signature was verified by requireAuth)
  // req.wallet is set by requireAuth middleware after ed25519 signature verification
  const verifiedWallet = (req as any).wallet as string | undefined;
  if (verifiedWallet && env.ADMIN_WALLETS) {
    const adminWallets = env.ADMIN_WALLETS.split(',').map(w => w.trim());
    if (adminWallets.includes(verifiedWallet)) {
      next();
      return;
    }
  }

  res.status(403).json({ success: false, error: 'ADMIN_REQUIRED', message: 'Admin access required' });
}
