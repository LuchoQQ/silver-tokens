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

  const sessions = new Set(events.map((e) => e.sessionId).filter(Boolean));
  const totalTokens = events.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0);
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
