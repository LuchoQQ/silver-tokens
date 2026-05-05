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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
});
