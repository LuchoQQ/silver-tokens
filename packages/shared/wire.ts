import { z } from 'zod';

export const safeEventSchema = z.object({
  source: z.enum(['claude_code', 'codex', 'opencode']),
  model: z.string().min(1),
  ts: z.coerce.date(),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  cache_read: z.number().int().min(0).default(0),
  cache_creation: z.number().int().min(0).default(0),
  cost_usd: z.number().min(0).default(0),
  project_hash: z.string().optional(),
  tool_name: z.string().optional(),
  message_id: z.string().optional(),
  request_id: z.string().optional(),
  session_id: z.string().optional(),
  is_subagent: z.boolean().default(false),
});

export type SafeEvent = z.infer<typeof safeEventSchema>;

export const submitUsageSchema = z.object({
  cli: z.enum(['claude_code', 'codex', 'opencode']),
  events: z.array(safeEventSchema).min(1).max(100_000),
});

export type SubmitUsagePayload = z.infer<typeof submitUsageSchema>;
