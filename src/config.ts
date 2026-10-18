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
  CODEX_ENABLED: z.enum(['true','false']).default('true').transform(v=>v==='true'),
  DEFAULT_MODEL: z.string().optional(),
  CODEX_MODELS: z.string().optional(),
  CODEX_REASONING_EFFORT: effort.default('medium'),
  CODEX_SERVICE_TIER: tier.default('default'),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  MAX_CONCURRENT_REQUESTS: z.coerce.number().int().positive().default(2),
  CODEX_PATH: z.string().optional(),
  CODEX_HOME: z.string().default(join(homedir(), '.harness-relay')),
  CLAUDE_ENABLED: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
  CLAUDE_MODEL: z.string().default('sonnet'),
  CLAUDE_MODELS: z.string().optional(),
  CLAUDE_REASONING_EFFORT: z.enum(['low','medium','high','xhigh','max']).default('medium'),
  CLAUDE_CONFIG_DIR: z.string().default(join(homedir(), '.harness-relay', 'claude')),
  CLAUDE_CREDENTIAL_FILE: z.string().optional(),
  CLAUDE_PATH: z.string().optional(),
  METRICS_TOKEN: z.string().min(16).optional(),
  LOG_LEVEL: z.enum(['silent','fatal','error','warn','info','debug']).default('info'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().positive().default(30000),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const c = envSchema.parse(env);
  if(!c.CODEX_ENABLED && !c.CLAUDE_ENABLED) throw new Error('Enable at least one provider');
  const models = [...new Set((c.CODEX_MODELS ?? c.CODEX_MODEL).split(',').map(x => x.trim()).filter(Boolean))];
  if (!models.includes(c.CODEX_MODEL)) throw new Error('CODEX_MODELS must include CODEX_MODEL');
  const claudeModels = [...new Set((c.CLAUDE_MODELS ?? c.CLAUDE_MODEL).split(',').map(x => x.trim()).filter(Boolean))];
  if (c.CLAUDE_ENABLED && !claudeModels.includes(c.CLAUDE_MODEL)) throw new Error('CLAUDE_MODELS must include CLAUDE_MODEL');
  return { ...c, models, claudeModels, defaultModel:c.DEFAULT_MODEL ?? (c.CODEX_ENABLED?c.CODEX_MODEL:`claude/${c.CLAUDE_MODEL}`),
    claudeCredentialFile: c.CLAUDE_CREDENTIAL_FILE ?? join(c.CLAUDE_CONFIG_DIR, 'inference-credential.json') };
}
export type Config = ReturnType<typeof loadConfig>;
export const CONFIG = Symbol('CONFIG');
