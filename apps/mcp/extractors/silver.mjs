// Silver unified extractor — detects Claude Code, OpenCode, and Codex usage on
// the candidate's machine, emits one JSON envelope:
//   { uploads: [{ cli, events, meta }, ...] }
// Each `events[]` row is one billable assistant turn. Activity meta is per-CLI.
//
// Idempotency contract: every event ships with a non-NULL (message_id, request_id)
// pair so the DB unique index dedupes re-runs cleanly (Postgres treats NULL as
// distinct, so a NULL request_id would let duplicates slip in).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? '';

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

const dayKey = (d) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function buildMeta(totalMessages, timestamps, hourCounts) {
	const activeDaySet = new Set(timestamps.map(dayKey));
	const sortedDays = [...activeDaySet].sort();

	let longestStreak = 0;
	let currentRun = 0;
	let prevDay = null;
	for (const day of sortedDays) {
		const d = new Date(`${day}T00:00:00`);
		if (prevDay && d.getTime() - prevDay.getTime() === 86_400_000) currentRun++;
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

	const peakHourLocal = hourCounts.some((c) => c > 0) ? hourCounts.indexOf(Math.max(...hourCounts)) : null;

	return { totalMessages, activeDays: activeDaySet.size, currentStreak, longestStreak, peakHourLocal };
}

// ---------- Claude Code ----------
function extractClaudeCode() {
	const ROOT = `${HOME}/.claude/projects`.replace(/\\/g, '/');
	if (!existsSync(ROOT)) return null;

	const files = [];
	const walk = (dir) => {
		let entries;
		try { entries = readdirSync(dir); } catch { return; }
		for (const entry of entries) {
			const p = join(dir, entry);
			let s;
			try { s = statSync(p); } catch { continue; }
			if (s.isDirectory()) walk(p);
			else if (entry.endsWith('.jsonl')) files.push(p);
		}
	};
	walk(ROOT);

	const events = [];
	let totalMessages = 0;
	const timestamps = [];
	const hourCounts = new Array(24).fill(0);
	const seen = new Set();

	for (const file of files) {
		let raw;
		try { raw = readFileSync(file, 'utf8'); } catch { continue; }
		const isSubagent = file.includes('_subagent');
		for (const line of raw.split(/\r?\n/)) {
			if (!line.trim()) continue;
			let obj;
			try { obj = JSON.parse(line); } catch { continue; }

			totalMessages++;
			if (typeof obj?.timestamp === 'string') {
				const d = new Date(obj.timestamp);
				if (!isNaN(d.getTime())) {
					timestamps.push(d);
					hourCounts[d.getHours()]++;
				}
			}

			if (obj?.type !== 'assistant') continue;
			// Compact summaries restate prior turns; counting them double-counts the work.
			if (obj?.isCompactSummary === true) continue;
			const msg = obj.message;
			if (!msg || typeof msg !== 'object') continue;
			const usage = msg.usage;
			if (!usage || typeof usage !== 'object') continue;

			const inp = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
			const out = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;
			const cr = typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0;
			const cc = typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0;
			// Streaming bug #22686: Anthropic emits a placeholder usage event with
			// output_tokens:1 and zero everything else before the final event lands.
			// Same message.id can ship with a different requestId, so the DB unique
			// index does not dedupe these. Drop at extraction.
			if (out === 1 && inp === 0 && cr === 0 && cc === 0) continue;

			let firstTool;
			if (Array.isArray(msg.content)) {
				for (const block of msg.content) {
					if (block?.type === 'tool_use' && typeof block.name === 'string') { firstTool = block.name; break; }
				}
			}

			const messageId = typeof msg.id === 'string' && msg.id ? msg.id : undefined;
			if (!messageId) continue; // no stable dedup key, skip
			const requestId = typeof obj.requestId === 'string' && obj.requestId
				? obj.requestId
				: `cc-derived:${messageId}`;

			const dedupKey = `${messageId}::${requestId}`;
			if (seen.has(dedupKey)) continue;
			seen.add(dedupKey);

			events.push({
				model: typeof msg.model === 'string' ? msg.model : 'unknown',
				ts: typeof obj.timestamp === 'string' ? obj.timestamp : new Date().toISOString(),
				input_tokens: inp,
				output_tokens: out,
				cache_read: cr,
				cache_creation: cc,
				cost_usd: 0,
				message_id: messageId,
				request_id: requestId,
				session_id: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
				project_hash: hashProject(obj.cwd),
				tool_name: firstTool,
				is_subagent: isSubagent,
			});
		}
	}

	if (totalMessages === 0 && events.length === 0) return null;
	const rootSids = new Set();
	const subSids = new Set();
	for (const e of events) {
		if (!e.session_id) continue;
		(e.is_subagent ? subSids : rootSids).add(e.session_id);
	}
	return {
		cli: 'claude_code',
		events,
		meta: { ...buildMeta(totalMessages, timestamps, hourCounts), rootSessions: rootSids.size, subagentSessions: subSids.size },
	};
}

// ---------- OpenCode (SQLite + legacy JSON) ----------
function extractOpenCodeMessageFromJson(parsed, fallbackId, fallbackTs) {
	if (parsed?.role !== 'assistant') return null;
	const tokens = parsed.tokens;
	if (!tokens || typeof tokens !== 'object') return null;
	const model = parsed.modelID ?? parsed.model?.modelID;
	if (typeof model !== 'string' || !model) return null;

	const ts = Number(parsed?.time?.created) || fallbackTs || Date.now();
	const id = String(parsed.id ?? fallbackId);

	return {
		event: {
			model,
			ts: new Date(ts).toISOString(),
			input_tokens: typeof tokens.input === 'number' ? tokens.input : 0,
			output_tokens: typeof tokens.output === 'number' ? tokens.output : 0,
			cache_read: typeof tokens.cache?.read === 'number' ? tokens.cache.read : 0,
			cache_creation: typeof tokens.cache?.write === 'number' ? tokens.cache.write : 0,
			cost_usd: typeof parsed.cost === 'number' ? parsed.cost : 0,
			message_id: id,
			session_id: parsed.sessionID ? String(parsed.sessionID) : undefined,
			project_hash: hashProject(parsed.path?.cwd),
			tool_name: undefined,
			is_subagent: false,
		},
		ts,
		id,
	};
}

async function extractOpenCode() {
	const dbCandidates = [
		`${HOME}/.local/share/opencode/opencode.db`,
		`${HOME}/.local/share/opencode/opencode-prod.db`,
		`${HOME}/Library/Application Support/opencode/opencode.db`,
		`${process.env.APPDATA ?? ''}/opencode/opencode.db`,
	].filter(Boolean).map((p) => p.replace(/\\/g, '/'));
	const dbPath = dbCandidates.find((p) => existsSync(p));

	const jsonRoots = [
		`${HOME}/.local/share/opencode/storage/message`,
		`${HOME}/Library/Application Support/opencode/storage/message`,
		`${process.env.APPDATA ?? ''}/opencode/storage/message`,
	].filter(Boolean).map((p) => p.replace(/\\/g, '/')).filter((p) => existsSync(p));

	if (!dbPath && jsonRoots.length === 0) return null;

	const eventsById = new Map();
	let totalMessages = 0;
	const timestamps = [];
	const hourCounts = new Array(24).fill(0);

	function recordTs(ts) {
		if (!Number.isFinite(ts)) return;
		const d = new Date(ts);
		if (isNaN(d.getTime())) return;
		timestamps.push(d);
		hourCounts[d.getHours()]++;
	}

	// SQLite path
	if (dbPath) {
		let DatabaseSync;
		try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* old node */ }

		if (DatabaseSync) {
			try {
				const db = new DatabaseSync(dbPath, { readOnly: true });
				const rows = db.prepare('SELECT id, session_id, time_created, data FROM message').all();

				for (const row of rows) {
					totalMessages++;
					let parsed;
					try { parsed = JSON.parse(row.data); } catch { continue; }

					const fallbackTs = Number(row.time_created) || undefined;
					recordTs(fallbackTs ?? parsed?.time?.created ?? Date.now());

					const built = extractOpenCodeMessageFromJson(parsed, row.id, fallbackTs);
					if (!built) continue;

					const event = {
						...built.event,
						session_id: built.event.session_id ?? (row.session_id ? String(row.session_id) : undefined),
						request_id: `oc-sqlite:${built.id}`,
					};
					eventsById.set(built.id, event);
				}
				db.close();
			} catch { /* corrupt or locked — skip silently */ }
		}
	}

	// Legacy JSON path: storage/message/<sessionId>/<messageId>.json
	for (const root of jsonRoots) {
		const walk = (dir) => {
			let entries;
			try { entries = readdirSync(dir); } catch { return; }
			for (const entry of entries) {
				const p = join(dir, entry);
				let s;
				try { s = statSync(p); } catch { continue; }
				if (s.isDirectory()) walk(p);
				else if (entry.endsWith('.json')) {
					totalMessages++;
					let raw;
					try { raw = readFileSync(p, 'utf8'); } catch { continue; }
					let parsed;
					try { parsed = JSON.parse(raw); } catch { continue; }

					const fileMtime = s.mtimeMs;
					recordTs(parsed?.time?.created ?? fileMtime);

					const fallbackId = basename(p, '.json');
					const built = extractOpenCodeMessageFromJson(parsed, fallbackId, fileMtime);
					if (!built) continue;

					// SQLite is authoritative if both sources have the same message id.
					if (eventsById.has(built.id)) continue;
					eventsById.set(built.id, {
						...built.event,
						request_id: `oc-json:${built.id}`,
					});
				}
			}
		};
		walk(root);
	}

	if (totalMessages === 0 && eventsById.size === 0) return null;
	return {
		cli: 'opencode',
		events: [...eventsById.values()],
		meta: buildMeta(totalMessages, timestamps, hourCounts),
	};
}

// ---------- Codex (~/.codex/sessions/**/*.jsonl) ----------
// Codex CLI rolls sessions out as JSONL. Token counts in `token_count` /
// `usage` payloads are CUMULATIVE per session — to recover per-turn deltas we
// subtract the previous running total within the same file.
//
// Schema is best-effort: Codex has changed shapes across versions. We pick
// fields defensively and skip lines we can't make sense of.
function extractCodex() {
	const ROOT = `${HOME}/.codex/sessions`.replace(/\\/g, '/');
	if (!existsSync(ROOT)) return null;

	const files = [];
	const walk = (dir) => {
		let entries;
		try { entries = readdirSync(dir); } catch { return; }
		for (const entry of entries) {
			const p = join(dir, entry);
			let s;
			try { s = statSync(p); } catch { continue; }
			if (s.isDirectory()) walk(p);
			else if (entry.endsWith('.jsonl') || entry.endsWith('.json')) files.push(p);
		}
	};
	walk(ROOT);

	const events = [];
	let totalMessages = 0;
	const timestamps = [];
	const hourCounts = new Array(24).fill(0);

	function recordTs(ts) {
		if (!Number.isFinite(ts)) return;
		const d = new Date(ts);
		if (isNaN(d.getTime())) return;
		timestamps.push(d);
		hourCounts[d.getHours()]++;
	}

	for (const file of files) {
		const sessionId = basename(file).replace(/\.jsonl?$/, '');
		let raw;
		try { raw = readFileSync(file, 'utf8'); } catch { continue; }

		let prev = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
		let turnIndex = 0;
		let pendingModel; // assistant lines and token_count lines may be separate

		for (const line of raw.split(/\r?\n/)) {
			if (!line.trim()) continue;
			let obj;
			try { obj = JSON.parse(line); } catch { continue; }
			totalMessages++;

			// Capture model name when we see an assistant message; many Codex
			// versions emit model in a separate event from token_count.
			const role = obj?.role ?? obj?.payload?.role ?? obj?.message?.role;
			const model =
				obj?.model ??
				obj?.payload?.model ??
				obj?.message?.model ??
				obj?.response?.model;
			if (typeof model === 'string' && model && (role === 'assistant' || obj?.type === 'assistant_message' || obj?.type === 'response')) {
				pendingModel = model;
			}

			const tsRaw = obj?.timestamp ?? obj?.ts ?? obj?.time ?? obj?.payload?.timestamp;
			let tsMs;
			if (typeof tsRaw === 'number') tsMs = tsRaw < 1e12 ? tsRaw * 1000 : tsRaw;
			else if (typeof tsRaw === 'string') {
				const d = new Date(tsRaw);
				tsMs = isNaN(d.getTime()) ? undefined : d.getTime();
			}
			if (tsMs !== undefined) recordTs(tsMs);

			// Look for a token_count / usage payload anywhere on the object.
			const usage =
				obj?.token_count ??
				obj?.usage ??
				obj?.payload?.token_count ??
				obj?.payload?.usage ??
				obj?.response?.usage;
			if (!usage || typeof usage !== 'object') continue;

			const cumInput =
				usage.input_tokens ?? usage.prompt_tokens ?? usage.input ?? 0;
			const cumOutput =
				usage.output_tokens ?? usage.completion_tokens ?? usage.output ?? 0;
			const cumCacheRead =
				usage.cache_read_input_tokens ??
				usage.cached_tokens ??
				usage.input_tokens_details?.cached_tokens ??
				0;
			const cumCacheCreation =
				usage.cache_creation_input_tokens ?? usage.cache_creation ?? 0;

			if (
				typeof cumInput !== 'number' ||
				typeof cumOutput !== 'number'
			) continue;

			let dInput = cumInput - prev.input;
			let dOutput = cumOutput - prev.output;
			let dCacheRead = cumCacheRead - prev.cacheRead;
			let dCacheCreation = cumCacheCreation - prev.cacheCreation;

			// If any delta is negative the cumulative counter reset (new
			// process or new context). Treat this turn as a fresh anchor and
			// drop it — the next turn will give us a clean delta.
			if (dInput < 0 || dOutput < 0 || dCacheRead < 0 || dCacheCreation < 0) {
				prev = { input: cumInput, output: cumOutput, cacheRead: cumCacheRead, cacheCreation: cumCacheCreation };
				continue;
			}

			// Skip no-op token_count entries (no new tokens this turn).
			if (dInput === 0 && dOutput === 0 && dCacheRead === 0 && dCacheCreation === 0) continue;

			const messageId =
				obj?.id ??
				obj?.message_id ??
				obj?.payload?.id ??
				obj?.message?.id ??
				`codex:${sessionId}:${turnIndex}`;

			events.push({
				model: pendingModel ?? 'unknown',
				ts: tsMs ? new Date(tsMs).toISOString() : new Date().toISOString(),
				input_tokens: dInput,
				output_tokens: dOutput,
				cache_read: dCacheRead,
				cache_creation: dCacheCreation,
				cost_usd: 0,
				message_id: String(messageId),
				request_id: `codex:${sessionId}:${turnIndex}`,
				session_id: sessionId,
				project_hash: undefined,
				tool_name: undefined,
				is_subagent: false,
			});

			prev = { input: cumInput, output: cumOutput, cacheRead: cumCacheRead, cacheCreation: cumCacheCreation };
			turnIndex++;
		}
	}

	if (totalMessages === 0 && events.length === 0) return null;
	const filtered = events.filter((e) => e.model !== 'unknown');
	return { cli: 'codex', events: filtered, meta: buildMeta(totalMessages, timestamps, hourCounts) };
}

// ---------- main ----------
const uploads = [];
const cc = extractClaudeCode();
if (cc) uploads.push(cc);
const oc = await extractOpenCode();
if (oc) uploads.push(oc);
const cx = extractCodex();
if (cx) uploads.push(cx);

process.stdout.write(JSON.stringify({ uploads }));
