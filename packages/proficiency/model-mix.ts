export function computeModelMix(
  events: Array<{ model: string; costUsd: string; inputTokens: number; outputTokens: number }>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  let grandTotal = 0;

  // Weight by total tokens (input + output). More honest than cost when pricing
  // data isn't populated yet, and aligns with how candidates think about model use.
  for (const e of events) {
    const tokens = (e.inputTokens || 0) + (e.outputTokens || 0);
    if (tokens === 0) continue;
    totals[e.model] = (totals[e.model] || 0) + tokens;
    grandTotal += tokens;
  }

  const result: Record<string, number> = {};
  for (const [model, t] of Object.entries(totals)) {
    result[model] = grandTotal > 0 ? (t / grandTotal) * 100 : 0;
  }

  return result;
}
