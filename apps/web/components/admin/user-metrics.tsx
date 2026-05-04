interface ScorecardPayload {
  fluencyPercentile?: number;
  cacheRate?: number;
  modelMix?: Record<string, number>;
  toolDistribution?: Record<string, number>;
  confidence?: string;
}

interface DbUser {
  id: string;
  githubLogin: string;
  email: string | null;
  role: string;
  createdAt: Date;
}

interface DbScorecard {
  payload: ScorecardPayload;
  computedAt: Date;
}

interface DbEvent {
  id: string;
  source: string;
  model: string;
  ts: Date;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheCreation: number;
  costUsd: string;
  toolName: string | null;
}

interface UserMetricsProps {
  user: DbUser;
  scorecard: DbScorecard | null;
  events: DbEvent[];
}

export function UserMetrics({ user, scorecard, events }: UserMetricsProps) {
  const payload = scorecard?.payload;
  const totalCost = events.reduce((sum, e) => sum + parseFloat(e.costUsd), 0);
  const totalTokens = events.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0);
  const sessions = new Set(events.map((e) => e.sessionId).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      {/* Hero metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Fluency Percentile" value={payload?.fluencyPercentile != null ? `${payload.fluencyPercentile}%` : '--'} />
        <MetricCard label="Cache Rate" value={payload?.cacheRate != null ? `${(payload.cacheRate * 100).toFixed(1)}%` : '--'} />
        <MetricCard label="Sessions" value={sessions > 0 ? sessions.toString() : '--'} />
        <MetricCard label="Total Cost" value={events.length > 0 ? `$${totalCost.toFixed(2)}` : '--'} />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard label="Total Tokens" value={totalTokens > 0 ? totalTokens.toLocaleString() : '--'} />
        <MetricCard label="Avg Tokens/Session" value={sessions > 0 ? Math.round(totalTokens / sessions).toLocaleString() : '--'} />
        <MetricCard label="Confidence" value={payload?.confidence ?? '--'} />
      </div>

      {/* Model mix */}
      {payload?.modelMix && Object.keys(payload.modelMix).length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="text-lg font-semibold mb-3">Model Mix</h3>
          <div className="space-y-2">
            {Object.entries(payload.modelMix).map(([model, pct]) => (
              <div key={model} className="flex items-center gap-2">
                <span className="w-32 text-sm truncate" title={model}>{model}</span>
                <div className="flex-1 bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm w-12 text-right font-mono">{pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tool distribution */}
      {payload?.toolDistribution && Object.keys(payload.toolDistribution).length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="text-lg font-semibold mb-3">Tool Distribution</h3>
          <div className="space-y-2">
            {Object.entries(payload.toolDistribution).map(([tool, count]) => (
              <div key={tool} className="flex items-center gap-2">
                <span className="w-32 text-sm truncate" title={tool}>{tool}</span>
                <div className="flex-1 bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: `${(count / events.length) * 100}%` }} />
                </div>
                <span className="text-sm w-12 text-right font-mono">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent events */}
      <div className="rounded-lg border p-4">
        <h3 className="text-lg font-semibold mb-3">Recent Events ({events.length} total)</h3>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">No events uploaded yet.</p>
        ) : (
          <div className="space-y-1 text-sm">
            {events.slice(0, 20).map((event) => (
              <div key={event.id} className="flex items-center gap-4 py-1 border-b last:border-0">
                <span className="w-24 text-xs font-mono">{event.source}</span>
                <span className="w-32 text-xs truncate" title={event.model}>{event.model}</span>
                <span className="w-20 text-xs font-mono">{(event.inputTokens + event.outputTokens).toLocaleString()}</span>
                {event.toolName && <span className="w-24 text-xs">{event.toolName}</span>}
                <span className="text-xs text-muted-foreground">
                  {new Date(event.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
