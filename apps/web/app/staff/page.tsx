import { db } from '@silver-tokens/db';
import { users, scorecards, events } from '@silver-tokens/db/schema';
import { desc } from 'drizzle-orm';
import { StaffDashboard, ScorecardPayload, User } from '@/components/staff/dashboard';

export default async function StaffPage() {
  const allUsers = await db.query.users.findMany({
    orderBy: desc(users.createdAt),
    with: {
      scorecards: {
        limit: 1,
        orderBy: desc(scorecards.computedAt),
      },
      events: {
        orderBy: [desc(events.ts)],
        limit: 100,
      },
    },
  });

  const typedUsers: User[] = allUsers.map(u => ({
    id: u.id,
    githubLogin: u.githubLogin,
    email: u.email,
    createdAt: u.createdAt,
    scorecards: u.scorecards?.map(s => ({
      payload: s.payload as ScorecardPayload,
      computedAt: s.computedAt,
    })) || [],
    events: (u.events || []).map(e => ({
      ts: e.ts,
      sessionId: e.sessionId || '',
      costUsd: e.costUsd || '0',
      toolName: e.toolName,
      model: e.model,
      inputTokens: e.inputTokens || 0,
      outputTokens: e.outputTokens || 0,
      cacheRead: e.cacheRead || 0,
    })),
  }));

  return <StaffDashboard users={typedUsers} />;
}