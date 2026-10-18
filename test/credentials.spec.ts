import {describe,it,expect} from '@jest/globals';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {saveCredential} from '../src/credentials.js';
import {suppliedCredential} from '../src/vendor/nanoclaw/supplied-credential.js';
import {extractClaudeOAuthToken} from '../src/vendor/nanoclaw/captured-token.js';
describe('NanoClaw authentication',()=>{
  const TOKEN=`sk-ant-oat01-${'a'.repeat(90)}AA`;
  it('extracts wrapped terminal tokens with ANSI artifacts, not placeholders',()=>{
    expect(extractClaudeOAuthToken(`\x1b[?2026hToken:\n ${TOKEN.slice(0,72)}\n ${TOKEN.slice(72)}\x1b[0m\nexport CLAUDE_CODE_OAUTH_TOKEN=<token>`)).toBe(TOKEN);
    expect(extractClaudeOAuthToken('export CLAUDE_CODE_OAUTH_TOKEN=<token>')).toBeNull();
  });
  it('classifies OAuth tokens as Bearer even in the API key variable',()=>{
    expect(suppliedCredential({ANTHROPIC_API_KEY:TOKEN})).toEqual({secret:TOKEN,authEnv:'CLAUDE_CODE_OAUTH_TOKEN'});
    expect(suppliedCredential({ANTHROPIC_API_KEY:'sk-ant-api-test'})).toEqual({secret:'sk-ant-api-test',authEnv:'ANTHROPIC_API_KEY'});
  });
  it('stores and rotates a credential atomically with 0600 permissions',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'auth-test-'));
    const file=join(dir,'auth','credential.json');
    try {
      await saveCredential(file,{authEnv:'CLAUDE_CODE_OAUTH_TOKEN',secret:TOKEN});
      expect((await stat(file)).mode&0o777).toBe(0o600);
      await saveCredential(file,{authEnv:'ANTHROPIC_API_KEY',secret:'sk-ant-api-test'});
      expect(JSON.parse(await readFile(file,'utf8'))).toEqual({authEnv:'ANTHROPIC_API_KEY',secret:'sk-ant-api-test'});
      expect((await stat(file)).mode&0o777).toBe(0o600);
    } finally {await rm(dir,{recursive:true,force:true});}
  });
});
