export interface FluencyResult {
  percentile: number;
  confidence: 'high' | 'medium' | 'flagged';
}

export function computeFluency(_metrics: Record<string, unknown>, _poolSize: number): FluencyResult {
  return {
    percentile: 50,
    confidence: 'medium',
  };
}
