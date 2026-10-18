// Adapted NanoClaw auth UX; provenance and MIT license in THIRD_PARTY_NOTICES.md.
import * as p from '@clack/prompts';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { saveCredential, loadClaudeCredential, childEnvironment } from './credentials.js';
import { claudePath, codexCommand } from './cli-paths.js';

const config = loadConfig({...process.env,INFERENCE_API_KEY:process.env.INFERENCE_API_KEY ?? 'auth-cli-unused-key'});
function answer<T>(value:T):Exclude<T,symbol> { if (p.isCancel(value)) throw new Error('Authentication cancelled'); return value as Exclude<T,symbol>; }
async function inherit(command:string,args:string[],env:NodeJS.ProcessEnv) {
  const code = await new Promise<number>((resolve,reject) => {
    const child = spawn(command,args,{stdio:'inherit',env,shell:false});
    child.once('error',reject); child.once('exit',code=>resolve(code ?? 1));
  });
  if (code !== 0) throw new Error('Provider command failed; no credential was saved');
}
export async function main(args:string[]) {
  const [provider,action='login',methodArg] = args;
  if (!['claude','codex'].includes(provider) || !['login','status'].includes(action)) throw new Error('Usage: npm run auth -- <claude|codex> <login|status> [subscription|oauth|api|device|browser]');
  if (action === 'status') {
    if (provider === 'claude') {
      const credential=await loadClaudeCredential(config);
      // Presence is deliberately not described as a live upstream authentication check.
      console.log(JSON.stringify({provider,credentialConfigured:Boolean(credential),method:credential?.authEnv ?? 'none'}));
      if (!credential) process.exitCode=1;
    } else {
      const cmd=codexCommand(config.CODEX_PATH);
      await inherit(cmd.command,[...cmd.prefix,'login','status'],{...childEnvironment(),CODEX_HOME:config.CODEX_HOME});
    }
    return;
  }
  if (provider === 'codex') {
    const method=methodArg ?? 'device';
    if (!['device','browser'].includes(method)) throw new Error('Codex login method: device or browser');
    await mkdir(config.CODEX_HOME,{recursive:true,mode:0o700});
    const cmd=codexCommand(config.CODEX_PATH);
    await inherit(cmd.command,[...cmd.prefix,'-c','cli_auth_credentials_store="file"','login',...(method==='device'?['--device-auth']:[])],{...childEnvironment(),CODEX_HOME:config.CODEX_HOME});
    return;
  }
  await mkdir(config.CLAUDE_CONFIG_DIR,{recursive:true,mode:0o700});
  const method=methodArg ?? answer(await p.select({message:'How would you like to connect to Claude?',options:[
    {value:'subscription',label:'Claude subscription (browser sign-in)'},
    {value:'oauth',label:'Paste an OAuth token'}, {value:'api',label:'Paste an Anthropic API key'},
  ]}));
  if (!['subscription','oauth','api'].includes(method)) throw new Error('Claude login method: subscription, oauth or api');
  let secret:string;
  if (method === 'subscription') {
    const directory=await mkdtemp(join(tmpdir(),'inference-login-'));
    try {
      const output=join(directory,'token');
      await inherit('bash',[fileURLToPath(new URL('../scripts/capture-claude-token.sh',import.meta.url)),output],{
        ...childEnvironment(),CLAUDE_EXECUTABLE:claudePath(config.CLAUDE_PATH),CLAUDE_CONFIG_DIR:config.CLAUDE_CONFIG_DIR,
      });
      secret=(await readFile(output,'utf8')).trim();
    } finally { await rm(directory,{recursive:true,force:true}); }
  } else {
    secret=answer(await p.password({message:method==='oauth'?'Paste your OAuth token':'Paste your API key',clearOnError:true})).replace(/\s+/g,'');
  }
  const prefix=method==='api'?'sk-ant-api':'sk-ant-oat';
  if (!secret.startsWith(prefix)) throw new Error('Invalid credential prefix; nothing was saved');
  await saveCredential(config.claudeCredentialFile,{secret,authEnv:method==='api'?'ANTHROPIC_API_KEY':'CLAUDE_CODE_OAUTH_TOKEN'});
  p.log.success('Claude credential saved (0600). No server restart is needed.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => { console.error('Authentication failed. Check the selected provider/method and terminal output; credentials are never included in this error.'); process.exitCode=1; });
}
