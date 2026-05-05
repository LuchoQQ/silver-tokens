// OpenCode extractor — reads ~/.local/share/opencode/opencode.db (SQLite).
// Standardized output: one event per assistant message with token usage,
// matching the shape of claude-code.mjs so the server processes both uniformly.
//
// Requires Node 22.5+ with --experimental-sqlite, or Node 23+ (stable node:sqlite).
// On older Node this script exits cleanly emitting an empty-events payload.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? '';
const CANDIDATE_PATHS = [
	`${HOME}/.local/share/opencode/opencode.db`,
	`${HOME}/.local/share/opencode/opencode-prod.db`,
	`${HOME}/Library/Application Support/opencode/opencode.db`,
	`${process.env.APPDATA ?? ''}/opencode/opencode.db`,
].filter(Boolean).map((p) => p.replace(/\\/g, '/'));

const dbPath = CANDIDATE_PATHS.find((p) => existsSync(p));

const projectHashCache = new Map();
function hashProject(cwd) {
	if (!cwd) return undefined;
	const base = basename(String(cwd).replace(/\\/g, '/'));
	if (!base) return undefined;
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

function recordTimestamp(ts) {
	if (!Number.isFinite(ts)) return;
	const d = new Date(ts);
	if (isNaN(d.getTime())) return;
	allTimestamps.push(d);
	localHourCounts[d.getHours()]++;
}

if (dbPath) {
	let DatabaseSync;
	try {
		({ DatabaseSync } = await import('node:sqlite'));
	} catch {
		// Older Node without node:sqlite — skip OpenCode silently.
	}

	if (DatabaseSync) {
		try {
			const db = new DatabaseSync(dbPath, { readOnly: true });
			const rows = db.prepare('SELECT id, session_id, time_created, data FROM message').all();

			for (const row of rows) {
				totalMessages++;
				let parsed;
				try { parsed = JSON.parse(row.data); } catch { continue; }

				const ts = Number(row.time_created) || (parsed?.time?.created) || Date.now();
				recordTimestamp(ts);

				if (parsed?.role !== 'assistant') continue;
				const tokens = parsed.tokens;
				if (!tokens || typeof tokens !== 'object') continue;

				const model = parsed.modelID ?? parsed.model?.modelID ?? 'unknown';
				if (model === 'unknown') continue;

				events.push({
					model: String(model),
					ts: new Date(ts).toISOString(),
					input_tokens: typeof tokens.input === 'number' ? tokens.input : 0,
					output_tokens: typeof tokens.output === 'number' ? tokens.output : 0,
					cache_read: typeof tokens.cache?.read === 'number' ? tokens.cache.read : 0,
					cache_creation: typeof tokens.cache?.write === 'number' ? tokens.cache.write : 0,
					cost_usd: typeof parsed.cost === 'number' ? parsed.cost : 0,
					message_id: String(row.id),
					request_id: undefined,
					session_id: row.session_id ? String(row.session_id) : undefined,
					project_hash: hashProject(parsed.path?.cwd),
					tool_name: undefined,
				});
			}

			db.close();
		} catch {
			// Corrupt DB or locked — skip silently.
		}
	}
}

// Compute activity meta for telemetry parity with claude-code.mjs.
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const activeDaySet = new Set(allTimestamps.map(dayKey));
const sortedDays = [...activeDaySet].sort();
let longestStreak = 0, currentRun = 0, prevDay = null;
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
	cli: 'opencode',
	events,
	meta: { totalMessages, activeDays: activeDaySet.size, currentStreak, longestStreak, peakHourLocal, dbPath: dbPath ?? null },
}));
