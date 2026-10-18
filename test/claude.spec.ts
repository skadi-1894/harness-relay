import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { access } from 'node:fs/promises';
import type { Options, SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { loadConfig } from '../src/config.js';
const sdkQuery=jest.fn<(input:{prompt:string;options:Options})=>AsyncGenerator<SDKMessage>>();
jest.unstable_mockModule('@anthropic-ai/claude-agent-sdk',()=>({query:sdkQuery}));
const {ClaudeService}=await import('../src/claude.service.js');
const {ProviderError}=await import('../src/completion.js');
const config=loadConfig({INFERENCE_API_KEY:'test-secret-long-enough',LOG_LEVEL:'silent'});
const result={type:'result',subtype:'success',is_error:false,result:'Hello',total_cost_usd:.02,
  usage:{input_tokens:1,output_tokens:1},modelUsage:{sonnet:{inputTokens:10,outputTokens:5,cacheReadInputTokens:20,cacheCreationInputTokens:3}}} as unknown as SDKResultMessage;
function events(...messages:unknown[]) { sdkQuery.mockImplementation(async function*(){for(const message of messages) yield message as SDKMessage;}); }
describe('Claude SDK provider',()=>{
  beforeEach(()=>sdkQuery.mockReset());
  it('disables tools, settings inheritance, sessions and accounts all model usage',async()=>{
    events(result);
    const completion=await new ClaudeService(config).complete({messages:[{role:'user',content:'Hi'}],stream:false,reasoning_effort:'high',service_tier:'fast'},new AbortController().signal);
    expect(completion).toEqual({text:'Hello',input:33,cached:20,cacheWrite:3,output:5,estimatedCostUsd:.02});
    const options=sdkQuery.mock.calls[0][0].options;
    expect(options).toMatchObject({tools:[],mcpServers:{},strictMcpConfig:true,settingSources:[],persistSession:false,maxTurns:1,effort:'high',settings:{fastMode:true,disableAllHooks:true}});
    expect(options.env).not.toHaveProperty('INFERENCE_API_KEY');
    await expect(access(options.cwd!)).rejects.toThrow();
  });
  it('streams deltas and treats quota warnings as telemetry',async()=>{
    events({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'Hello'}}},
      {type:'rate_limit_event',rate_limit_info:{status:'allowed_warning',rateLimitType:'five_hour',utilization:.8,resetsAt:2000000000}},result);
    const onDelta=jest.fn(),onQuota=jest.fn();
    await new ClaudeService(config).complete({messages:[{role:'user',content:'Hi'}],stream:true},new AbortController().signal,{onDelta,onQuota});
    expect(onDelta).toHaveBeenCalledWith('Hello');
    expect(onQuota).toHaveBeenCalledWith({window:'five_hour',status:'allowed_warning',utilization:.8,resetsAt:2000000000});
  });
  it('preserves consumed tokens on rate-limit failures without exposing provider text',async()=>{
    events({type:'rate_limit_event',rate_limit_info:{status:'rejected',rateLimitType:'five_hour'}},{...result,is_error:true,result:'SECRET'});
    await expect(new ClaudeService(config).complete({messages:[{role:'user',content:'Hi'}],stream:false},new AbortController().signal)).rejects.toMatchObject({kind:'rate_limit',usage:{input:33}});
  });
  it('maps rejected overage credits to billing and cleans up',async()=>{
    events({type:'rate_limit_event',rate_limit_info:{status:'rejected',errorCode:'credits_required'}});
    await expect(new ClaudeService(config).complete({messages:[{role:'user',content:'Hi'}],stream:false},new AbortController().signal)).rejects.toBeInstanceOf(ProviderError);
    const options=sdkQuery.mock.calls[0][0].options;
    await expect(access(options.cwd!)).rejects.toThrow();
  });
  it('propagates caller cancellation to SDK',async()=>{
    const controller=new AbortController();controller.abort();
    events(result);
    await new ClaudeService(config).complete({messages:[{role:'user',content:'Hi'}],stream:false},controller.signal);
    expect(sdkQuery.mock.calls[0][0].options.abortController!.signal.aborted).toBe(true);
  });
});
