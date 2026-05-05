import { auth } from '@/lib/auth';
import { db } from '@silver-tokens/db';
import { tokens, users } from '@silver-tokens/db/schema';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { redirect } from 'next/navigation';
import { OnboardingDashboard } from '@/components/onboarding/dashboard';

export default async function SetupPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/');
  }

  const userId = session.user.id;
  const userRecord = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const githubLogin = userRecord?.githubLogin ?? session.user.name ?? '';
  const userName = session.user.name ?? githubLogin;

  let userToken = await db.query.tokens.findFirst({
    where: eq(tokens.userId, userId),
    orderBy: desc(tokens.createdAt),
  });

  if (!userToken || (userToken.expiresAt && new Date(userToken.expiresAt) < new Date())) {
    const value = randomUUID();
    const [newToken] = await db
      .insert(tokens)
      .values({ userId, value, expiresAt: null })
      .returning();
    userToken = newToken;
  }

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
      tokenExpires={userToken.expiresAt?.toISOString() ?? null}
    />
  );
}
