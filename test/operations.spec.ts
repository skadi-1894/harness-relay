import {jest,describe,it,expect,beforeEach,afterEach} from '@jest/globals';
import type {INestApplication} from '@nestjs/common';
import supertest from 'supertest';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import type {ClaudeService} from '../src/claude.service.js';
import {ProviderError} from '../src/completion.js';
import {Lifecycle} from '../src/lifecycle.js';
import {Observability} from '../src/observability.js';
const config=loadConfig({INFERENCE_API_KEY:'test-secret-long-enough',METRICS_TOKEN:'metrics-secret-long-enough',CODEX_ENABLED:'false',CLAUDE_MODEL:'sonnet',LOG_LEVEL:'silent'});
const body={model:'claude/sonnet',messages:[{role:'user',content:'PRIVATE PROMPT'}]};
describe('Operations and Claude facade',()=>{
  let app:INestApplication;
  const complete=jest.fn<ClaudeService['complete']>();
  const readiness=jest.fn<()=>Promise<Record<string,boolean>>>();
  beforeEach(async()=>{
    complete.mockReset().mockResolvedValue({text:'Hi',input:40,cached:20,cacheWrite:5,output:3,estimatedCostUsd:.01});
    readiness.mockReset().mockResolvedValue({claude:true});
    app=await createApp(config,undefined,{complete},readiness);
  });
  afterEach(async()=>{await app.close();});
  const req=()=>supertest(app.getHttpServer());
  const chat=(value:object=body)=>req().post('/v1/chat/completions').auth(config.INFERENCE_API_KEY,{type:'bearer'}).send(value);
  const metrics=()=>req().get('/metrics').auth(config.METRICS_TOKEN!,{type:'bearer'});
  it('separates liveness from credential readiness and draining',async()=>{
    await req().get('/health/live').expect(200);
    await req().get('/health/ready').expect(200);
    readiness.mockResolvedValue({claude:false});
    await req().get('/health/ready').expect(503);
    app.get(Lifecycle).draining=true;
    await req().get('/health/ready').expect(503);
    await chat().expect(503);
    await req().get('/health/live').expect(200);
  });
  it('uses a separate protected Prometheus endpoint and accounts token kinds',async()=>{
    await req().get('/metrics').expect(401);
    await req().get('/metrics').auth(config.INFERENCE_API_KEY,{type:'bearer'}).expect(401);
    await chat().expect(200);
    const res=await metrics().expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('inference_tokens_total{provider="claude",model="claude/sonnet",kind="input"} 40');
    expect(res.text).toContain('inference_tokens_total{provider="claude",model="claude/sonnet",kind="cached"} 20');
    expect(res.text).toContain('inference_estimated_api_cost_usd_total{provider="claude",model="claude/sonnet"} 0.01');
    expect(res.text).toContain('inference_requests_in_flight 0');
    expect(res.text).not.toContain('PRIVATE PROMPT');
  });
  it('observes real provider quota and counts error-path consumed tokens',async()=>{
    complete.mockImplementation(async(_r,_s,callbacks)=>{
      callbacks?.onQuota?.({window:'five_hour',status:'rejected',utilization:.95,resetsAt:2000000000});
      throw new ProviderError('rate_limit',{text:'',input:5,cached:0,output:1});
    });
    await chat().expect(429);
    const res=await metrics();
    expect(res.text).toContain('inference_subscription_utilization_ratio{provider="claude",window="five_hour"} 0.95');
    expect(res.text).toContain('inference_subscription_rejections_total{provider="claude",window="five_hour"} 1');
    expect(res.text).toContain('inference_tokens_total{provider="claude",model="claude/sonnet",kind="input"} 5');
  });
  it('does not invent quota before observations',async()=>{
    const res=await metrics();
    expect(res.text).not.toMatch(/^inference_subscription_utilization_ratio\{/m);
  });
  it('bounds route labels and omits queries from logs',async()=>{
    const info=jest.spyOn(app.get(Observability).logger,'info');
    await req().get('/invented-secret-route?token=PRIVATE_TOKEN').auth(config.INFERENCE_API_KEY,{type:'bearer'}).expect(404);
    const res=await metrics();
    expect(res.text).toContain('route="unmatched"');
    expect(res.text).not.toContain('invented-secret-route');
    expect(JSON.stringify(info.mock.calls)).not.toContain('PRIVATE_TOKEN');
    expect(JSON.stringify(info.mock.calls)).not.toContain('invented-secret-route');
  });
  it('rejects incompatible Claude settings and resolves plain Claude aliases',async()=>{
    await chat({...body,reasoning_effort:'ultra'}).expect(400);
    await chat({...body,model:'sonnet',reasoning_effort:'max'}).expect(200);
    expect(complete.mock.calls[0][0]).toMatchObject({model:'sonnet',reasoning_effort:'max'});
  });
  it('streams Claude content before inference completes',async()=>{
    let release!:()=>void;
    complete.mockImplementationOnce(async(_r,_s,callbacks)=>{
      callbacks?.onDelta?.('Hi');
      await new Promise<void>(resolve=>{release=resolve;});
      return {text:'Hi',input:1,cached:0,output:1};
    });
    await app.listen(0,'127.0.0.1');
    const response=await fetch(`${await app.getUrl()}/v1/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.INFERENCE_API_KEY}`},body:JSON.stringify({...body,stream:true})});
    const reader=response.body!.getReader();
    try {
      const first=await reader.read();
      expect(new TextDecoder().decode(first.value)).toContain('"content":"Hi"');
    } finally {release();}
    let rest='';for(;;){const part=await reader.read();if(part.done)break;rest+=new TextDecoder().decode(part.value);}
    expect(rest).toContain('[DONE]');
  });
  it('rate-limits admission without calling the provider twice',async()=>{
    await app.close();app=await createApp({...config,RATE_LIMIT_PER_MINUTE:1},undefined,{complete},readiness);
    await chat().expect(200);await chat().expect(429);expect(complete).toHaveBeenCalledTimes(1);
  });
});
