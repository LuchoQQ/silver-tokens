export function computeToolDistribution(events: Array<{ toolName: string | null }>): Record<string, number> {
  const counts: Record<string, number> = {};
  let total = 0;

  for (const e of events) {
    if (e.toolName) {
      counts[e.toolName] = (counts[e.toolName] || 0) + 1;
      total++;
    }
  }

  return counts;
}
