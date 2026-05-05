import Link from 'next/link';

export interface UserScorecardPayload {
  fluencyPercentile?: number;
  cacheRate?: number;
  modelMix?: Record<string, number>;
  toolDistribution?: Record<string, number>;
  confidence?: string;
  sessions?: { totalSessions?: number; avgTokensPerSession?: number };
  activity?: {
    messages?: number;
    totalTokens?: number;
    activeDays?: number;
    currentStreak?: number;
    longestStreak?: number;
    peakHour?: number | null;
    peakHourSource?: 'local' | 'utc';
    favoriteModel?: string | null;
  };
}

export interface UserEvent {
  id: string;
  source: string;
  model: string;
  ts: Date;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number | null;
  cacheCreation: number | null;
  costUsd: string | null;
  toolName: string | null;
  sessionId: string | null;
}

export interface DailyCount {
  day: string;
  count: number;
}

export interface UserDashboardProps {
  user: { id: string; name: string; githubLogin: string; avatarUrl?: string | null };
  payload: UserScorecardPayload | null | undefined;
  events: UserEvent[];
  dailyCounts?: DailyCount[];
  poolSize?: number;
}

const MODEL_COLORS = [
  'oklch(0.65 0.16 35)',
  'oklch(0.7 0.14 45)',
  'oklch(0.55 0.18 30)',
  'oklch(0.65 0.16 145)',
  'oklch(0.65 0.16 260)',
  'oklch(0.6 0.14 200)',
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString();
}

function humanizeCli(src: string): string {
  if (src === 'claude_code') return 'Claude Code';
  if (src === 'codex') return 'Codex';
  if (src === 'opencode') return 'OpenCode';
  return src;
}

function relativeTime(ts: Date | null | undefined): string {
  if (!ts) return '—';
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 14) return '1w ago';
  return `${Math.floor(days / 7)}w ago`;
}

function buildHeatmap(daily: DailyCount[]): { cells: { row: number; col: number; lvl: number }[]; activeLast30: number } {
  const counts = new Map<string, number>();
  for (const d of daily) {
    counts.set(d.day, (counts.get(d.day) ?? 0) + d.count);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // 26 weeks × 7 days, ending today on the last column. Anchor the grid to
  // start on the same weekday so today lands on row=getDay() of the last col.
  const start = new Date(today);
  start.setDate(today.getDate() - (7 * 26 - 1));

  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const cells: { row: number; col: number; lvl: number }[] = [];
  const max = Math.max(1, ...counts.values());

  // Iterate column-major so the heatmap layout (grid-auto-flow: column) renders
  // chronologically left-to-right.
  for (let col = 0; col < 26; col++) {
    for (let row = 0; row < 7; row++) {
      const day = new Date(start);
      day.setDate(start.getDate() + col * 7 + row);
      const v = counts.get(dayKey(day)) ?? 0;
      let lvl = 0;
      if (v > 0) {
        const r = v / max;
        lvl = r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
      }
      cells.push({ row, col, lvl });
    }
  }

  const cutoff = new Date(today);
  cutoff.setDate(today.getDate() - 29);
  let activeLast30 = 0;
  for (const [k, v] of counts) {
    if (v <= 0) continue;
    const d = new Date(`${k}T00:00:00`);
    if (d >= cutoff && d <= today) activeLast30++;
  }

  return { cells, activeLast30 };
}

function Tile({ label, value, sub, featured }: { label: string; value: string; sub?: React.ReactNode; featured?: boolean }) {
  return (
    <div className={`tile ${featured ? 'featured' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="delta">{sub}</div>}
    </div>
  );
}

function Donut({ slices, totalLabel, sublabel }: { slices: { name: string; pct: number; color: string; tokens?: string }[]; totalLabel: string; sublabel: string }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((s, m) => s + m.pct, 0) || 1;
  let offset = 0;
  return (
    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
      <div className="donut">
        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r={r} fill="none" stroke="var(--muted)" strokeWidth="22" />
          {slices.map((m, i) => {
            const len = (m.pct / total) * c;
            const dash = `${len} ${c - len}`;
            const dashOffset = -offset;
            offset += len;
            return (
              <circle
                key={i}
                cx="90"
                cy="90"
                r={r}
                fill="none"
                stroke={m.color}
                strokeWidth="22"
                strokeDasharray={dash}
                strokeDashoffset={dashOffset}
              />
            );
          })}
        </svg>
        <div className="center">
          <div className="big">{totalLabel}</div>
          <div className="lbl">{sublabel}</div>
        </div>
      </div>
      <div className="legend" style={{ flex: 1 }}>
        {slices.map((m, i) => (
          <div key={i} className="item">
            <span className="sw" style={{ background: m.color }}></span>
            <span className="nm">{m.name}</span>
            <span className="v">
              {m.pct.toFixed(0)}%{m.tokens ? ` · ${m.tokens}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ cells }: { cells: { row: number; col: number; lvl: number }[] }) {
  return (
    <div>
      <div className="heatmap">
        {cells.map((cell, i) => (
          <div key={i} className={`cell${cell.lvl ? ` l${cell.lvl}` : ''}`} />
        ))}
      </div>
      <div className="heatmap-foot">
        <span>26 weeks ago</span>
        <div className="scale">
          <span>Less</span>
          <div className="swatch"></div>
          <div className="swatch cell l1"></div>
          <div className="swatch cell l2"></div>
          <div className="swatch cell l3"></div>
          <div className="swatch cell l4"></div>
          <span>More</span>
        </div>
        <span>This week</span>
      </div>
    </div>
  );
}

function PercentileBar({ value, poolSize }: { value: number; poolSize: number }) {
  return (
    <div>
      <div className="pct-axis">
        <span>p0</span>
        <span>p25</span>
        <span>p50</span>
        <span>p75</span>
        <span>p100</span>
      </div>
      <div className="pct-bar">
        <div className="marker" style={{ left: `${value}%` }} data-label={`p${value}`}></div>
      </div>
      <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', marginTop: '1.5rem', lineHeight: 1.5, marginBottom: 0 }}>
        Composite of cache hit rate, model mix entropy, and tool distribution. Compared against{' '}
        <strong style={{ color: 'var(--foreground)' }}>{poolSize} candidates</strong> in the active pool.
      </p>
    </div>
  );
}

function BrandMark() {
  return (
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
  );
}

export function UserDashboard({ user, payload, events, dailyCounts = [], poolSize = 0 }: UserDashboardProps) {
  const cacheRate = payload?.cacheRate ?? 0;
  const cachePct = Math.round(cacheRate * 100);
  const fluency = payload?.fluencyPercentile ?? 0;
  const messages = payload?.activity?.messages ?? events.length;
  const activeDaysTotal = payload?.activity?.activeDays ?? 0;
  const totalTokens = payload?.activity?.totalTokens ?? events.reduce((s, e) => s + e.inputTokens + e.outputTokens, 0);

  const spend30d = events.reduce((s, e) => s + parseFloat(e.costUsd ?? '0'), 0);
  const spendStr = `$${spend30d.toFixed(2)}`;

  const lastUpload = events[0]?.ts;
  const { cells: heatmap, activeLast30 } = buildHeatmap(dailyCounts);

  const modelMixEntries = payload?.modelMix ? Object.entries(payload.modelMix) : [];
  const modelTotal = modelMixEntries.reduce((s, [, v]) => s + v, 0) || 1;
  const modelSlices = modelMixEntries
    .sort((a, b) => b[1] - a[1])
    .map(([name, pct], i) => ({ name, pct, color: MODEL_COLORS[i % MODEL_COLORS.length] }));

  const toolEntries = payload?.toolDistribution ? Object.entries(payload.toolDistribution) : [];
  const toolTotal = toolEntries.reduce((s, [, v]) => s + v, 0) || 1;
  const tools = toolEntries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([name, count]) => ({ name, pct: Math.round((count / toolTotal) * 100) }));

  const sessionMap = new Map<string, { sid: string; ts: Date; turns: number; tokens: number; cache: number; cli: string; model: string }>();
  for (const e of events) {
    if (!e.sessionId) continue;
    const cur = sessionMap.get(e.sessionId);
    const tokens = e.inputTokens + e.outputTokens;
    const cacheTok = (e.cacheRead ?? 0) + (e.cacheCreation ?? 0);
    if (cur) {
      cur.turns += 1;
      cur.tokens += tokens;
      cur.cache += cacheTok;
      if (new Date(e.ts) > cur.ts) cur.ts = new Date(e.ts);
    } else {
      sessionMap.set(e.sessionId, {
        sid: e.sessionId,
        ts: new Date(e.ts),
        turns: 1,
        tokens,
        cache: cacheTok,
        cli: humanizeCli(e.source),
        model: e.model,
      });
    }
  }
  const sessions = Array.from(sessionMap.values())
    .sort((a, b) => b.ts.getTime() - a.ts.getTime())
    .slice(0, 7);

  const firstName = (user.name || user.githubLogin).split(' ')[0];
  const cliCount = new Set(events.map(e => e.source).filter(Boolean)).size;
  const avatarSrc = user.avatarUrl || `https://github.com/${user.githubLogin}.png?size=56`;

  return (
    <div className="app">
      <header className="appbar">
        <Link href="/" className="brand">
          <BrandMark />
        </Link>
        <nav className="nav">
          <Link href="/" className="active">My scorecard</Link>
          <a href="#sessions">Sessions</a>
          <Link href="/setup">Setup</Link>
        </nav>
        <div className="spacer"></div>
        <div className="who">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarSrc} alt="" />
          <span>{user.name || user.githubLogin}</span>
        </div>
      </header>

      <main className="page">
        <div className="page-head">
          <div>
            <h1>Your <span className="accent">scorecard</span></h1>
            <p className="sub">
              Hi {firstName} — here's what we see across {cliCount || '—'} CLIs over the last 30 days.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Last upload</span>
            <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>{relativeTime(lastUpload)}</span>
            <a href="/api/me/export" download className="btn btn--outline btn--sm">Export</a>
          </div>
        </div>

        <div className="tiles">
          <Tile
            label="Cache hit rate"
            value={`${cachePct}%`}
            sub={<span>fluency p{fluency}</span>}
            featured
          />
          <Tile
            label="Total turns · 30d"
            value={messages.toLocaleString()}
            sub={<span>{formatTokens(totalTokens)} tokens</span>}
          />
          <Tile
            label="Active days · 30d"
            value={`${activeLast30} / 30`}
            sub={
              payload?.activity?.currentStreak != null ? (
                <span>🔥 {payload.activity.currentStreak}-day streak</span>
              ) : undefined
            }
          />
          <Tile
            label="API-equiv · 30d"
            value={spendStr}
            sub={
              activeLast30 > 0 ? <span>${(spend30d / activeLast30).toFixed(2)} / active day</span> : undefined
            }
          />
        </div>

        <div className="cols" style={{ marginBottom: 12 }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Activity</h3>
              <span className="meta">{activeDaysTotal} days total · {messages.toLocaleString()} turns</span>
            </div>
            <Heatmap cells={heatmap} />
          </div>
          <div className="panel">
            <div className="panel-head">
              <h3>Where you sit</h3>
              <span className="meta">vs pool · n={poolSize}</span>
            </div>
            <PercentileBar value={fluency} poolSize={poolSize} />
            <hr className="divider" style={{ margin: '20px 0' }} />
            <div className="legend">
              <div className="item">
                <span className="sw" style={{ background: 'var(--foreground)' }}></span>
                <span className="nm">Cache hit rate</span>
                <span className="v">{cachePct}%</span>
              </div>
              {payload?.activity?.favoriteModel && (
                <div className="item">
                  <span className="sw" style={{ background: 'oklch(0.65 0.16 145)' }}></span>
                  <span className="nm">Favorite model</span>
                  <span className="v">{payload.activity.favoriteModel}</span>
                </div>
              )}
              {payload?.confidence && (
                <div className="item">
                  <span className="sw" style={{ background: 'oklch(0.65 0.16 260)' }}></span>
                  <span className="nm">Confidence</span>
                  <span className="v">{payload.confidence}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="cols" style={{ marginBottom: 12 }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Model mix</h3>
              <span className="meta">tokens, last 30d</span>
            </div>
            {modelSlices.length > 0 ? (
              <Donut
                slices={modelSlices.map(s => ({ ...s, pct: (s.pct / modelTotal) * 100 }))}
                totalLabel={formatTokens(totalTokens)}
                sublabel="tokens · 30d"
              />
            ) : (
              <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>No model data yet.</p>
            )}
          </div>
          <div className="panel">
            <div className="panel-head">
              <h3>Tool distribution</h3>
              <span className="meta">share of tool calls</span>
            </div>
            {tools.length > 0 ? (
              <div className="barlist">
                {tools.map((t, i) => (
                  <div key={i}>
                    <div className="row-grid">
                      <span className="name">{t.name}</span>
                      <span className="pct">{t.pct}%</span>
                    </div>
                    <div className="bar-track" style={{ marginTop: 4 }}>
                      <div className="bar-fill" style={{ width: `${Math.min(100, t.pct * 3)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>No tool data yet.</p>
            )}
          </div>
        </div>

        <div className="panel" id="sessions">
          <div className="panel-head">
            <h3>Recent sessions</h3>
            <span className="meta">{sessions.length} of {sessionMap.size}</span>
          </div>
          {sessions.length > 0 ? (
            <div className="session-list">
              {sessions.map((s, i) => (
                <div key={i} className="session">
                  <span className="when">{relativeTime(s.ts)}</span>
                  <span className="label">
                    {s.sid.slice(0, 8)}
                    <span className="cli">{s.cli}</span>
                  </span>
                  <span className="nums">{s.turns} turns · {formatTokens(s.tokens)}</span>
                  <span className="grade">cache {s.tokens > 0 ? `${Math.round((s.cache / (s.tokens + s.cache)) * 100)}%` : '—'}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>No sessions yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
