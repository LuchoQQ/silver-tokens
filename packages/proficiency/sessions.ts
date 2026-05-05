export interface SessionsResult {
  totalSessions: number;
  activeWeeks: number;
  avgTokensPerSession: number;
  recencyDays: number;
}

export function computeSessions(events: Array<{ ts: Date; inputTokens: number; outputTokens: number; sessionId: string | null }>): SessionsResult {
  if (events.length === 0) {
    return { totalSessions: 0, activeWeeks: 0, avgTokensPerSession: 0, recencyDays: 0 };
  }

  // Both totalSessions and avgTokensPerSession must operate on the same
  // event set, otherwise the headline numbers don't multiply back to the
  // displayed total. We filter for events that actually have a sessionId,
  // since those are the only ones that contribute to totalSessions.
  const sessioned = events.filter((e) => Boolean(e.sessionId));
  const sessions = new Set(sessioned.map((e) => e.sessionId));
  const totalTokens = sessioned.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0);
  const now = new Date();
  const latest = new Date(Math.max(...events.map((e) => e.ts.getTime())));
  const recencyDays = Math.floor((now.getTime() - latest.getTime()) / (1000 * 60 * 60 * 24));

  return {
    totalSessions: sessions.size,
    activeWeeks: Math.max(1, Math.ceil(recencyDays / 7)),
    avgTokensPerSession: sessions.size > 0 ? totalTokens / sessions.size : 0,
    recencyDays,
  };
}
