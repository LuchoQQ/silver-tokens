import { sanitizeJsonl, type SafeEvent } from '@silver-tokens/shared/sanitize';

export function parseCodexJsonl(lines: string[]): SafeEvent[] {
  const events = sanitizeJsonl(lines);
  return events.filter((e) => e.source === 'codex');
}
