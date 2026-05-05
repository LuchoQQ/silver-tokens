// Pricing per 1M tokens (USD). Standard tiers. Values current as of 2026-01.
// For unknown models we return 0 — better silent zero than fabricated cost.
type Pricing = { input: number; output: number; cacheRead: number; cacheCreation: number };

const ANTHROPIC: Record<string, Pricing> = {
	opus: { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
	sonnet: { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
	haiku: { input: 1, output: 5, cacheRead: 0.1, cacheCreation: 1.25 },
};

function pricingFor(model: string): Pricing | null {
	const m = model.toLowerCase();
	if (m.includes('opus')) return ANTHROPIC.opus;
	if (m.includes('sonnet')) return ANTHROPIC.sonnet;
	if (m.includes('haiku')) return ANTHROPIC.haiku;
	// gpt-5-codex / gpt-5: rough placeholder ($1.25 in / $10 out per 1M).
	if (m.startsWith('gpt-5')) return { input: 1.25, output: 10, cacheRead: 0.125, cacheCreation: 1.25 };
	return null;
}

export function computeCost(
	model: string,
	tokens: { input?: number; output?: number; cacheRead?: number; cacheCreation?: number },
): number {
	const p = pricingFor(model);
	if (!p) return 0;
	const cost
		= ((tokens.input ?? 0) * p.input
			+ (tokens.output ?? 0) * p.output
			+ (tokens.cacheRead ?? 0) * p.cacheRead
			+ (tokens.cacheCreation ?? 0) * p.cacheCreation) / 1_000_000;
	return Math.round(cost * 1e6) / 1e6;
}
