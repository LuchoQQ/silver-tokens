import { db } from '@silver-tokens/db';
import { users, scorecards } from '@silver-tokens/db/schema';
import { desc } from 'drizzle-orm';
import { UserTable } from '@/components/admin/user-table';

export default async function AdminDashboard() {
  const allUsers = await db.query.users.findMany({
    orderBy: desc(users.createdAt),
    with: {
      scorecards: {
        limit: 1,
        orderBy: desc(scorecards.computedAt),
      },
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Silver Tokens — Staff Dashboard</h1>
          <a href="/me" className="text-sm text-muted-foreground hover:text-foreground">
            Back to My Token
          </a>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Candidates</h2>
          <p className="text-muted-foreground">
            {allUsers.length} user{allUsers.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        <UserTable users={allUsers} />
      </main>
    </div>
  );
}
