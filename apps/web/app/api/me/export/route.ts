import { auth } from '@/lib/auth';
import { db } from '@silver-tokens/db';
import { events, scorecards, users } from '@silver-tokens/db/schema';
import { desc, eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  const [user, userEvents, userScorecards] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db.query.events.findMany({
      where: eq(events.userId, userId),
      orderBy: desc(events.ts),
    }),
    db.query.scorecards.findMany({
      where: eq(scorecards.userId, userId),
      orderBy: desc(scorecards.computedAt),
    }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    user: user
      ? {
          id: user.id,
          githubLogin: user.githubLogin,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        }
      : null,
    scorecards: userScorecards,
    events: userEvents,
  };

  const filename = `silver-tokens-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
