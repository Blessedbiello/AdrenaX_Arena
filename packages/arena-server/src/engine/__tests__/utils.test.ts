import { describe, it, expect } from 'vitest';
import { hashToInt } from '../utils.js';

describe('hashToInt', () => {
  it('returns a positive integer', () => {
    expect(hashToInt('duel', 'abc-123')).toBeGreaterThanOrEqual(0);
  });

  it('different namespaces produce different hashes for same input', () => {
    expect(hashToInt('duel', 'same-id')).not.toBe(hashToInt('gauntlet', 'same-id'));
  });

  it('is deterministic', () => {
    expect(hashToInt('duel', 'test')).toBe(hashToInt('duel', 'test'));
  });

  it('handles empty string', () => {
    expect(hashToInt('ns', '')).toBeGreaterThanOrEqual(0);
  });
});
