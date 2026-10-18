// Adapted from NanoClaw .claude/skills/add-iron-proxy/scripts/auth.ts (suppliedCredential).
// Copyright (c) 2026 Gavriel. MIT; see licenses/NanoClaw-MIT.txt and THIRD_PARTY_NOTICES.md.
export function suppliedCredential(env: NodeJS.ProcessEnv = process.env): {
  secret: string; authEnv: 'ANTHROPIC_API_KEY' | 'CLAUDE_CODE_OAUTH_TOKEN';
} | undefined {
  const token = (env.NANOCLAW_CLAUDE_CODE_OAUTH_TOKEN || env.CLAUDE_CODE_OAUTH_TOKEN)?.trim();
  if (token) return { secret: token, authEnv: 'CLAUDE_CODE_OAUTH_TOKEN' };
  const key = (env.NANOCLAW_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY)?.trim();
  if (!key) return undefined;
  return { secret: key, authEnv: key.startsWith('sk-ant-oat') ? 'CLAUDE_CODE_OAUTH_TOKEN' : 'ANTHROPIC_API_KEY' };
}
