import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
export function claudePath(override?: string) {
  return override ?? join(dirname(require.resolve('@anthropic-ai/claude-code/package.json')), 'bin', 'claude.exe');
}
export function codexCommand(override?: string): {command:string; prefix:string[]} {
  return override ? {command:override,prefix:[]} : {command:process.execPath,prefix:[join(dirname(require.resolve('@openai/codex/package.json')), 'bin','codex.js')]};
}
