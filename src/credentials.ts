import { chmod, mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Config } from './config.js';
import { suppliedCredential } from './auth/helpers/supplied-credential.js';

const credentialSchema = z.object({
  authEnv: z.enum(['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']),
  secret: z.string().min(1).regex(/^\S+$/),
}).strict();
export type Credential = z.infer<typeof credentialSchema>;
export async function saveCredential(file: string, credential: Credential) {
  const parsed = credentialSchema.parse(credential);
  await mkdir(dirname(file), {recursive:true, mode:0o700});
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(parsed), {mode:0o600, flag:'wx'});
    await rename(temporary, file);
    await chmod(file, 0o600);
  } finally { await unlink(temporary).catch(() => {}); }
}
export async function loadClaudeCredential(config: Config): Promise<Credential | undefined> {
  const env = suppliedCredential();
  if (env) return credentialSchema.parse(env);
  try { return credentialSchema.parse(JSON.parse(await readFile(config.claudeCredentialFile,'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw new Error('Invalid or unreadable Claude credential file'); }
}

// Only OS/runtime variables cross the process boundary. Never pass the gateway's API key.
export function childEnvironment(): Record<string,string> {
  const keys = ['PATH','HOME','USER','LANG','LC_ALL','TMPDIR','TEMP','TMP','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','HTTPS_PROXY','HTTP_PROXY','NO_PROXY'];
  return Object.fromEntries(keys.flatMap(key => process.env[key] ? [[key,process.env[key]!]] : []));
}
export async function claudeEnvironment(config: Config): Promise<Record<string,string>> {
  const credential = await loadClaudeCredential(config);
  return { ...childEnvironment(), CLAUDE_CONFIG_DIR: config.CLAUDE_CONFIG_DIR,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1', CLAUDE_CODE_DISABLE_AUTO_MEMORY:'1',
    ...(credential ? {[credential.authEnv]:credential.secret} : {}) };
}
