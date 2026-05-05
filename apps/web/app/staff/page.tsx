import { db } from '@silver-tokens/db';
import { users, scorecards, events } from '@silver-tokens/db/schema';
import { desc, sql, gte, eq, and } from 'drizzle-orm';
import { StaffDashboard, ScorecardPayload, User } from '@/components/staff/dashboard';

export default async function StaffPage() {
  const allUsers = await db.query.users.findMany({
    orderBy: desc(users.createdAt),
    with: {
      scorecards: {
        limit: 1,
        orderBy: desc(scorecards.computedAt),
      },
    },
  });

  // Last-event timestamp per user (for "Last seen").
  const lastEventRows = await db
    .select({
      userId: events.userId,
      lastTs: sql<Date>`max(${events.ts})`,
    })
    .from(events)
    .groupBy(events.userId);
  const lastEventByUser = new Map(lastEventRows.map((r) => [r.userId, r.lastTs]));

  // Distinct CLI sources per user.
  const cliRows = await db
    .selectDistinct({ userId: events.userId, source: events.source })
    .from(events);
  const clisByUser = new Map<string, string[]>();
  for (const r of cliRows) {
    if (!clisByUser.has(r.userId)) clisByUser.set(r.userId, []);
    clisByUser.get(r.userId)!.push(r.source);
  }

  // Total spend per user (all-time).
  const spendRows = await db
    .select({
      userId: events.userId,
      total: sql<number>`coalesce(sum(${events.costUsd}::numeric), 0)::float`,
    })
    .from(events)
    .groupBy(events.userId);
  const spendByUser = new Map(spendRows.map((r) => [r.userId, r.total]));

  // Active days in the last 30 days per user.
  const last30 = new Date();
  last30.setDate(last30.getDate() - 30);
  const activeRows = await db
    .select({
      userId: events.userId,
      activeDays: sql<number>`count(distinct date_trunc('day', ${events.ts}))::int`,
    })
    .from(events)
    .where(gte(events.ts, last30))
    .groupBy(events.userId);
  const active30ByUser = new Map(activeRows.map((r) => [r.userId, r.activeDays]));

  // Whether each user has any event in the last 7 days (for status).
  const last7 = new Date();
  last7.setDate(last7.getDate() - 7);
  const recentRows = await db
    .selectDistinct({ userId: events.userId })
    .from(events)
    .where(gte(events.ts, last7));
  const activeIn7d = new Set(recentRows.map((r) => r.userId));

  const typedUsers: User[] = allUsers.map((u) => ({
    id: u.id,
    githubLogin: u.githubLogin,
    email: u.email,
    createdAt: u.createdAt,
    scorecards:
      u.scorecards?.map((s) => ({
        payload: s.payload as ScorecardPayload,
        computedAt: s.computedAt,
      })) || [],
    clis: clisByUser.get(u.id) ?? [],
    spend: spendByUser.get(u.id) ?? 0,
    activeLast30: active30ByUser.get(u.id) ?? 0,
    lastEventTs: lastEventByUser.get(u.id) ?? null,
    inLast7d: activeIn7d.has(u.id),
  }));

  return <StaffDashboard users={typedUsers} />;
}
