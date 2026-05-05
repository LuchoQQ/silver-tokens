import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { eq } from 'drizzle-orm';
import { db } from '@silver-tokens/db';
import { users } from '@silver-tokens/db/schema';
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession['user'];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    async jwt({ token, user, profile }) {
      if (profile) {
        const rawProfile = profile as unknown as { id?: number | string; login?: string };
        const githubId = Number(rawProfile.id);
        if (Number.isNaN(githubId)) {
          return token;
        }

        const existingUser = await db.query.users.findFirst({
          where: eq(users.githubId, githubId),
        });

        if (existingUser) {
          token.id = existingUser.id;
          token.role = existingUser.role ?? 'candidate';
        } else {
          const [newUser] = await db
            .insert(users)
            .values({
              githubId,
              githubLogin: rawProfile.login ?? 'unknown',
              email: (user as { email?: string | null })?.email ?? null,
              role: 'candidate',
            })
            .returning();
          token.id = newUser.id;
          token.role = newUser.role ?? 'candidate';
        }
        return token;
      }

      // Revalidate on subsequent calls: if the users row was wiped or removed,
      // the cookie's token.id is stale and would FK-fail on inserts. Drop it
      // so the session becomes unauthenticated and the user re-signs in.
      if (token.id) {
        const stillExists = await db.query.users.findFirst({
          where: eq(users.id, token.id as string),
          columns: { id: true },
        });
        if (!stillExists) {
          delete token.id;
          delete token.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? 'candidate';
      } else if (session.user) {
        // Token was invalidated (user no longer in DB). Force the page guards
        // (`if (!session?.user?.id)`) to treat this as unauthenticated.
        session.user = undefined as unknown as typeof session.user;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
});
