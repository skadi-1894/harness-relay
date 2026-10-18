import { jest, describe, it, expect } from '@jest/globals';
import { access } from 'node:fs/promises';
import type { CodexOptions, ThreadOptions, RunResult } from '@openai/codex-sdk';
import { chatSchema } from '../src/request.js';
import { loadConfig } from '../src/config.js';

const run = jest.fn<(...args: unknown[]) => Promise<RunResult>>();
const startThread = jest.fn<(options: ThreadOptions) => {run: typeof run}>().mockReturnValue({run});
const construct = jest.fn<(options: CodexOptions) => void>();
jest.unstable_mockModule('@openai/codex-sdk', () => ({
  Codex: class { constructor(options: CodexOptions) { construct(options); } startThread = startThread; },
}));
const { CodexService } = await import('../src/codex.service.js');

describe('Codex SDK adapter', () => {
  it('maps settings, isolates working directory, and cleans up', async () => {
    run.mockResolvedValue({finalResponse:'Hello',items:[],usage:{input_tokens:4,cached_input_tokens:1,output_tokens:2,cache_write_input_tokens:0,reasoning_output_tokens:0}});
    const config = loadConfig({INFERENCE_API_KEY:'test-secret-long-enough', CODEX_HOME:'/dedicated-home'});
    const signal = new AbortController().signal;
    const result = await new CodexService(config).complete({messages:[{role:'user',content:'Hi'}],stream:false,reasoning_effort:'high',service_tier:'priority'},signal);
    expect(result).toEqual({text:'Hello',input:4,cached:1,output:2,cacheWrite:0,reasoning:0});
    expect(construct.mock.calls.at(-1)?.[0]).toMatchObject({config:{service_tier:'fast',features:{shell_tool:false,fast_mode:true}},env:{CODEX_HOME:'/dedicated-home'}});
    expect(startThread.mock.calls.at(-1)?.[0]).toMatchObject({sandboxMode:'read-only',approvalPolicy:'never',modelReasoningEffort:'high',webSearchMode:'disabled',networkAccessEnabled:false});
    expect(run.mock.calls.at(-1)?.[1]).toEqual({signal});
    await expect(access(startThread.mock.calls.at(-1)![0].workingDirectory!)).rejects.toThrow();
  });
  it('uses SDK outputSchema for client tools and decodes calls',async()=>{
    run.mockResolvedValue({finalResponse:JSON.stringify({content:'',tool_calls:[{name:'weather',arguments:'{"city":"Warsaw"}'}]}),items:[],usage:null});
    const request=chatSchema.parse({messages:[{role:'user',content:'Weather?'}],tools:[{type:'function',function:{name:'weather',parameters:{type:'object'}}}],tool_choice:'required'});
    const completion=await new CodexService(loadConfig({INFERENCE_API_KEY:'test-secret-long-enough'})).complete(request,new AbortController().signal);
    expect(run.mock.calls.at(-1)?.[1]).toHaveProperty('outputSchema');
    expect(completion.toolCalls?.[0].function).toEqual({name:'weather',arguments:'{"city":"Warsaw"}'});
  });
  it('cleans up failed turns', async () => {
    run.mockRejectedValue(new Error('upstream'));
    await expect(new CodexService(loadConfig({INFERENCE_API_KEY:'test-secret-long-enough'})).complete({messages:[{role:'user',content:'Hi'}],stream:false},new AbortController().signal)).rejects.toThrow('upstream');
    await expect(access(startThread.mock.calls.at(-1)![0].workingDirectory!)).rejects.toThrow();
  });
});
