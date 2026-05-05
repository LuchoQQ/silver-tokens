import { auth, signIn } from '@/lib/auth';
import { db } from '@silver-tokens/db';
import { tokens, scorecards, events, users } from '@silver-tokens/db/schema';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { OnboardingDashboard } from '@/components/onboarding/dashboard';
import { UserDashboard, UserScorecardPayload, UserEvent, DailyCount } from '@/components/user/dashboard';

export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.id) {
    const signInWithGitHub = async () => {
      'use server';
      await signIn('github', { redirectTo: '/' });
    };
    return <OnboardingDashboard signInAction={signInWithGitHub} />;
  }

  const userId = session.user.id;
  const userRecord = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const githubLogin = userRecord?.githubLogin ?? session.user.name ?? '';
  const userName = session.user.name ?? githubLogin;

  let userToken = await db.query.tokens.findFirst({
    where: eq(tokens.userId, userId),
    orderBy: desc(tokens.createdAt),
  });

  if (!userToken || new Date(userToken.expiresAt) < new Date()) {
    const value = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const [newToken] = await db
      .insert(tokens)
      .values({ userId, value, expiresAt })
      .returning();
    userToken = newToken;
  }

  const userScorecard = await db.query.scorecards.findFirst({
    where: eq(scorecards.userId, userId),
    orderBy: desc(scorecards.computedAt),
  });

  if (!userScorecard) {
    const mcpUrl = `${process.env.NEXT_PUBLIC_MCP_URL || 'https://mcp.silver.dev'}/u/${userToken.value}`;
    const mcpCommand = `claude mcp add --transport http silver ${mcpUrl}`;
    return (
      <OnboardingDashboard
        user={{
          name: userName,
          handle: githubLogin,
          avatar: session.user.image ?? `https://github.com/${githubLogin}.png?size=56`,
        }}
        mcpCommand={mcpCommand}
        token={userToken.value}
        tokenExpires={userToken.expiresAt.toISOString()}
      />
    );
  }

  const userEvents = await db.query.events.findMany({
    where: eq(events.userId, userId),
    orderBy: desc(events.ts),
    limit: 100,
  });

  // 26 weeks of daily counts for the heatmap. Aggregated server-side so we
  // don't need to ship every event to the client.
  const heatmapStart = new Date();
  heatmapStart.setHours(0, 0, 0, 0);
  heatmapStart.setDate(heatmapStart.getDate() - (7 * 26 - 1));
  const dailyRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${events.ts}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(events)
    .where(and(eq(events.userId, userId), gte(events.ts, heatmapStart)))
    .groupBy(sql`date_trunc('day', ${events.ts})`);
  const dailyCounts: DailyCount[] = dailyRows.map((r) => ({ day: r.day, count: r.count }));

  const [{ count: poolCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);

  const typedEvents: UserEvent[] = userEvents.map((e) => ({
    id: e.id,
    source: e.source,
    model: e.model,
    ts: e.ts,
    inputTokens: e.inputTokens,
    outputTokens: e.outputTokens,
    cacheRead: e.cacheRead,
    cacheCreation: e.cacheCreation,
    costUsd: e.costUsd,
    toolName: e.toolName,
    sessionId: e.sessionId,
  }));

  return (
    <UserDashboard
      user={{
        id: userId,
        name: userName,
        githubLogin,
        avatarUrl: session.user.image ?? null,
      }}
      payload={userScorecard.payload as UserScorecardPayload}
      events={typedEvents}
      dailyCounts={dailyCounts}
      poolSize={poolCount}
    />
  );
}
