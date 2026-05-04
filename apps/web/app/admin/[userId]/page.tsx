import { db } from '@silver-tokens/db';
import { users, scorecards, events } from '@silver-tokens/db/schema';
import { eq, desc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { UserMetrics } from '@/components/admin/user-metrics';

export default async function UserDrilldown({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) notFound();

  const userScorecard = await db.query.scorecards.findFirst({
    where: eq(scorecards.userId, userId),
    orderBy: desc(scorecards.computedAt),
  });

  const userEvents = await db.query.events.findMany({
    where: eq(events.userId, userId),
    orderBy: desc(events.ts),
    limit: 100,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
              &larr; Back to Dashboard
            </Link>
            <h1 className="text-xl font-semibold">{user.githubLogin}</h1>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              user.role === 'staff' || user.role === 'admin'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {user.role}
          </span>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-2">
          <h2 className="text-2xl font-bold">{user.githubLogin}</h2>
          {user.email && <p className="text-muted-foreground">{user.email}</p>}
          <p className="text-sm text-muted-foreground">
            Registered {new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <UserMetrics user={user} scorecard={userScorecard} events={userEvents} />
      </main>
    </div>
  );
}
