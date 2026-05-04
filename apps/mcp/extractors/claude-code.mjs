import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';

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
for (const file of walk(ROOT)) {
	let raw;
	try { raw = readFileSync(file, 'utf8'); } catch { continue; }
	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim()) continue;
		let obj;
		try { obj = JSON.parse(line); } catch { continue; }
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

		events.push({
			model: typeof msg.model === 'string' ? msg.model : 'unknown',
			ts: typeof obj.timestamp === 'string' ? obj.timestamp : new Date().toISOString(),
			input_tokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : 0,
			output_tokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
			cache_read: typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0,
			cache_creation: typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0,
			cost_usd: 0,
			message_id: typeof msg.id === 'string' ? msg.id : undefined,
			request_id: typeof obj.requestId === 'string' ? obj.requestId : undefined,
			session_id: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
			project_hash: hashProject(obj.cwd) ?? undefined,
			tool_name: firstTool,
		});
	}
}

process.stdout.write(JSON.stringify({ cli: 'claude_code', events }));
