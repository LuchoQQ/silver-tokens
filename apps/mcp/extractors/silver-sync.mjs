#!/usr/bin/env node
// silver-tokens auto-sync — runs from a Claude Code SessionEnd hook on the
// candidate's machine. Three modes:
//
//   node ~/.silver-sync.mjs                  → entry: rate-limit + fork worker
//   node ~/.silver-sync.mjs --worker         → extract + gzip + POST /upload
//   node ~/.silver-sync.mjs --install-hook   → merge into ~/.claude/settings.json
//   node ~/.silver-sync.mjs --uninstall-hook → remove our entry from settings.json
//
// __SILVER_URL__ is replaced at /mcp__silver__setup_auto_sync time with the
// candidate's full upload URL (https://mcp.silver.dev/u/<token>/upload).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SILVER_URL = '__SILVER_URL__';
const HOME = homedir();
const SCRIPT = fileURLToPath(import.meta.url);
const MARKER = join(HOME, '.silver-last-sync');
const EXTRACTOR = join(HOME, '.silver-extract.mjs');
const SETTINGS = join(HOME, '.claude', 'settings.json');

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ---------- mode: --install-hook ----------
if (process.argv.includes('--install-hook')) {
	let settings = {};
	if (existsSync(SETTINGS)) {
		try { settings = JSON.parse(readFileSync(SETTINGS, 'utf8')); } catch {
			console.error('settings.json exists but cannot be parsed; aborting to avoid clobbering it.');
			process.exit(1);
		}
	}
	settings.hooks ??= {};
	settings.hooks.SessionEnd ??= [];

	const command = `node ${SCRIPT}`;
	const flat = settings.hooks.SessionEnd.flatMap((g) => g?.hooks ?? []);
	if (flat.some((h) => typeof h?.command === 'string' && h.command.includes('silver-sync.mjs'))) {
		console.log('silver-sync hook already installed.');
		process.exit(0);
	}

	settings.hooks.SessionEnd.push({
		matcher: '*',
		hooks: [{ type: 'command', command, timeout: 30 }],
	});

	const dir = join(HOME, '.claude');
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
	console.log('installed silver-sync SessionEnd hook → ' + SETTINGS);
	process.exit(0);
}

// ---------- mode: --uninstall-hook ----------
if (process.argv.includes('--uninstall-hook')) {
	if (!existsSync(SETTINGS)) { console.log('no settings.json; nothing to uninstall.'); process.exit(0); }
	let settings;
	try { settings = JSON.parse(readFileSync(SETTINGS, 'utf8')); } catch { process.exit(1); }
	const before = JSON.stringify(settings);
	if (Array.isArray(settings?.hooks?.SessionEnd)) {
		settings.hooks.SessionEnd = settings.hooks.SessionEnd
			.map((g) => ({ ...g, hooks: (g?.hooks ?? []).filter((h) => !(typeof h?.command === 'string' && h.command.includes('silver-sync.mjs'))) }))
			.filter((g) => Array.isArray(g.hooks) && g.hooks.length > 0);
	}
	if (JSON.stringify(settings) === before) { console.log('silver-sync hook not present.'); process.exit(0); }
	writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
	console.log('uninstalled silver-sync SessionEnd hook.');
	process.exit(0);
}

// ---------- mode: --worker ----------
if (process.argv.includes('--worker')) {
	if (!existsSync(EXTRACTOR)) process.exit(0);
	const result = spawnSync(process.execPath, [EXTRACTOR], {
		encoding: 'buffer',
		maxBuffer: 200_000_000,
	});
	if (result.status !== 0 || !result.stdout || result.stdout.length === 0) process.exit(0);
	const compressed = gzipSync(result.stdout);
	try {
		await fetch(SILVER_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
			body: compressed,
		});
	} catch {
		// Silent — next run-day retries.
	}
	process.exit(0);
}

// ---------- default mode: entry ----------
// Rate limit: at most one sync per UTC day. The marker holds today's date string.
if (existsSync(MARKER)) {
	try {
		if (readFileSync(MARKER, 'utf8').trim() === today) process.exit(0);
	} catch { /* unreadable marker → fall through and re-sync */ }
}
try { writeFileSync(MARKER, today); } catch { process.exit(0); /* can't persist marker → don't fork */ }

const child = spawn(process.execPath, [SCRIPT, '--worker'], {
	detached: true,
	stdio: 'ignore',
});
child.unref();
process.exit(0);
