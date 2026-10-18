import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { CodexService } from '../src/codex.service.js';

describe('OpenAI HTTP facade', () => {
  let app: INestApplication;
  const complete = jest.fn<CodexService['complete']>();
  const config = loadConfig({ INFERENCE_API_KEY: 'test-secret-long-enough', CODEX_MODEL: 'test-model', LOG_LEVEL: 'silent' });
  const body = { messages: [{ role: 'user', content: 'Hello' }] };
  beforeEach(async () => {
    complete.mockReset().mockResolvedValue({ text: 'Hi', input: 10, cached: 2, output: 3 });
    app = await createApp(config, { complete });
  });
  afterEach(async () => { await app.close(); });
  const request = () => supertest(app.getHttpServer());
  const chat = (value: unknown = body) => request().post('/v1/chat/completions').auth(config.INFERENCE_API_KEY, { type: 'bearer' }).send(value as object);
  it('has public health and protects API', async () => {
    await request().get('/health').expect(200);
    const res = await request().post('/v1/chat/completions').send(body).expect(401);
    expect(res.body.error.type).toBe('authentication_error');
    expect(complete).not.toHaveBeenCalled();
  });
  it('lists configured models', async () => {
    const res = await request().get('/v1/models').auth(config.INFERENCE_API_KEY, {type:'bearer'}).expect(200);
    expect(res.body.data[0].id).toBe('test-model');
  });
  it('returns OpenAI completion and usage', async () => {
    const res = await chat().expect(200);
    expect(res.body.choices[0].message).toEqual({ role: 'assistant', content: 'Hi' });
    expect(res.body.usage.total_tokens).toBe(13);
  });
  it('forwards inference settings', async () => {
    await chat({ ...body, reasoning_effort: 'high', service_tier: 'fast' }).expect(200);
    expect(complete.mock.calls[0][0]).toMatchObject({ reasoning_effort: 'high', service_tier: 'fast' });
  });
  it.each([{...body, temperature: 1}, {...body, model: 'unknown'}, {messages: []}, {messages: [{role:'tool',content:'x'}]}])('rejects unsupported requests %j', async value => {
    await chat(value).expect(400);
    expect(complete).not.toHaveBeenCalled();
  });
  it('formats buffered SSE with terminal chunk', async () => {
    const res = await chat({ ...body, stream: true }).expect(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const chunks = res.text.split('\n\n').filter(Boolean).map(x => x.slice(6));
    expect(JSON.parse(chunks[0]).choices[0].delta.content).toBe('Hi');
    expect(JSON.parse(chunks[1]).choices[0].finish_reason).toBe('stop');
    expect(chunks[2]).toBe('[DONE]');
  });
  it.each([false,true])('returns function calls and accepts client results (stream=%s)',async stream=>{
    const tools=[{type:'function',function:{name:'weather',parameters:{type:'object',properties:{city:{type:'string'}}}}}];
    const call={id:'call_test',type:'function' as const,function:{name:'weather',arguments:'{"city":"Warsaw"}'}};
    complete.mockResolvedValueOnce({text:'',input:10,cached:0,output:3,toolCalls:[call]});
    const response=await chat({...body,tools,tool_choice:'required',parallel_tool_calls:false,stream}).expect(200);
    if(stream) {
      const chunks=response.text.split('\n\n').filter(Boolean).map(x=>x.slice(6));
      const parsed=chunks.slice(0,-1).map(x=>JSON.parse(x).choices[0]);
      expect(parsed.find(x=>x.delta.tool_calls)?.delta.tool_calls).toEqual([{index:0,...call}]);
      expect(parsed.at(-1).finish_reason).toBe('tool_calls');
      expect(chunks.at(-1)).toBe('[DONE]');
    } else expect(response.body.choices[0]).toEqual({index:0,message:{role:'assistant',content:null,tool_calls:[call]},finish_reason:'tool_calls'});
    await chat({tools,messages:[...body.messages,{role:'assistant',content:null,tool_calls:[call]},{role:'tool',tool_call_id:call.id,content:'Sunny'}]}).expect(200);
    expect(complete.mock.calls.at(-1)?.[0].messages.at(-1)).toEqual({role:'tool',tool_call_id:'call_test',content:'Sunny'});
  });
  it('sanitizes upstream errors', async () => {
    complete.mockRejectedValue(new Error('secret credential'));
    const res = await chat().expect(502);
    expect(res.text).not.toContain('secret credential');
  });
  it('aborts timed out inference', async () => {
    await app.close();
    app = await createApp({...config, REQUEST_TIMEOUT_MS: 20}, { complete });
    complete.mockImplementation((_r, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), {once:true})));
    await chat().expect(504);
  });
  it('bounds concurrent requests', async () => {
    await app.close();
    app = await createApp({...config, MAX_CONCURRENT_REQUESTS: 1}, {complete});
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>(resolve => {started = resolve;});
    complete.mockImplementationOnce(async () => { started(); await new Promise<void>(resolve => { release = resolve; }); return {text:'Hi',input:1,cached:0,output:1}; });
    const first = chat().then(res => res);
    await ready;
    try { await chat().expect(429); } finally { release(); }
    expect((await first).status).toBe(200);
    await chat().expect(200);
  });
  it('rejects malformed JSON consistently', async () => {
    const res = await request().post('/v1/chat/completions').auth(config.INFERENCE_API_KEY, {type:'bearer'}).set('Content-Type','application/json').send('{').expect(400);
    expect(res.body.error.message).toBe('Invalid JSON body');
  });
});
