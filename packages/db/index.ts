import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from './schema';
import { events, tokens, scorecards, users } from './schema';
import { computeCacheRate } from '@silver-tokens/proficiency/cache-rate';
import { computeModelMix } from '@silver-tokens/proficiency/model-mix';
import { computeToolDistribution } from '@silver-tokens/proficiency/tool-distribution';
import { computeSessions } from '@silver-tokens/proficiency/sessions';
import type { SafeEvent } from '@silver-tokens/shared/wire';

const client = postgres(process.env.DATABASE_URL!, {
  max: 10,
  ssl: 'require',
});

export const db = drizzle(client, { schema });

export async function validateToken(value: string) {
  const token = await db.query.tokens.findFirst({
    where: eq(tokens.value, value),
    with: { user: true },
  });

  if (!token) return { valid: false as const, reason: 'Token not found' };
  if (new Date(token.expiresAt) < new Date()) return { valid: false as const, reason: 'Token expired' };

  return { valid: true as const, token, user: token.user };
}

export async function insertEvents(userId: string, rawEvents: SafeEvent[]): Promise<number> {
  if (rawEvents.length === 0) return 0;

  const rows = rawEvents.map((e) => ({
    userId,
    source: e.source,
    model: e.model,
    ts: new Date(e.ts),
    inputTokens: e.input_tokens,
    outputTokens: e.output_tokens,
    cacheRead: e.cache_read,
    cacheCreation: e.cache_creation,
    costUsd: String(e.cost_usd),
    projectHash: e.project_hash ?? null,
    toolName: e.tool_name ?? null,
    messageId: e.message_id ?? null,
    requestId: e.request_id ?? null,
    sessionId: e.session_id ?? null,
  }));

  // postgres-js caps bind parameters at 65534 per query. With 14 columns per row,
  // chunk to stay well under that ceiling (4000 rows × 14 = 56000 params).
  const CHUNK_SIZE = 4000;
  let totalInserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const inserted = await db
      .insert(events)
      .values(chunk)
      .onConflictDoNothing({
        target: [events.messageId, events.requestId],
      })
      .returning({ id: events.id });
    totalInserted += inserted.length;
  }

  return totalInserted;
}

export async function markTokenUsed(value: string): Promise<void> {
  await db
    .update(tokens)
    .set({ usedAt: new Date() })
    .where(eq(tokens.value, value));
}

export async function computeAndSaveScorecard(userId: string): Promise<{ payload: Record<string, unknown> } | null> {
  const userEvents = await db.query.events.findMany({
    where: eq(events.userId, userId),
  });

  if (userEvents.length === 0) return null;

  const normalized = userEvents.map((e) => ({
    ...e,
    inputTokens: e.inputTokens ?? 0,
    outputTokens: e.outputTokens ?? 0,
    cacheRead: e.cacheRead ?? 0,
    cacheCreation: e.cacheCreation ?? 0,
    costUsd: e.costUsd ?? '0',
    toolName: e.toolName ?? '',
    sessionId: e.sessionId ?? '',
  }));

  const cacheRate = computeCacheRate(normalized);
  const modelMix = computeModelMix(normalized);
  const toolDist = computeToolDistribution(normalized);
  const sessions = computeSessions(normalized);

  const payload = {
    fluencyPercentile: 50,
    cacheRate: cacheRate.rate30d,
    modelMix,
    toolDistribution: toolDist,
    sessions,
    confidence: 'medium',
    totalEvents: userEvents.length,
    computedAt: new Date().toISOString(),
  };

  await db.insert(scorecards).values({ userId, payload });

  return { payload };
}
