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

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    async jwt({ token, user, profile }) {
      if (profile) {
        const githubId = Number((profile as { id: number }).id);
        if (Number.isNaN(githubId)) {
          return token;
        }

        const existingUser = await db.query.users.findFirst({
          where: eq(users.githubId, githubId),
        });

        if (existingUser) {
          token.id = existingUser.id;
          token.role = existingUser.role;
        } else {
          const [newUser] = await db
            .insert(users)
            .values({
              githubId,
              githubLogin: (profile as { login: string }).login ?? 'unknown',
              email: (user as { email?: string })?.email ?? null,
              role: 'candidate',
            })
            .returning();
          token.id = newUser.id;
          token.role = newUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
});
