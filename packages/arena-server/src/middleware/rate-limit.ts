import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'RATE_LIMIT', message: 'Too many requests' },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => {
    return (req.headers['x-wallet'] as string) || req.ip || 'unknown';
  },
  message: { success: false, error: 'RATE_LIMIT', message: 'Too many authenticated requests' },
});

export const sseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: 'RATE_LIMIT', message: 'Too many stream connections' },
});

export const revengeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // Max 3 revenge duels per 5 minutes
  keyGenerator: (req) => {
    return (req.headers['x-wallet'] as string) || req.ip || 'unknown';
  },
  message: { success: false, error: 'RATE_LIMIT', message: 'Too many revenge attempts' },
});
