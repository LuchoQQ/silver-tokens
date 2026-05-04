'use client';

import Link from 'next/link';

interface ScorecardPayload {
  fluencyPercentile?: number;
  cacheRate?: number;
  modelMix?: Record<string, number>;
  toolDistribution?: Record<string, number>;
  confidence?: string;
}

interface UserRow {
  id: string;
  githubLogin: string;
  email: string | null;
  role: string;
  createdAt: Date;
  scorecards: Array<{
    payload: ScorecardPayload;
    computedAt: Date;
  }>;
}

export function UserTable({ users }: { users: UserRow[] }) {
  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-3 text-left font-medium text-sm">User</th>
            <th className="p-3 text-left font-medium text-sm">Role</th>
            <th className="p-3 text-left font-medium text-sm">Fluency %</th>
            <th className="p-3 text-left font-medium text-sm">Confidence</th>
            <th className="p-3 text-left font-medium text-sm">Last Updated</th>
            <th className="p-3 text-left font-medium text-sm">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 && (
            <tr>
              <td colSpan={6} className="p-8 text-center text-muted-foreground">
                No users yet. Candidates will appear here after signing in.
              </td>
            </tr>
          )}
          {users.map((user) => {
            const scorecard = user.scorecards[0];
            const payload = scorecard?.payload;
            const fluency = payload?.fluencyPercentile;
            const confidence = payload?.confidence;
            return (
              <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="p-3">
                  <div className="font-medium">{user.githubLogin}</div>
                  {user.email && (
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                  )}
                </td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.role === 'staff' || user.role === 'admin'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="p-3">
                  {fluency != null ? (
                    <span className="font-mono font-medium">{fluency}%</span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>
                <td className="p-3">
                  {confidence ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        confidence === 'flagged'
                          ? 'bg-red-100 text-red-700'
                          : confidence === 'high'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {confidence}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {scorecard
                    ? new Date(scorecard.computedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Never'}
                </td>
                <td className="p-3">
                  <Link
                    href={`/admin/${user.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    View Details
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
