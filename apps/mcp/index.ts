import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { gunzipSync } from 'node:zlib';
import { validateToken, insertEvents, computeAndSaveScorecard } from '@silver-tokens/db';

const port = parseInt(process.env.PORT || '3001', 10);
const publicOrigin = process.env.MCP_PUBLIC_URL ?? `http://localhost:${port}`;

const extractorScript = await Bun.file(new URL('./extractors/silver.mjs', import.meta.url)).text();
const legacyClaudeCodeScript = await Bun.file(new URL('./extractors/claude-code.mjs', import.meta.url)).text();

const sessions: Map<string, { transport: WebStandardStreamableHTTPServerTransport; userId: string; tokenValue: string }> = new Map();

type RawEvent = {
  model?: unknown;
  ts?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read?: unknown;
  cache_creation?: unknown;
  cost_usd?: unknown;
  project_hash?: unknown;
  tool_name?: unknown;
  message_id?: unknown;
  request_id?: unknown;
  session_id?: unknown;
  is_subagent?: unknown;
};

function sanitizeEvents(cli: 'claude_code' | 'codex' | 'opencode', raw: RawEvent[]) {
  return raw
    .map((e) => ({
      source: cli,
      model: typeof e.model === 'string' ? e.model : 'unknown',
      ts: typeof e.ts === 'string' ? e.ts : new Date().toISOString(),
      input_tokens: typeof e.input_tokens === 'number' ? e.input_tokens : 0,
      output_tokens: typeof e.output_tokens === 'number' ? e.output_tokens : 0,
      cache_read: typeof e.cache_read === 'number' ? e.cache_read : 0,
      cache_creation: typeof e.cache_creation === 'number' ? e.cache_creation : 0,
      cost_usd: typeof e.cost_usd === 'number' ? e.cost_usd : 0,
      project_hash: typeof e.project_hash === 'string' ? e.project_hash : undefined,
      tool_name: typeof e.tool_name === 'string' ? e.tool_name : undefined,
      message_id: typeof e.message_id === 'string' ? e.message_id : undefined,
      request_id: typeof e.request_id === 'string' ? e.request_id : undefined,
      session_id: typeof e.session_id === 'string' ? e.session_id : undefined,
      is_subagent: typeof e.is_subagent === 'boolean' ? e.is_subagent : false,
    }))
    .filter((e) => e.model !== 'unknown');
}

async function processUpload(userId: string, body: { cli?: unknown; events?: unknown; meta?: unknown; uploads?: unknown }) {
  const isBatch = Array.isArray(body.uploads);
  const uploads = isBatch
    ? (body.uploads as Array<{ cli?: unknown; events?: unknown; meta?: unknown }>)
    : [body as { cli?: unknown; events?: unknown; meta?: unknown }];

  const results: Array<{ cli: string; eventsReceived: number; eventsInserted: number }> = [];

  for (const u of uploads) {
    const cli = u.cli;
    if (cli !== 'claude_code' && cli !== 'codex' && cli !== 'opencode') {
      return { status: 400, body: { error: 'invalid_cli', detail: 'each upload must have cli ∈ {claude_code,codex,opencode}' } };
    }
    if (!Array.isArray(u.events)) {
      return { status: 400, body: { error: 'invalid_events', detail: 'events must be an array' } };
    }

    const sanitized = sanitizeEvents(cli, u.events as RawEvent[]);
    const inserted = sanitized.length === 0 ? 0 : await insertEvents(userId, sanitized);
    results.push({ cli, eventsReceived: sanitized.length, eventsInserted: inserted });
  }

  // Compute scorecard once after all CLIs have been ingested. Merge per-CLI
  // metas: streak/active-day-style values take the max across CLIs (a candidate
  // who used Claude Code one day and Codex the next is active both days);
  // peak hour takes the mode by total messages, with the largest CLI winning
  // ties so the headline reflects their primary tool.
  const metas = uploads.map((u) => (u.meta && typeof u.meta === 'object') ? u.meta as Record<string, unknown> : {});
  const numericMax = (key: string) => {
    let max: number | undefined;
    for (const m of metas) {
      const v = m[key];
      if (typeof v === 'number' && (max === undefined || v > max)) max = v;
    }
    return max;
  };
  const totalMessages = (() => {
    let sum = 0;
    let any = false;
    for (const m of metas) {
      if (typeof m.totalMessages === 'number') { sum += m.totalMessages; any = true; }
    }
    return any ? sum : undefined;
  })();
  const peakHourLocal = (() => {
    const tally = new Map<number, number>();
    let bestHour: number | undefined;
    let bestWeight = -1;
    metas.forEach((m, i) => {
      if (typeof m.peakHourLocal !== 'number') return;
      const weight = (typeof m.totalMessages === 'number' ? m.totalMessages : 0) || (uploads[i]?.events as unknown[] | undefined)?.length || 0;
      const next = (tally.get(m.peakHourLocal) ?? 0) + weight;
      tally.set(m.peakHourLocal, next);
      if (next > bestWeight) { bestWeight = next; bestHour = m.peakHourLocal; }
    });
    return bestHour;
  })();
  const meta = {
    totalMessages,
    activeDays: numericMax('activeDays'),
    currentStreak: numericMax('currentStreak'),
    longestStreak: numericMax('longestStreak'),
    peakHourLocal,
    rootSessions: numericMax('rootSessions'),
    subagentSessions: numericMax('subagentSessions'),
  };

  const scorecard = await computeAndSaveScorecard(userId, meta);

  return {
    status: 200,
    body: {
      status: 'success',
      uploads: results,
      scorecard: scorecard
        ? {
            fluencyPercentile: scorecard.payload.fluencyPercentile,
            cacheRate: scorecard.payload.cacheRate,
            totalEvents: scorecard.payload.totalEvents,
            confidence: scorecard.payload.confidence,
          }
        : null,
    },
  };
}

function createServer(userId: string, tokenValue: string) {
  const server = new McpServer({
    name: 'silver-tokens',
    version: '0.0.1',
  });

  server.prompt(
    'track',
    'Extract local AI-CLI usage (Claude Code + OpenCode + Codex) and upload sanitized counts to Silver',
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              'Upload my AI-CLI usage to Silver. Steps:',
              '',
              '1. Save the script below verbatim to `./.silver-extract.mjs` in the current working directory using the Write tool. Do not modify it — copy every byte exactly.',
              '',
              `2. Run this Bash command and print the stdout verbatim (it is the scorecard JSON, do not parse or summarize):\n   node ./.silver-extract.mjs | gzip -c | curl -sS -X POST -H "Content-Type: application/json" -H "Content-Encoding: gzip" --data-binary @- "${publicOrigin}/u/${tokenValue}/upload"`,
              '',
              '3. After printing the response, delete `./.silver-extract.mjs`.',
              '',
              'Do not read any *.jsonl files or *.db files yourself. The script auto-detects Claude Code (~/.claude/projects/), OpenCode (~/.local/share/opencode/{opencode.db,storage/message/}), and Codex (~/.codex/sessions/) and uploads them all in one shot. Events never enter your context.',
              '',
              '--- begin script ---',
              extractorScript,
              '--- end script ---',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  return server;
}

const httpServer = Bun.serve({
  port,
  fetch: async (request) => {
    try {
      const url = new URL(request.url);

      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/extract/silver.mjs' || url.pathname === '/extract/silver.js') {
        return new Response(extractorScript, {
          headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'public, max-age=300' },
        });
      }

      if (url.pathname === '/extract/claude-code.js') {
        // Legacy alias — old prompts pointed here, kept for backward compat.
        return new Response(legacyClaudeCodeScript, {
          headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'public, max-age=300' },
        });
      }

      if (url.pathname.startsWith('/.well-known/')) {
        return new Response(
          JSON.stringify({ error: 'not_supported', error_description: 'This server uses bearer tokens in the URL path, not OAuth.' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const tokenPathMatch = url.pathname.match(/^\/u\/([^/]+)(\/.*)?$/);
      if (!tokenPathMatch) {
        return new Response(
          JSON.stringify({ error: 'not_found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const tokenValue = tokenPathMatch[1];
      const subPath = tokenPathMatch[2] ?? '';
      const validation = await validateToken(tokenValue);

      if (!validation.valid) {
        return new Response(
          JSON.stringify({ error: validation.reason }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const userId = validation.user.id;

      if (subPath === '/upload' && request.method === 'POST') {
        const contentLength = Number(request.headers.get('content-length') ?? '0');
        if (contentLength > 10_000_000) {
          return new Response(
            JSON.stringify({ error: 'payload_too_large', detail: 'max 10MB' }),
            { status: 413, headers: { 'Content-Type': 'application/json' } },
          );
        }
        const buf = new Uint8Array(await request.arrayBuffer());
        const isGzip = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
        let text: string;
        if (isGzip) {
          const decompressed = gunzipSync(buf);
          if (decompressed.byteLength > 50_000_000) {
            return new Response(
              JSON.stringify({ error: 'payload_too_large', detail: 'decompressed body exceeds 50MB' }),
              { status: 413, headers: { 'Content-Type': 'application/json' } },
            );
          }
          text = new TextDecoder().decode(decompressed);
        } else {
          text = new TextDecoder().decode(buf);
        }
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch (parseErr) {
          return new Response(
            JSON.stringify({ error: 'invalid_json', detail: parseErr instanceof Error ? parseErr.message : String(parseErr) }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }
        const { status, body: respBody } = await processUpload(userId, body as { cli?: unknown; events?: unknown });
        return new Response(JSON.stringify(respBody), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const sessionId = request.headers.get('mcp-session-id');

      if (sessionId) {
        const session = sessions.get(sessionId);
        if (session) return session.transport.handleRequest(request);
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (request.method === 'POST') {
        const server = createServer(userId, tokenValue);
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, { transport, userId, tokenValue });
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) sessions.delete(transport.sessionId);
        };

        await server.connect(transport);
        return transport.handleRequest(request);
      }

      return new Response('Method not allowed', { status: 405 });
    } catch (error) {
      const detail =
        error instanceof Error
          ? `${error.name}: ${error.message}${error.cause ? ` (cause: ${String(error.cause)})` : ''}`
          : String(error);
      console.error('MCP request failed:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error', detail }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  },
});

console.log(`MCP server running on http://localhost:${port} (public: ${publicOrigin})`);
