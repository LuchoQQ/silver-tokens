import { sanitizeJsonl, type SafeEvent } from '@silver-tokens/shared/sanitize';

export function parseClaudeCodeJsonl(lines: string[]): SafeEvent[] {
  const events = sanitizeJsonl(lines);
  return events.filter((e) => {
    if (e.source !== 'claude_code') return false;
    if (!e.message_id || !e.request_id) return false;
    return true;
  });
}
