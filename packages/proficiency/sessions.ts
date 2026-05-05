export interface SessionsResult {
  totalSessions: number;
  rootSessions: number;
  subagentSessions: number;
  activeWeeks: number;
  avgTokensPerSession: number;
  recencyDays: number;
}

export function computeSessions(events: Array<{ ts: Date; inputTokens: number; outputTokens: number; sessionId: string | null; isSubagent?: boolean }>): SessionsResult {
  if (events.length === 0) {
    return { totalSessions: 0, rootSessions: 0, subagentSessions: 0, activeWeeks: 0, avgTokensPerSession: 0, recencyDays: 0 };
  }

  const sessioned = events.filter((e) => Boolean(e.sessionId));
  const rootSessions = new Set(sessioned.filter((e) => !e.isSubagent).map((e) => e.sessionId));
  const subagentSessions = new Set(sessioned.filter((e) => e.isSubagent).map((e) => e.sessionId));
  const totalTokens = sessioned.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0);
  const now = new Date();
  const latest = new Date(Math.max(...events.map((e) => e.ts.getTime())));
  const recencyDays = Math.floor((now.getTime() - latest.getTime()) / (1000 * 60 * 60 * 24));
  const totalSessions = rootSessions.size + subagentSessions.size;

  return {
    totalSessions,
    rootSessions: rootSessions.size,
    subagentSessions: subagentSessions.size,
    activeWeeks: Math.max(1, Math.ceil(recencyDays / 7)),
    avgTokensPerSession: totalSessions > 0 ? totalTokens / totalSessions : 0,
    recencyDays,
  };
}
