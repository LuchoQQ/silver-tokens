export interface CacheRateResult {
  rate7d: number;
  rate30d: number;
  rate90d: number;
}

export function computeCacheRate(events: Array<{ cacheRead: number; inputTokens: number; cacheCreation: number }>): CacheRateResult {
  const windows = [7, 30, 90] as const;
  const result: CacheRateResult = { rate7d: 0, rate30d: 0, rate90d: 0 };

  for (const days of windows) {
    const key = `rate${days}d` as keyof CacheRateResult;
    const total = events.reduce((sum, e) => sum + e.cacheRead + e.inputTokens + e.cacheCreation, 0);
    const cacheRead = events.reduce((sum, e) => sum + e.cacheRead, 0);
    result[key] = total > 0 ? cacheRead / total : 0;
  }

  return result;
}
