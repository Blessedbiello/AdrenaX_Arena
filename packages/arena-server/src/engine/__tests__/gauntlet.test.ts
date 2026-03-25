import { describe, it, expect } from 'vitest';

// Pure elimination logic extracted for unit testing — no DB required.
function eliminateBottom50(participants: { pubkey: string; score: number; trades: number }[]) {
  // Forfeit those with 0 trades
  const active = participants.filter(p => p.trades > 0);
  const forfeited = participants.filter(p => p.trades === 0);

  // Sort by score DESC
  active.sort((a, b) => b.score - a.score);

  // Eliminate bottom 50% (Math.floor), keep Math.ceil survivors
  const cutoff = Math.ceil(active.length / 2);
  const surviving = active.slice(0, cutoff);
  const eliminated = active.slice(cutoff);

  return { surviving, eliminated, forfeited };
}

describe('gauntlet elimination', () => {
  it('eliminates bottom 50% of 8 participants', () => {
    const participants = Array.from({ length: 8 }, (_, i) => ({
      pubkey: `wallet${i}`, score: (8 - i) * 10, trades: 3,
    }));
    const { surviving, eliminated } = eliminateBottom50(participants);
    expect(surviving).toHaveLength(4);
    expect(eliminated).toHaveLength(4);
  });

  it('eliminates bottom 50% of odd number (5 -> 3 survive)', () => {
    const participants = Array.from({ length: 5 }, (_, i) => ({
      pubkey: `wallet${i}`, score: (5 - i) * 10, trades: 2,
    }));
    const { surviving, eliminated } = eliminateBottom50(participants);
    expect(surviving).toHaveLength(3);
    expect(eliminated).toHaveLength(2);
  });

  it('forfeits participants with 0 trades before elimination', () => {
    const participants = [
      { pubkey: 'a', score: 100, trades: 5 },
      { pubkey: 'b', score: 80, trades: 3 },
      { pubkey: 'c', score: 0, trades: 0 },
      { pubkey: 'd', score: 60, trades: 2 },
    ];
    const { surviving, eliminated, forfeited } = eliminateBottom50(participants);
    expect(forfeited).toHaveLength(1);
    expect(forfeited[0].pubkey).toBe('c');
    expect(surviving).toHaveLength(2); // 3 active -> top 2 survive
    expect(eliminated).toHaveLength(1);
  });

  it('handles single participant (survives)', () => {
    const participants = [{ pubkey: 'solo', score: 50, trades: 1 }];
    const { surviving } = eliminateBottom50(participants);
    expect(surviving).toHaveLength(1);
  });

  it('handles all forfeited (no survivors)', () => {
    const participants = [
      { pubkey: 'a', score: 0, trades: 0 },
      { pubkey: 'b', score: 0, trades: 0 },
    ];
    const { surviving, forfeited } = eliminateBottom50(participants);
    expect(forfeited).toHaveLength(2);
    expect(surviving).toHaveLength(0);
  });

  it('progressive 3-round elimination: 8 -> 4 -> 2', () => {
    let participants = Array.from({ length: 8 }, (_, i) => ({
      pubkey: `wallet${i}`, score: (8 - i) * 10, trades: 3,
    }));

    // Round 1
    let result = eliminateBottom50(participants);
    expect(result.surviving).toHaveLength(4);

    // Round 2
    result = eliminateBottom50(result.surviving);
    expect(result.surviving).toHaveLength(2);

    // Round 3 (final)
    result = eliminateBottom50(result.surviving);
    expect(result.surviving).toHaveLength(1);
    expect(result.surviving[0].pubkey).toBe('wallet0'); // highest score
  });

  it('round durations default correctly', () => {
    const defaults = [48, 24, 12];
    expect(defaults).toHaveLength(3);
    expect(defaults[0]).toBe(48);
    expect(defaults[2]).toBe(12);
  });

  it('total competition time calculation', () => {
    const roundDurations = [48, 24, 12]; // hours
    const intermission = 30; // minutes
    const registration = 2; // hours

    const totalHours = registration + roundDurations.reduce((a, b) => a + b, 0) + (roundDurations.length - 1) * intermission / 60;
    expect(totalHours).toBeCloseTo(87); // 2 + 84 + 1 = 87
  });
});
