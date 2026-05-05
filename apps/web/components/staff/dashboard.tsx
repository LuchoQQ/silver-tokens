'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface ScorecardPayload {
  fluencyPercentile?: number;
  cacheRate?: number;
  modelMix?: Record<string, number>;
  toolDistribution?: Record<string, number>;
  confidence?: string;
  activity?: {
    messages?: number;
    activeDays?: number;
    favoriteModel?: string | null;
  };
}

export interface User {
  id: string;
  githubLogin: string;
  email: string | null;
  createdAt: Date;
  scorecards: Array<{
    payload: ScorecardPayload;
    computedAt: Date;
  }>;
  clis: string[];
  spend: number;
  activeLast30: number;
  lastEventTs: Date | null;
  inLast7d: boolean;
}

function humanizeCli(src: string): string {
  if (src === 'claude_code') return 'Claude Code';
  if (src === 'codex') return 'Codex';
  if (src === 'opencode') return 'OpenCode';
  return src;
}

interface StaffDashboardProps {
  users: User[];
}

function CliChips({ clis }: { clis: (string | null)[] }) {
  return (
    <div className="cli-chips">
      {clis.filter(Boolean).map((c, i) => {
        const cli = c!.toLowerCase();
        const cls = cli.includes('claude') ? 'claude'
          : cli.includes('codex') ? 'codex'
          : cli.includes('open') ? 'opencode'
          : '';
        return <span key={i} className={`cli-chip ${cls}`}>{c}</span>;
      })}
    </div>
  );
}

function ScoreCell({ value }: { value: number }) {
  return (
    <div className="score-cell">
      <div className="score-bar"><div className="fill" style={{ width: `${value}%` }}></div></div>
      <span className="score-num">{value}</span>
    </div>
  );
}

function Tile({ label, value, sub, featured }: { label: string; value: string | number; sub?: string; featured?: boolean }) {
  return (
    <div className={`tile ${featured ? 'featured' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="delta">{sub}</div>}
    </div>
  );
}

export function StaffDashboard({ users: initialUsers }: StaffDashboardProps) {
  const [search, setSearch] = useState('');

  const candidates = initialUsers.map(u => {
    const scorecard = u.scorecards[0];
    const payload = scorecard?.payload as ScorecardPayload | undefined;

    const totalTurns = payload?.activity?.messages ?? 0;
    const favoriteModel = payload?.activity?.favoriteModel ?? 'Unknown';
    const cacheRate = payload?.cacheRate ?? 0;

    const now = new Date();
    let lastSeen = 'Never';
    if (u.lastEventTs) {
      const diffMs = now.getTime() - new Date(u.lastEventTs).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      if (diffMins < 60) lastSeen = `${Math.max(diffMins, 1)}m ago`;
      else if (diffHours < 24) lastSeen = `${diffHours}h ago`;
      else if (diffDays === 1) lastSeen = 'Yesterday';
      else if (diffDays < 7) lastSeen = `${diffDays}d ago`;
      else if (diffDays < 14) lastSeen = '1w ago';
      else lastSeen = `${Math.floor(diffDays / 7)}w ago`;
    }

    return {
      id: u.id,
      name: u.githubLogin,
      gh: u.githubLogin,
      img: u.id.charCodeAt(0) % 70,
      fluency: payload?.fluencyPercentile || 0,
      cache: cacheRate,
      turns: totalTurns,
      days: `${Math.min(u.activeLast30, 30)}/30`,
      clis: u.clis.map(humanizeCli),
      fav: favoriteModel,
      cost: u.spend,
      last: lastSeen,
      status: u.inLast7d ? 'active' : totalTurns > 0 ? 'stale' : 'cold',
    };
  });

  const filtered = search
    ? candidates.filter(c => 
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.gh.toLowerCase().includes(search.toLowerCase())
      )
    : candidates;

  const sorted = [...filtered].sort((a, b) => b.fluency - a.fluency);

  const total = candidates.length;
  const active = candidates.filter(c => c.status === 'active').length;
  const cacheValues = candidates.map(c => c.cache).filter(c => c > 0);
  const medianCache = cacheValues.length > 0
    ? Math.round(cacheValues.sort((a, b) => a - b)[Math.floor(cacheValues.length / 2)] * 100)
    : 0;
  const totalSpend = candidates.reduce((s, c) => s + c.cost, 0);
  const fluencyValues = candidates.map(c => c.fluency).filter(f => f > 0);
  const medianFluency = fluencyValues.length > 0
    ? Math.round(fluencyValues.sort((a, b) => a - b)[Math.floor(fluencyValues.length / 2)])
    : 0;

  return (
    <div className="app">
      <header className="appbar">
        <Link href="/" className="brand">
          <svg viewBox="100 105 796 150" width={120} height={22} aria-label="Silver.dev">
            <path fill="currentColor" d="m167.73 244.79-67.12-27.25v10.29l67.12 27.25z"/>
            <path fill="currentColor" d="m170.4 244.43v10.3l107.67-107.16v-10.41z"/>
            <path fill="currentColor" d="m236.44 173.68-47.78-47.59-2.83 2.82 48.45 48.27 43.79-43.63-68.76-28.03-18.3 18.23z"/>
            <path fill="currentColor" d="m209.58 201.78 13.11-13.05-48.45-48.27-13.11 13.05z"/>
            <path fill="currentColor" d="m139.53 180.92 45.5 45.33 5.22-5.21-48.45-48.27-41.19 41.04 68.76 28.04 13.43-13.38z"/>
            <path fill="currentColor" d="m369.34 145.1c-.42.71-.88 1.24-1.38 1.59-.49.35-1.1.53-1.8.53-.8 0-1.74-.4-2.83-1.2-1.08-.8-2.44-1.68-4.06-2.65-1.62-.96-3.58-1.85-5.87-2.65s-5.05-1.2-8.3-1.2c-3.06 0-5.76.41-8.09 1.24s-4.29 1.94-5.87 3.36c-1.58 1.41-2.77 3.07-3.57 4.98s-1.2 3.97-1.2 6.18c0 2.83.69 5.17 2.08 7.03s3.23 3.45 5.51 4.77 4.88 2.46 7.77 3.43c2.9.97 5.87 1.97 8.9 3 3.04 1.04 6.01 2.2 8.9 3.5 2.9 1.3 5.49 2.93 7.77 4.91s4.12 4.41 5.51 7.28 2.08 6.41 2.08 10.6c0 4.43-.75 8.59-2.26 12.47-1.51 3.89-3.71 7.27-6.61 10.14s-6.46 5.14-10.67 6.78c-4.22 1.65-9.01 2.47-14.38 2.47-6.6 0-12.58-1.19-17.95-3.57s-9.96-5.59-13.78-9.65l3.96-6.5c.38-.52.84-.95 1.38-1.31.54-.35 1.14-.53 1.8-.53.61 0 1.31.25 2.08.74.78.49 1.66 1.12 2.65 1.87s2.12 1.58 3.39 2.47c1.27.9 2.72 1.72 4.35 2.47 1.62.75 3.47 1.38 5.55 1.87 2.07.49 4.4.74 7 .74 3.25 0 6.15-.45 8.69-1.34s4.7-2.16 6.47-3.78 3.12-3.57 4.06-5.83 1.41-4.78 1.41-7.56c0-3.06-.7-5.57-2.08-7.53-1.39-1.95-3.22-3.59-5.48-4.91s-4.85-2.44-7.77-3.36-5.89-1.86-8.9-2.83c-3.02-.97-5.98-2.08-8.9-3.36-2.92-1.27-5.51-2.92-7.77-4.95-2.26-2.02-4.09-4.56-5.48-7.6s-2.08-6.79-2.08-11.27c0-3.58.69-7.04 2.08-10.39 1.39-3.34 3.42-6.31 6.08-8.9s5.94-4.66 9.82-6.22 8.35-2.33 13.39-2.33c5.65 0 10.8.9 15.44 2.69s8.73 4.38 12.26 7.77l-3.32 6.5z"/>
            <path fill="currentColor" d="m406.59 136.47c0 1.23-.25 2.37-.74 3.43s-1.15 2-1.98 2.83-1.79 1.47-2.9 1.94-2.27.71-3.5.71-2.37-.24-3.43-.71-1.99-1.12-2.79-1.94-1.44-1.77-1.91-2.83-.71-2.2-.71-3.43.24-2.39.71-3.5 1.11-2.07 1.91-2.9c.8-.82 1.73-1.47 2.79-1.94s2.2-.71 3.43-.71 2.39.24 3.5.71 2.07 1.12 2.9 1.94c.82.82 1.48 1.79 1.98 2.9.49 1.11.74 2.27.74 3.5zm-2.69 22.48v71.59h-12.58v-71.59z"/>
            <path fill="currentColor" d="m437.54 126.44v104.09h-12.58v-104.09z"/>
            <path fill="currentColor" d="m519.23 158.95-29.19 71.59h-11.31l-29.19-71.59h10.25c1.04 0 1.88.26 2.54.78s1.11 1.13 1.34 1.84l18.16 46.08c.57 1.74 1.06 3.44 1.48 5.09s.82 3.3 1.2 4.95c.38-1.65.78-3.3 1.2-4.95s.94-3.34 1.55-5.09l18.37-46.08c.28-.75.75-1.38 1.41-1.87s1.44-.74 2.33-.74h9.82z"/>
            <path fill="currentColor" d="m586.93 220.5c-1.55 1.88-3.42 3.52-5.58 4.91-2.17 1.39-4.49 2.53-6.96 3.43s-5.03 1.57-7.67 2.01c-2.64.45-5.25.67-7.84.67-4.95 0-9.5-.84-13.67-2.51s-7.77-4.12-10.81-7.35-5.41-7.22-7.1-11.98c-1.7-4.76-2.54-10.22-2.54-16.4 0-4.99.77-9.66 2.3-13.99s3.73-8.09 6.61-11.27c2.87-3.18 6.38-5.68 10.53-7.49s8.81-2.72 13.99-2.72c4.29 0 8.26.72 11.91 2.16s6.81 3.51 9.47 6.22 4.75 6.05 6.25 10.03c1.51 3.98 2.26 8.52 2.26 13.6 0 1.98-.21 3.3-.64 3.96-.42.66-1.23.99-2.4.99h-47.84c.14 4.52.77 8.46 1.87 11.8 1.11 3.35 2.65 6.14 4.63 8.37 1.98 2.24 4.33 3.91 7.07 5.02 2.73 1.11 5.79 1.66 9.19 1.66 3.16 0 5.88-.36 8.16-1.1 2.28-.73 4.25-1.52 5.9-2.37s3.03-1.64 4.13-2.37c1.11-.73 2.06-1.1 2.86-1.1 1.04 0 1.84.4 2.4 1.2l3.53 4.59zm-10.18-33.57c0-2.92-.41-5.59-1.24-8.02s-2.03-4.52-3.6-6.29c-1.58-1.77-3.5-3.13-5.76-4.1-2.26-.96-4.83-1.45-7.7-1.45-6.03 0-10.8 1.76-14.31 5.26s-5.69 8.37-6.54 14.59h39.15z"/>
            <path fill="currentColor" d="m615.41 173.29c2.26-4.9 5.04-8.73 8.34-11.48 3.3-2.76 7.33-4.13 12.08-4.13 1.51 0 2.96.17 4.35.5s2.63.85 3.71 1.55l-.92 9.4c-.28 1.18-.99 1.77-2.12 1.77-.66 0-1.63-.14-2.9-.42s-2.71-.42-4.31-.42c-2.26 0-4.28.33-6.04.99-1.77.66-3.35 1.64-4.73 2.93-1.39 1.3-2.64 2.9-3.75 4.81s-2.11 4.09-3 6.54v45.23h-12.65v-71.59h7.21c1.37 0 2.31.26 2.83.78s.87 1.41 1.06 2.69l.85 10.88z"/>
            <path fill="currentColor" d="m647.21 222.76c0-1.22.22-2.38.67-3.46s1.06-2.02 1.84-2.83c.78-.8 1.71-1.44 2.79-1.91s2.24-.71 3.46-.71 2.38.24 3.46.71 2.03 1.11 2.83 1.91 1.44 1.74 1.91 2.83c.47 1.08.71 2.24.71 3.46s-.24 2.44-.71 3.5-1.11 1.99-1.91 2.79-1.74 1.43-2.83 1.87c-1.08.45-2.24.67-3.46.67s-2.38-.22-3.46-.67-2.01-1.07-2.79-1.87-1.39-1.73-1.84-2.79-.67-2.23-.67-3.5z"/>
            <path fill="currentColor" d="m741.9 126.44v104.09h-7.49c-1.79 0-2.92-.87-3.39-2.61l-1.13-8.69c-3.06 3.67-6.55 6.64-10.46 8.9s-8.43 3.39-13.57 3.39c-4.1 0-7.82-.79-11.17-2.37s-6.2-3.9-8.55-6.96c-2.36-3.06-4.17-6.88-5.44-11.45s-1.91-9.82-1.91-15.76c0-5.28.71-10.19 2.12-14.73 1.41-4.55 3.44-8.49 6.08-11.84 2.64-3.34 5.88-5.97 9.72-7.88s8.16-2.86 12.97-2.86c4.38 0 8.14.74 11.27 2.23 3.13 1.48 5.92 3.55 8.37 6.18v-39.64zm-12.58 49.54c-2.36-3.16-4.9-5.36-7.63-6.61s-5.79-1.87-9.19-1.87c-6.64 0-11.75 2.38-15.33 7.14s-5.37 11.54-5.37 20.35c0 4.66.4 8.66 1.2 11.98s1.98 6.05 3.53 8.2c1.55 2.14 3.46 3.71 5.72 4.7s4.83 1.48 7.7 1.48c4.15 0 7.76-.94 10.85-2.83 3.08-1.88 5.92-4.55 8.52-7.99v-34.56z"/>
            <path fill="currentColor" d="m819.92 220.5c-1.55 1.88-3.42 3.52-5.58 4.91-2.17 1.39-4.49 2.53-6.96 3.43s-5.03 1.57-7.67 2.01c-2.64.45-5.25.67-7.84.67-4.95 0-9.5-.84-13.67-2.51s-7.77-4.12-10.81-7.35-5.41-7.22-7.1-11.98c-1.7-4.76-2.54-10.22-2.54-16.4 0-4.99.77-9.66 2.3-13.99s3.73-8.09 6.61-11.27c2.87-3.18 6.38-5.68 10.53-7.49s8.81-2.72 13.99-2.72c4.29 0 8.26.72 11.91 2.16s6.81 3.51 9.47 6.22 4.75 6.05 6.25 10.03c1.51 3.98 2.26 8.52 2.26 13.6 0 1.98-.21 3.3-.64 3.96-.42.66-1.23.99-2.4.99h-47.84c.14 4.52.77 8.46 1.87 11.8 1.11 3.35 2.65 6.14 4.63 8.37 1.98 2.24 4.33 3.91 7.07 5.02 2.73 1.11 5.79 1.66 9.19 1.66 3.16 0 5.88-.36 8.16-1.1 2.28-.73 4.25-1.52 5.9-2.37s3.03-1.64 4.13-2.37c1.11-.73 2.06-1.1 2.86-1.1 1.04 0 1.84.4 2.4 1.2l3.53 4.59zm-10.18-33.57c0-2.92-.41-5.59-1.24-8.02s-2.03-4.52-3.6-6.29c-1.58-1.77-3.5-3.13-5.76-4.1-2.26-.96-4.83-1.45-7.7-1.45-6.03 0-10.8 1.76-14.31 5.26s-5.69 8.37-6.54 14.59h39.15z"/>
            <path fill="currentColor" d="m896.24 158.95-29.19 71.59h-11.31l-29.19-71.59h10.25c1.04 0 1.88.26 2.54.78s1.11 1.13 1.34 1.84l18.16 46.08c.57 1.74 1.06 3.44 1.48 5.09s.82 3.3 1.2 4.95c.38-1.65.78-3.3 1.2-4.95s.94-3.34 1.55-5.09l18.37-46.08c.28-.75.75-1.38 1.41-1.87s1.44-.74 2.33-.74h9.82z"/>
          </svg>
        </Link>
        <nav className="nav">
          <a href="#" className="active">Candidates</a>
          <a href="#">Pool stats</a>
          <a href="#">Settings</a>
        </nav>
        <div className="spacer"></div>
        <div className="who">
          <img src="https://i.pravatar.cc/56?img=33" alt="" />
          <span>Gabriel Benmergui</span>
          <span className="role-badge">Staff</span>
        </div>
      </header>

      <main className="page">
        <div className="page-head">
          <div>
            <h1>For <span className="accent">Companies</span></h1>
            <p className="sub">{total} candidates with uploaded telemetry · {active} active in last 7 days · pool median fluency p50 = {medianFluency}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--outline btn--sm">Export CSV</button>
            <button className="btn btn--default btn--sm">Invite candidate</button>
          </div>
        </div>

        <div className="tiles">
          <Tile label="Candidates" value={total} sub={`${active} active · ${total - active} stale`} />
          <Tile label="Active today" value="14" sub="↑ 3 vs yesterday" />
          <Tile label="Pool cache median" value={medianCache + "%"} sub="p25=78 · p75=92" featured />
          <Tile label="Pool spend · 30d" value={"$" + totalSpend.toFixed(0)} sub="across all candidates" />
        </div>

        <div className="table-wrap">
          <div className="table-toolbar">
            <div className="search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted-foreground)' }}>
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.3-4.3"/>
              </svg>
              <input 
                type="text" 
                placeholder="Search by name, GitHub handle, email…" 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="kbd">⌘K</span>
            </div>
            <div className="filter">
              All CLIs <span className="caret">▾</span>
            </div>
            <div className="filter">
              Active in last 7d <span className="caret">▾</span>
            </div>
            <div className="filter">
              Sort: Fluency ↓ <span className="caret">▾</span>
            </div>
            <span className="count">{sorted.length} of {total}</span>
          </div>
          <table className="candidates">
            <thead>
              <tr>
                <th>Candidate</th>
                <th className="num sorted">Fluency ↓</th>
                <th className="num">Cache</th>
                <th className="num">Turns</th>
                <th className="num">Active</th>
                <th>CLIs</th>
                <th>Favorite model</th>
                <th className="num">Spend</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/${c.id}`} className="who-cell">
                      <img src={`https://i.pravatar.cc/56?img=${c.img}`} alt="" />
                      <div>
                        <div className="nm">{c.name}</div>
                        <div className="gh">@{c.gh}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="num"><ScoreCell value={c.fluency} /></td>
                  <td className="num">{Math.round(c.cache * 100)}%</td>
                  <td className="num">{c.turns.toLocaleString()}</td>
                  <td className="num">{c.days}</td>
                  <td><CliChips clis={c.clis} /></td>
                  <td>{c.fav}</td>
                  <td className="num">${c.cost.toFixed(2)}</td>
                  <td>
                    <span className={`status-dot ${c.status}`}></span>
                    {c.last}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}