import type { Request, Response, NextFunction } from 'express';
import { env } from '../config.js';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminKey = req.headers['x-admin-key'] as string | undefined;

  if (env.ADMIN_API_KEY && adminKey === env.ADMIN_API_KEY) {
    next();
    return;
  }

  // Also check wallet-based admin auth
  const wallet = req.headers['x-wallet'] as string | undefined;
  if (wallet && env.ADMIN_WALLETS) {
    const adminWallets = env.ADMIN_WALLETS.split(',').map(w => w.trim());
    if (adminWallets.includes(wallet)) {
      next();
      return;
    }
  }

  res.status(403).json({ success: false, error: 'ADMIN_REQUIRED', message: 'Admin access required' });
}
