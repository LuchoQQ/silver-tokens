export function computeModelMix(events: Array<{ model: string; costUsd: string }>): Record<string, number> {
  const costs: Record<string, number> = {};
  let total = 0;

  for (const e of events) {
    const cost = parseFloat(e.costUsd);
    costs[e.model] = (costs[e.model] || 0) + cost;
    total += cost;
  }

  const result: Record<string, number> = {};
  for (const [model, cost] of Object.entries(costs)) {
    result[model] = total > 0 ? (cost / total) * 100 : 0;
  }

  return result;
}
