// Cache invalidation utilities

import {
  CACHE_NEWS_HOURS,
  CACHE_FUNDAMENTALS_HOURS,
  CACHE_CATALYSTS_HOURS,
} from '@/lib/config/constants';

export type CacheType = 'news' | 'fundamentals' | 'catalysts';

const CACHE_DURATIONS: Record<CacheType, number> = {
  news: CACHE_NEWS_HOURS,
  fundamentals: CACHE_FUNDAMENTALS_HOURS,
  catalysts: CACHE_CATALYSTS_HOURS,
};

export function isCacheStale(fetchedAt: string, cacheType: CacheType): boolean {
  const hours = CACHE_DURATIONS[cacheType];
  const fetchedTime = new Date(fetchedAt).getTime();
  const expiryTime = fetchedTime + hours * 60 * 60 * 1000;
  return Date.now() > expiryTime;
}

export function cacheExpiresAt(fetchedAt: string, cacheType: CacheType): Date {
  const hours = CACHE_DURATIONS[cacheType];
  const fetchedTime = new Date(fetchedAt).getTime();
  return new Date(fetchedTime + hours * 60 * 60 * 1000);
}
