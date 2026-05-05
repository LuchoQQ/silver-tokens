import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';

// Inlined from packages/shared/cost.ts — this script ships verbatim to the
// candidate's machine and must depend on node built-ins only.
const PRICING = {
	opus: { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
	sonnet: { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
	haiku: { input: 1, output: 5, cacheRead: 0.1, cacheCreation: 1.25 },
	gpt5: { input: 1.25, output: 10, cacheRead: 0.125, cacheCreation: 1.25 },
};
function pricingFor(model) {
	const m = String(model).toLowerCase();
	if (m.includes('opus')) return PRICING.opus;
	if (m.includes('sonnet')) return PRICING.sonnet;
	if (m.includes('haiku')) return PRICING.haiku;
	if (m.startsWith('gpt-5')) return PRICING.gpt5;
	return null;
}
function computeCost(model, tokens) {
	const p = pricingFor(model);
	if (!p) return 0;
	const cost
		= ((tokens.input ?? 0) * p.input
			+ (tokens.output ?? 0) * p.output
			+ (tokens.cacheRead ?? 0) * p.cacheRead
			+ (tokens.cacheCreation ?? 0) * p.cacheCreation) / 1_000_000;
	return Math.round(cost * 1e6) / 1e6;
}

const ROOT = `${process.env.HOME ?? process.env.USERPROFILE ?? ''}/.claude/projects`.replace(/\\/g, '/');

function walk(dir) {
	const out = [];
	let entries;
	try { entries = readdirSync(dir); } catch { return out; }
	for (const entry of entries) {
		const p = join(dir, entry);
		let s;
		try { s = statSync(p); } catch { continue; }
		if (s.isDirectory()) out.push(...walk(p));
		else if (entry.endsWith('.jsonl')) out.push(p);
	}
	return out;
}

const projectHashCache = new Map();
function hashProject(cwd) {
	if (!cwd) return null;
	const base = basename(String(cwd).replace(/\\/g, '/'));
	if (!base) return null;
	let h = projectHashCache.get(base);
	if (!h) {
		h = createHash('sha256').update(base).digest('hex');
		projectHashCache.set(base, h);
	}
	return h;
}

const events = [];
let totalMessages = 0;
const allTimestamps = [];
const localHourCounts = new Array(24).fill(0);

for (const file of walk(ROOT)) {
	let raw;
	try { raw = readFileSync(file, 'utf8'); } catch { continue; }
	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim()) continue;
		let obj;
		try { obj = JSON.parse(line); } catch { continue; }

		// Count every parseable line as a "message" — matches Claude Code Desktop's count.
		totalMessages++;
		if (typeof obj?.timestamp === 'string') {
			const d = new Date(obj.timestamp);
			if (!isNaN(d.getTime())) {
				allTimestamps.push(d);
				localHourCounts[d.getHours()]++;
			}
		}

		if (obj?.type !== 'assistant') continue;
		const msg = obj.message;
		if (!msg || typeof msg !== 'object') continue;
		const usage = msg.usage;
		if (!usage || typeof usage !== 'object') continue;

		let firstTool;
		if (Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block?.type === 'tool_use' && typeof block.name === 'string') {
					firstTool = block.name;
					break;
				}
			}
		}

		const model = typeof msg.model === 'string' ? msg.model : 'unknown';
		const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
		const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;
		const cacheRead = typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0;
		const cacheCreation = typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0;
		events.push({
			model,
			ts: typeof obj.timestamp === 'string' ? obj.timestamp : new Date().toISOString(),
			input_tokens: inputTokens,
			output_tokens: outputTokens,
			cache_read: cacheRead,
			cache_creation: cacheCreation,
			cost_usd: computeCost(model, { input: inputTokens, output: outputTokens, cacheRead, cacheCreation }),
			message_id: typeof msg.id === 'string' ? msg.id : undefined,
			request_id: typeof obj.requestId === 'string' ? obj.requestId : undefined,
			session_id: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
			project_hash: hashProject(obj.cwd) ?? undefined,
			tool_name: firstTool,
		});
	}
}

// Compute active days + streaks from ALL line timestamps (not just assistant turns).
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const activeDaySet = new Set(allTimestamps.map(dayKey));
const sortedDays = [...activeDaySet].sort();

let longestStreak = 0;
let currentRun = 0;
let prevDay = null;
for (const day of sortedDays) {
	const d = new Date(`${day}T00:00:00`);
	if (prevDay && (d.getTime() - prevDay.getTime()) === 86_400_000) currentRun++;
	else currentRun = 1;
	if (currentRun > longestStreak) longestStreak = currentRun;
	prevDay = d;
}

let currentStreak = 0;
const today = new Date();
const todayK = dayKey(today);
const yesterdayK = dayKey(new Date(today.getTime() - 86_400_000));
if (activeDaySet.has(todayK) || activeDaySet.has(yesterdayK)) {
	const cursor = new Date(activeDaySet.has(todayK) ? today : new Date(today.getTime() - 86_400_000));
	while (activeDaySet.has(dayKey(cursor))) {
		currentStreak++;
		cursor.setDate(cursor.getDate() - 1);
	}
}

const peakHourLocal = localHourCounts.some((c) => c > 0) ? localHourCounts.indexOf(Math.max(...localHourCounts)) : null;

process.stdout.write(JSON.stringify({
	cli: 'claude_code',
	events,
	meta: {
		totalMessages,
		activeDays: activeDaySet.size,
		currentStreak,
		longestStreak,
		peakHourLocal,
	},
}));
