import { sanitizeJsonl, type SafeEvent } from '@silver-tokens/shared/sanitize';

export function parseOpenCodeJsonl(lines: string[]): SafeEvent[] {
  const events = sanitizeJsonl(lines);
  return events.filter((e) => e.source === 'opencode');
}
