import { z } from 'zod';
import { effort, tier } from './config.js';

export const chatSchema = z.object({
  model: z.string().min(1).optional(),
  messages: z.array(z.object({
    role: z.enum(['system', 'developer', 'user', 'assistant']),
    content: z.string().max(100000),
  }).strict()).min(1).max(100),
  stream: z.boolean().default(false),
  reasoning_effort: effort.optional(),
  service_tier: tier.optional(),
}).strict();
export type ChatRequest = z.infer<typeof chatSchema>;

// Codex exec takes one prompt. Preserve the transcript explicitly; no persisted thread is reused.
export function promptFor(request: ChatRequest): string {
  return 'Answer the final user message using the conversation below. Return only the assistant answer. Do not use tools.\nConversation (JSON):\n' + JSON.stringify(request.messages);
}
