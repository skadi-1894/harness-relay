import { z } from 'zod';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const effort = z.enum(['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
export const tier = z.enum(['default', 'fast', 'priority']);
const envSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  INFERENCE_API_KEY: z.string().min(16),
  CODEX_MODEL: z.string().min(1).default('gpt-6.1-sol'),
  CODEX_MODELS: z.string().optional(),
  CODEX_REASONING_EFFORT: effort.default('medium'),
  CODEX_SERVICE_TIER: tier.default('default'),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  MAX_CONCURRENT_REQUESTS: z.coerce.number().int().positive().default(2),
  CODEX_PATH: z.string().optional(),
  CODEX_HOME: z.string().default(join(homedir(), '.harness-relay')),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const c = envSchema.parse(env);
  const models = [...new Set((c.CODEX_MODELS ?? c.CODEX_MODEL).split(',').map(x => x.trim()).filter(Boolean))];
  if (!models.includes(c.CODEX_MODEL)) throw new Error('CODEX_MODELS must include CODEX_MODEL');
  return { ...c, models };
}
export type Config = ReturnType<typeof loadConfig>;
export const CONFIG = Symbol('CONFIG');
