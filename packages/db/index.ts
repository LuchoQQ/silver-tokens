import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from './schema';
import { events, tokens, scorecards, users } from './schema';
import { computeCacheRate } from '@silver-tokens/proficiency/cache-rate';
import { computeModelMix } from '@silver-tokens/proficiency/model-mix';
import { computeToolDistribution } from '@silver-tokens/proficiency/tool-distribution';
import { computeSessions } from '@silver-tokens/proficiency/sessions';
import { computeActivity } from '@silver-tokens/proficiency/activity';
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
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
    return { valid: false as const, reason: 'Token expired' };
  }

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
    isSubagent: e.is_subagent ?? false,
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

export interface UploadMeta {
  totalMessages?: number;
  activeDays?: number;
  currentStreak?: number;
  longestStreak?: number;
  peakHourLocal?: number;
}

export async function computeAndSaveScorecard(userId: string, meta?: UploadMeta): Promise<{ payload: Record<string, unknown> } | null> {
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
    isSubagent: e.isSubagent ?? false,
  }));

  const cacheRate = computeCacheRate(normalized);
  const modelMix = computeModelMix(normalized);
  const toolDist = computeToolDistribution(normalized);
  const sessions = computeSessions(normalized);
  const activity = computeActivity(normalized);

  // Split sessions into root vs subagent. Each subagent invocation has its own
  // sessionId in Claude Code's JSONL, so they show up as distinct sessions —
  // but they're one logical "task call" of the user, not a separate workflow.
  // Surfacing the split tells Gabriel "how often the candidate uses subagents",
  // which is itself a proficiency signal (sub-tasks = parallelism, planning).
  const rootSids = new Set<string>();
  const subSids = new Set<string>();
  for (const e of normalized) {
    if (!e.sessionId) continue;
    (e.isSubagent ? subSids : rootSids).add(e.sessionId);
  }
  const sessionSplit = { rootSessions: rootSids.size, subagentSessions: subSids.size };

  // Activity values come from two sources: server-side (UTC, derived from all
  // events ever uploaded) and client-side (local-tz, only this upload's range).
  // For monotonic counters (active days, streaks) take the max — meta from a
  // single recent upload must never degrade the all-time tally accumulated
  // from prior uploads. Peak hour is a one-pick: prefer local when present.
  const metaActiveDays = typeof meta?.activeDays === 'number' ? meta.activeDays : 0;
  const metaCurrentStreak = typeof meta?.currentStreak === 'number' ? meta.currentStreak : 0;
  const metaLongestStreak = typeof meta?.longestStreak === 'number' ? meta.longestStreak : 0;
  const localActivity = {
    ...activity,
    activeDays: Math.max(activity.activeDays, metaActiveDays),
    currentStreak: Math.max(activity.currentStreak, metaCurrentStreak),
    longestStreak: Math.max(activity.longestStreak, metaLongestStreak),
    peakHour: typeof meta?.peakHourLocal === 'number' ? meta.peakHourLocal : activity.peakHour,
    peakHourSource: typeof meta?.peakHourLocal === 'number' ? 'local' : 'utc',
  };

  const payload = {
    fluencyPercentile: 50,
    cacheRate: cacheRate.rate30d,
    cacheRateWindows: cacheRate,
    modelMix,
    toolDistribution: toolDist,
    sessions: { ...sessions, ...sessionSplit },
    activity: localActivity,
    confidence: 'medium',
    totalEvents: userEvents.length,
    computedAt: new Date().toISOString(),
  };

  await db.insert(scorecards).values({ userId, payload });

  return { payload };
}
