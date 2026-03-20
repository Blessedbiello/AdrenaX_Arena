import { z } from 'zod';

// ── Zod schemas for Adrena API responses ──

export const AdrenaPositionSchema = z.object({
  position_id: z.number(),
  user_wallet: z.string(),
  symbol: z.string(),
  side: z.enum(['long', 'short']),
  status: z.enum(['open', 'close', 'liquidated']).default('open'),
  entry_price: z.number().nullable().optional(),
  exit_price: z.number().nullable().optional(),
  size: z.number().nullable().optional(),
  collateral_amount: z.number().nullable().optional(),
  collateral_usd: z.number().nullable().optional(),
  pnl: z.number().nullable().optional(),
  fees: z.number().nullable().optional(),
  entry_date: z.string().nullable().optional(),
  exit_date: z.string().nullable().optional(),
  is_liquidated: z.boolean().optional().default(false),
});

export type AdrenaPosition = z.infer<typeof AdrenaPositionSchema>;

const AdrenaResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().nullable().optional(),
  data: z.unknown(),
});

const PositionListSchema = z.object({
  success: z.boolean(),
  data: z.array(AdrenaPositionSchema),
});

const PoolStatsSchema = z.object({
  success: z.boolean(),
  data: z.object({
    daily_volume_usd: z.number().optional(),
    total_volume_usd: z.number().optional(),
  }).passthrough(),
});

// ── Circuit Breaker ──

class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private readonly maxFailures: number;
  private readonly resetMs: number;

  constructor(maxFailures = 5, resetMs = 60_000) {
    this.maxFailures = maxFailures;
    this.resetMs = resetMs;
  }

  isOpen(): boolean {
    if (this.failures < this.maxFailures) return false;
    if (Date.now() - this.lastFailure > this.resetMs) {
      this.reset();
      return false;
    }
    return true;
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
  }

  reset(): void {
    this.failures = 0;
  }
}

// ── Rate Limiter (Token Bucket) ──

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms

  constructor(maxPerSecond = 20) {
    this.maxTokens = maxPerSecond;
    this.tokens = maxPerSecond;
    this.refillRate = maxPerSecond / 1000;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    // Wait for a token
    const waitMs = (1 - this.tokens) / this.refillRate;
    await new Promise(resolve => setTimeout(resolve, Math.ceil(waitMs)));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

// ── Retry with exponential backoff ──

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number } = {}
): Promise<T> {
  const { retries = 3, baseMs = 1000 } = opts;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        const delay = baseMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

// ── Adrena Client ──

export class AdrenaClient {
  private readonly baseUrl: string;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimiter: RateLimiter;
  private readonly timeoutMs: number;

  constructor(opts: {
    baseUrl?: string;
    maxConcurrency?: number;
    maxPerSecond?: number;
    timeoutMs?: number;
  } = {}) {
    this.baseUrl = opts.baseUrl ?? 'https://datapi.adrena.trade';
    this.circuitBreaker = new CircuitBreaker(5, 60_000);
    this.rateLimiter = new RateLimiter(opts.maxPerSecond ?? 20);
    this.timeoutMs = opts.timeoutMs ?? 8000;
  }

  private async fetch<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    if (this.circuitBreaker.isOpen()) {
      throw new Error(`Circuit breaker open — Adrena API unavailable (pausing 60s)`);
    }

    await this.rateLimiter.acquire();

    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await globalThis.fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Adrena API ${response.status}: ${response.statusText} for ${path}`);
      }

      const json = await response.json();
      const parsed = schema.parse(json);
      this.circuitBreaker.reset();
      return parsed;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetch positions for a wallet. Returns all positions (open + closed).
   * Use status filter in caller to separate.
   */
  async fetchPositions(
    wallet: string,
    opts: { limit?: number; status?: 'open' | 'close' | 'liquidated' } = {}
  ): Promise<AdrenaPosition[]> {
    const params = new URLSearchParams({ user_wallet: wallet });
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.status) params.set('status', opts.status);

    return withRetry(
      () => this.fetch(`/position?${params}`, PositionListSchema).then(r => r.data),
      { retries: 3, baseMs: 1000 }
    );
  }

  /**
   * Fetch closed positions for a wallet within a time window.
   * Filters client-side since API may not support time range queries.
   */
  async fetchClosedPositionsInWindow(
    wallet: string,
    startTime: Date,
    endTime: Date
  ): Promise<AdrenaPosition[]> {
    const positions = await this.fetchPositions(wallet, { status: 'close' });

    return positions.filter(p => {
      if (!p.entry_date || !p.exit_date) return false;
      const entry = new Date(p.entry_date);
      const exit = new Date(p.exit_date);
      // Both entry AND exit must be within the competition window
      return entry >= startTime && exit <= endTime;
    });
  }

  /**
   * Fetch pool high-level stats (volume, TVL).
   */
  async fetchPoolStats(): Promise<z.infer<typeof PoolStatsSchema>['data']> {
    return withRetry(
      () => this.fetch('/pool-high-level-stats', PoolStatsSchema).then(r => r.data),
      { retries: 2, baseMs: 2000 }
    );
  }

  /**
   * Count closed positions for a wallet (for eligibility checks).
   */
  async countClosedPositions(wallet: string): Promise<number> {
    const positions = await this.fetchPositions(wallet, { status: 'close' });
    return positions.length;
  }

  /**
   * Check if the API is healthy.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.fetch('/pool-high-level-stats', PoolStatsSchema);
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton for app-wide use
let _client: AdrenaClient | undefined;

export function getAdrenaClient(opts?: ConstructorParameters<typeof AdrenaClient>[0]): AdrenaClient {
  if (!_client) {
    _client = new AdrenaClient(opts);
  }
  return _client;
}
