export interface CacheRateResult {
  rate7d: number;
  rate30d: number;
  rate90d: number;
  rateAll: number;
}

interface CacheRateEvent {
  cacheRead: number;
  inputTokens: number;
  cacheCreation: number;
  ts: Date;
}

export function computeCacheRate(events: CacheRateEvent[]): CacheRateResult {
  const now = Date.now();
  const dayMs = 86_400_000;
  const windows = [7, 30, 90] as const;
  const result: CacheRateResult = { rate7d: 0, rate30d: 0, rate90d: 0, rateAll: 0 };

  const computeRate = (slice: CacheRateEvent[]) => {
    let total = 0;
    let cacheRead = 0;
    for (const e of slice) {
      total += e.cacheRead + e.inputTokens + e.cacheCreation;
      cacheRead += e.cacheRead;
    }
    return total > 0 ? cacheRead / total : 0;
  };

  for (const days of windows) {
    const cutoff = now - days * dayMs;
    const slice = events.filter((e) => e.ts.getTime() >= cutoff);
    result[`rate${days}d` as const] = computeRate(slice);
  }
  result.rateAll = computeRate(events);

  return result;
}
