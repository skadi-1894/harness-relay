import { Inject, Injectable } from '@nestjs/common';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { CONFIG, type Config } from './config.js';
import { CodexService } from './codex.service.js';
import { ClaudeService } from './claude.service.js';
import { claudeEnvironment, childEnvironment, loadClaudeCredential } from './credentials.js';
import { claudePath, codexCommand } from './cli-paths.js';
import type { ChatRequest } from './request.js';
import type { Callbacks, Completion } from './completion.js';

export interface Model { id:string; provider:'codex'|'claude'; upstream:string }
@Injectable()
export class Providers {
  readonly models:Model[];
  constructor(@Inject(CONFIG) private readonly config:Config,
    @Inject(CodexService) private readonly codex:CodexService,
    @Inject(ClaudeService) private readonly claude:ClaudeService) {
    this.models=[...(config.CODEX_ENABLED?config.models.map(id=>({id,provider:'codex' as const,upstream:id})):[]),
      ...(config.CLAUDE_ENABLED?config.claudeModels.map(id=>({id:`claude/${id}`,provider:'claude' as const,upstream:id})):[])];
    if(!this.resolve(config.defaultModel)) throw new Error('DEFAULT_MODEL must be configured');
  }
  resolve(id?:string) {
    return this.models.find(m=>m.id===(id ?? this.config.defaultModel))
      ?? this.models.find(m=>`${m.provider}/${m.upstream}`===id)
      ?? this.models.find(m=>m.provider==='claude'&&m.upstream===id);
  }
  complete(model:Model,request:ChatRequest,signal:AbortSignal,callbacks:Callbacks={}):Promise<Completion> {
    const input={...request,model:model.upstream};
    return model.provider==='claude'?this.claude.complete(input,signal,callbacks):this.codex.complete(input,signal);
  }
  private readinessCache?:{at:number;value:Record<string,boolean>};
  private checking?:Promise<Record<string,boolean>>;
  async readiness():Promise<Record<string,boolean>> {
    if(this.readinessCache && Date.now()-this.readinessCache.at<10000) return this.readinessCache.value;
    if(this.checking) return this.checking;
    this.checking=(async()=>{
      const codex=codexCommand(this.config.CODEX_PATH);
      const tasks:{name:string;run:()=>Promise<unknown>}[]=[];
      if(this.config.CODEX_ENABLED) tasks.push({name:'codex',run:()=>promisify(execFile)(codex.command,[...codex.prefix,'-c','cli_auth_credentials_store="file"','login','status'],{env:{...childEnvironment(),CODEX_HOME:this.config.CODEX_HOME},timeout:3000,maxBuffer:65536})});
      if(this.config.CLAUDE_ENABLED) tasks.push({name:'claude',run:async()=>{
          if(!await loadClaudeCredential(this.config)) throw new Error('Missing credential');
          await promisify(execFile)(claudePath(this.config.CLAUDE_PATH),['auth','status'],{env:await claudeEnvironment(this.config),timeout:3000,maxBuffer:65536});
        }});
      const checks=await Promise.allSettled(tasks.map(task=>task.run()));
      const value=Object.fromEntries(tasks.map((task,i)=>[task.name,checks[i].status==='fulfilled']));
      this.readinessCache={at:Date.now(),value};
      return value;
    })();
    try { return await this.checking; } finally { this.checking=undefined; }
  }
}
