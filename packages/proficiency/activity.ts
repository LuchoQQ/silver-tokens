export interface ActivityResult {
	messages: number;
	totalTokens: number;
	activeDays: number;
	currentStreak: number;
	longestStreak: number;
	peakHour: number | null;
	favoriteModel: string | null;
}

interface ActivityEvent {
	ts: Date;
	model: string;
	inputTokens: number;
	outputTokens: number;
	cacheRead: number;
	cacheCreation: number;
}

export function computeActivity(events: ActivityEvent[]): ActivityResult {
	if (events.length === 0) {
		return { messages: 0, totalTokens: 0, activeDays: 0, currentStreak: 0, longestStreak: 0, peakHour: null, favoriteModel: null };
	}

	// Net tokens — input + output only. Cache reads are re-served context that
	// can dwarf the rest by 100x in long sessions, so they're misleading as a
	// "tokens used" headline. Cache rate has its own metric.
	const totalTokens = events.reduce(
		(sum, e) => sum + (e.inputTokens || 0) + (e.outputTokens || 0),
		0,
	);

	const dayKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
	const activeDaySet = new Set(events.map((e) => dayKey(e.ts)));
	const sortedDays = [...activeDaySet].sort();

	let longestStreak = 0;
	let currentRun = 0;
	let prev: Date | null = null;
	for (const day of sortedDays) {
		const d = new Date(`${day}T00:00:00Z`);
		if (prev && (d.getTime() - prev.getTime()) === 86_400_000) {
			currentRun++;
		} else {
			currentRun = 1;
		}
		if (currentRun > longestStreak) longestStreak = currentRun;
		prev = d;
	}

	let currentStreak = 0;
	const today = new Date();
	const todayKey = dayKey(today);
	const yesterdayKey = dayKey(new Date(today.getTime() - 86_400_000));
	if (activeDaySet.has(todayKey) || activeDaySet.has(yesterdayKey)) {
		const cursor = new Date(activeDaySet.has(todayKey) ? today : new Date(today.getTime() - 86_400_000));
		while (activeDaySet.has(dayKey(cursor))) {
			currentStreak++;
			cursor.setUTCDate(cursor.getUTCDate() - 1);
		}
	}

	const hourCounts = new Array<number>(24).fill(0);
	for (const e of events) hourCounts[e.ts.getUTCHours()]++;
	const peakHour = hourCounts.some((c) => c > 0) ? hourCounts.indexOf(Math.max(...hourCounts)) : null;

	const modelTokens: Record<string, number> = {};
	for (const e of events) {
		const tokens = (e.inputTokens || 0) + (e.outputTokens || 0);
		if (tokens === 0) continue;
		modelTokens[e.model] = (modelTokens[e.model] || 0) + tokens;
	}
	let favoriteModel: string | null = null;
	let max = 0;
	for (const [model, tokens] of Object.entries(modelTokens)) {
		if (tokens > max) { max = tokens; favoriteModel = model; }
	}

	return {
		messages: events.length,
		totalTokens,
		activeDays: activeDaySet.size,
		currentStreak,
		longestStreak,
		peakHour,
		favoriteModel,
	};
}
