import { safeEventSchema, type SafeEvent } from './wire';

export function sanitizeJsonlLine(line: string): SafeEvent | null {
  try {
    const raw = JSON.parse(line) as Record<string, unknown>;

    const safe: Record<string, unknown> = {};

    if (typeof raw.source === 'string') safe.source = raw.source;
    if (typeof raw.model === 'string') safe.model = raw.model;
    if (raw.ts !== undefined) safe.ts = raw.ts;
    if (typeof raw.input_tokens === 'number') safe.input_tokens = raw.input_tokens;
    if (typeof raw.output_tokens === 'number') safe.output_tokens = raw.output_tokens;
    if (typeof raw.cache_read === 'number') safe.cache_read = raw.cache_read;
    if (typeof raw.cache_creation === 'number') safe.cache_creation = raw.cache_creation;
    if (typeof raw.cost_usd === 'number') safe.cost_usd = raw.cost_usd;
    if (typeof raw.project_hash === 'string') safe.project_hash = raw.project_hash;
    if (typeof raw.tool_name === 'string') safe.tool_name = raw.tool_name;
    if (typeof raw.message_id === 'string') safe.message_id = raw.message_id;
    if (typeof raw.request_id === 'string') safe.request_id = raw.request_id;
    if (typeof raw.session_id === 'string') safe.session_id = raw.session_id;
    if (typeof raw.is_subagent === 'boolean') safe.is_subagent = raw.is_subagent;

    const result = safeEventSchema.safeParse(safe);
    if (!result.success) return null;
    return result.data;
  } catch {
    return null;
  }
}

export function sanitizeJsonl(lines: string[]): SafeEvent[] {
  const events: SafeEvent[] = [];
  for (const line of lines) {
    const event = sanitizeJsonlLine(line);
    if (event) events.push(event);
  }
  return events;
}
