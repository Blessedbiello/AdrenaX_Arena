import { Redis } from 'ioredis';
import { env } from '../config.js';

let _sharedRedis: Redis | null = null;

export function getSharedRedis(): Redis {
  if (!_sharedRedis) {
    _sharedRedis = new Redis(env.REDIS_URL);
  }
  return _sharedRedis;
}

export async function closeSharedRedis(): Promise<void> {
  if (_sharedRedis) {
    await _sharedRedis.quit();
    _sharedRedis = null;
  }
}

export function hashToInt(namespace: string, str: string): number {
  const input = `${namespace}:${str}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
