import { auth, signIn } from '@/lib/auth';
import { db } from '@silver-tokens/db';
import { tokens, scorecards, events } from '@silver-tokens/db/schema';
import { eq, desc } from 'drizzle-orm';
import Link from 'next/link';
import { randomUUID } from 'crypto';
import { UserMetrics } from '@/components/admin/user-metrics';

export default async function MePage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Sign in required</h1>
          <form
            action={async () => {
              'use server';
              await signIn('github', { redirectTo: '/me' });
            }}
          >
            <button type="submit" className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Sign in with GitHub
            </button>
          </form>
        </div>
      </div>
    );
  }

  let userToken = await db.query.tokens.findFirst({
    where: eq(tokens.userId, session.user.id),
    orderBy: desc(tokens.createdAt),
  });

  if (!userToken || new Date(userToken.expiresAt) < new Date()) {
    const value = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const [newToken] = await db
      .insert(tokens)
      .values({
        userId: session.user.id,
        value,
        expiresAt,
      })
      .returning();
    userToken = newToken;
  }

  const userScorecard = await db.query.scorecards.findFirst({
    where: eq(scorecards.userId, session.user.id),
    orderBy: desc(scorecards.computedAt),
  });

  const userEvents = await db.query.events.findMany({
    where: eq(events.userId, session.user.id),
    orderBy: desc(events.ts),
    limit: 100,
  });

  const mcpUrl = `${process.env.NEXT_PUBLIC_MCP_URL || 'https://mcp.silver.dev'}/u/${userToken.value}`;
  const mcpCommand = `claude mcp add --transport http silver ${mcpUrl}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">My Token</h1>
          <div className="flex items-center gap-4">
            {session.user.role === 'staff' || session.user.role === 'admin' ? (
              <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
                Staff Dashboard
              </Link>
            ) : null}
            <span className="text-sm text-muted-foreground">{session.user.name}</span>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {userScorecard ? (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4">Your Scorecard</h2>
            <UserMetrics
              user={{
                id: session.user.id,
                githubLogin: session.user.name ?? '',
                email: session.user.email ?? null,
                role: session.user.role ?? 'candidate',
                createdAt: new Date(),
              }}
              scorecard={userScorecard}
              events={userEvents}
            />
          </section>
        ) : (
          <div className="mb-8 p-4 rounded-lg border bg-muted">
            <h2 className="font-semibold mb-1">No data yet</h2>
            <p className="text-sm text-muted-foreground">
              Run <code className="font-mono">/mcp__silver__track</code> in Claude Code to generate your first scorecard.
            </p>
          </div>
        )}

        <div className="space-y-6 max-w-2xl">
          <div>
            <h2 className="text-lg font-semibold mb-2">Step 1: Add MCP to your CLI</h2>
            <p className="text-sm text-muted-foreground mb-2">
              Run this command in your terminal:
            </p>
            <div className="rounded-md border bg-muted p-3 font-mono text-sm">
              {mcpCommand}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Step 2: Track your usage</h2>
            <p className="text-sm text-muted-foreground mb-2">
              Open Claude Code and type:
            </p>
            <div className="rounded-md border bg-muted p-3 font-mono text-sm">
              /mcp__silver__track
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Your Token</h2>
            <p className="text-sm text-muted-foreground mb-2">
              Expires: {new Date(userToken.expiresAt).toLocaleString()}
              {userToken.usedAt ? ` | Used: ${new Date(userToken.usedAt).toLocaleString()}` : ' | Not yet used'}
            </p>
            <div className="rounded-md border bg-muted p-3 font-mono text-sm break-all">
              {userToken.value}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
