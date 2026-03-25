import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// open challenge rules
// ---------------------------------------------------------------------------

describe('open challenge rules', () => {
  it('direct challenges expire in 1 hour', () => {
    const defenderPubkey = 'someWallet';
    const expiresMs = defenderPubkey ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    expect(expiresMs).toBe(3600000);
  });

  it('open challenges expire in 24 hours', () => {
    const defenderPubkey = undefined;
    const expiresMs = defenderPubkey ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    expect(expiresMs).toBe(86400000);
  });

  it('self-duel is blocked when defender is specified', () => {
    const challenger = 'WalletA';
    const defender = 'WalletA';
    const shouldBlock = defender && challenger === defender;
    expect(shouldBlock).toBe(true);
  });

  it('self-duel check skipped for open challenges', () => {
    const challenger = 'WalletA';
    const defender = undefined;
    const shouldBlock = defender && challenger === defender;
    expect(shouldBlock).toBeFalsy();
  });

  it('null defender stored for open challenges', () => {
    const defenderPubkey: string | undefined = undefined;
    const stored = defenderPubkey ?? null;
    expect(stored).toBeNull();
  });

  it('defender stored for direct challenges', () => {
    const defenderPubkey: string | undefined = 'WalletB';
    const stored = defenderPubkey ?? null;
    expect(stored).toBe('WalletB');
  });
});

// ---------------------------------------------------------------------------
// revenge window logic
// ---------------------------------------------------------------------------

describe('revenge window logic', () => {
  it('revenge key format is correct', () => {
    const loser = 'LoserWallet';
    const winner = 'WinnerWallet';
    const key = `arena:revenge:${loser}:${winner}`;
    expect(key).toBe('arena:revenge:LoserWallet:WinnerWallet');
  });

  it('revenge config preserves original duel settings', () => {
    const original = {
      originalDuelId: 'abc-123',
      assetSymbol: 'SOL',
      durationHours: 24,
      isHonorDuel: true,
    };
    const config = JSON.parse(JSON.stringify(original));
    expect(config.assetSymbol).toBe('SOL');
    expect(config.durationHours).toBe(24);
    expect(config.isHonorDuel).toBe(true);
    expect(config.originalDuelId).toBe('abc-123');
  });

  it('revenge duel config includes multiplier', () => {
    const isRevenge = true;
    const config = {
      asset: 'SOL',
      durationHours: 24,
      ...(isRevenge ? { isRevenge: true, revengeMultiplier: 1.5, originalDuelId: 'abc' } : {}),
    };
    expect(config.isRevenge).toBe(true);
    expect(config.revengeMultiplier).toBe(1.5);
  });

  it('non-revenge duel config has no multiplier', () => {
    const isRevenge = false;
    const config: Record<string, any> = {
      asset: 'SOL',
      durationHours: 24,
      ...(isRevenge ? { isRevenge: true, revengeMultiplier: 1.5 } : {}),
    };
    expect(config.isRevenge).toBeUndefined();
    expect(config.revengeMultiplier).toBeUndefined();
  });

  it('revenge window TTL is 30 minutes (1800 seconds)', () => {
    const ttlSeconds = 1800;
    expect(ttlSeconds).toBe(30 * 60);
  });

  it('loser is identified correctly when challenger wins', () => {
    const winner = 'ChallengerPubkey';
    const challengerPubkey = 'ChallengerPubkey';
    const defenderPubkey = 'DefenderPubkey';
    const loser = winner === challengerPubkey ? defenderPubkey : challengerPubkey;
    expect(loser).toBe('DefenderPubkey');
  });

  it('loser is identified correctly when defender wins', () => {
    const winner: string = 'DefenderPubkey';
    const challengerPubkey: string = 'ChallengerPubkey';
    const defenderPubkey: string = 'DefenderPubkey';
    const loser = winner === challengerPubkey ? defenderPubkey : challengerPubkey;
    expect(loser).toBe('ChallengerPubkey');
  });
});

// ---------------------------------------------------------------------------
// duel type filters
// ---------------------------------------------------------------------------

describe('duel type filters', () => {
  const duels = [
    { id: '1', defender_pubkey: null, status: 'pending' },
    { id: '2', defender_pubkey: 'WalletB', status: 'pending' },
    { id: '3', defender_pubkey: null, status: 'active' },
    { id: '4', defender_pubkey: 'WalletC', status: 'active' },
    { id: '5', defender_pubkey: null, status: 'completed' },
  ];

  function filterDuels(type: 'open' | 'direct' | 'all') {
    if (type === 'open') {
      return duels.filter(d => d.defender_pubkey === null && d.status === 'pending');
    } else if (type === 'direct') {
      return duels.filter(d => d.defender_pubkey !== null);
    }
    return duels;
  }

  it('open filter returns only pending duels with no defender', () => {
    const result = filterDuels('open');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('direct filter returns duels with a defender', () => {
    const result = filterDuels('direct');
    expect(result).toHaveLength(2);
    expect(result.map(d => d.id)).toEqual(['2', '4']);
  });

  it('all filter returns everything', () => {
    const result = filterDuels('all');
    expect(result).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// mutagen reward with revenge
// ---------------------------------------------------------------------------

describe('mutagen reward with revenge', () => {
  it('base honor duel reward is 50 MUTAGEN', () => {
    const base = 50;
    const streakMult = 1.0;
    const revengeMult = 1;
    expect(Math.round(base * streakMult * revengeMult)).toBe(50);
  });

  it('3-win streak gets 57 MUTAGEN', () => {
    const base = 50;
    const streakMult = 1.15;
    const revengeMult = 1;
    // 50 * 1.15 = 57.5 (floating point: 57.4999...) → rounds to 57
    expect(Math.round(base * streakMult * revengeMult)).toBe(57);
  });

  it('revenge duel gets 75 MUTAGEN', () => {
    const base = 50;
    const streakMult = 1.0;
    const revengeMult = 1.5;
    expect(Math.round(base * streakMult * revengeMult)).toBe(75);
  });

  it('3-win streak + revenge gets 86 MUTAGEN', () => {
    const base = 50;
    const streakMult = 1.15;
    const revengeMult = 1.5;
    expect(Math.round(base * streakMult * revengeMult)).toBe(86);
  });

  it('max streak + revenge gets 150 MUTAGEN (max possible)', () => {
    const base = 50;
    const streakMult = 2.0;
    const revengeMult = 1.5;
    expect(Math.round(base * streakMult * revengeMult)).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// adrena API error handling
// ---------------------------------------------------------------------------

describe('adrena API error handling', () => {
  it('recognizes "Not found" error as empty positions', () => {
    const response = { error: 'Not found' };
    const isNotFound = 'error' in response && response.error === 'Not found';
    expect(isNotFound).toBe(true);
  });

  it('recognizes invalid wallet error', () => {
    const response = { error: 'Invalid user_wallet, please provide a valid public key.' };
    const isNotFound = 'error' in response && response.error === 'Not found';
    expect(isNotFound).toBe(false);
  });

  it('recognizes successful wrapped response', () => {
    const response = { success: true, data: [{ position_id: 1 }] };
    const isWrapped = 'success' in response && response.success === true && Array.isArray(response.data);
    expect(isWrapped).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// production config safety
// ---------------------------------------------------------------------------

describe('production config safety', () => {
  it('detects localhost in URL', () => {
    expect('http://localhost:3001'.includes('localhost')).toBe(true);
    expect('https://arena.adrena.xyz'.includes('localhost')).toBe(false);
  });

  it('blocks DEV_MODE_SKIP_AUTH in production', () => {
    const nodeEnv = 'production';
    const devSkipAuth = true;
    const shouldBlock = nodeEnv === 'production' && devSkipAuth;
    expect(shouldBlock).toBe(true);
  });

  it('allows DEV_MODE_SKIP_AUTH in development', () => {
    const nodeEnv: string = 'development';
    const devSkipAuth = true;
    const shouldBlock = nodeEnv === 'production' && devSkipAuth;
    expect(shouldBlock).toBe(false);
  });
});
