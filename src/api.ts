import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CONFIG, type Config } from './config.js';
import { Providers } from './providers.js';
import { Observability } from './observability.js';
import { Lifecycle } from './lifecycle.js';
import { ProviderError } from './completion.js';
import { chatSchema } from './request.js';

export function apiError(res: Response, status: number, message: string, type = 'invalid_request_error') {
  return res.status(status).json({ error: { message, type, param: null, code: null } });
}
@Controller()
export class ApiController {
  constructor(@Inject(CONFIG) private readonly config: Config,
    @Inject(Providers) private readonly providers: Providers,
    @Inject(Observability) private readonly obs: Observability,
    @Inject(Lifecycle) private readonly lifecycle: Lifecycle) {}

  @Get('health') health() { return { status: 'ok' }; }
  @Get('health/live') live() { return { status: 'ok' }; }
  @Get('health/ready') async ready(@Res() res:Response) {
    if(this.lifecycle.draining) return res.status(503).json({status:'draining'});
    const providers=await this.providers.readiness();
    for(const [provider,ready] of Object.entries(providers)) this.obs.authConfigured.set({provider},Number(ready));
    const ready=Object.values(providers).every(Boolean);
    return res.status(ready?200:503).json({status:ready?'ready':'not_ready',providers});
  }
  @Get('metrics') async metrics(@Res() res:Response) {
    return res.type(this.obs.registry.contentType).send(await this.obs.registry.metrics());
  }
  @Get('v1/models') models() {
    return { object: 'list', data: this.providers.models.map(m => ({ id:m.id, object: 'model', created: 0, owned_by:m.provider })) };
  }
  @Post('v1/chat/completions')
  async chat(@Body() body: unknown, @Req() req: Request, @Res() res: Response) {
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) return apiError(res, 400, 'Invalid request: '+parsed.error.issues.map(x=>`${x.path.join('.') || 'body'}: ${x.code}`).join('; '));
    const request = parsed.data;
    const selected=this.providers.resolve(request.model);
    if (!selected) return apiError(res, 400, 'Model is not configured');
    if (selected.provider==='claude' && request.reasoning_effort && !['low','medium','high','xhigh','max'].includes(request.reasoning_effort)) return apiError(res,400,'Unsupported Claude reasoning_effort');
    if (this.lifecycle.draining) return apiError(res,503,'Server is draining','server_error');
    if (this.lifecycle.active.size >= this.config.MAX_CONCURRENT_REQUESTS) return apiError(res, 429, 'Too many active requests', 'rate_limit_error');
    const abort = new AbortController();
    this.lifecycle.active.add(abort); this.obs.inFlight.inc();
    const started=performance.now();
    let outcome='success';
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;abort.abort();},this.config.REQUEST_TIMEOUT_MS);
    const disconnect=()=>{if(!res.writableEnded) abort.abort();};
    res.on('close',disconnect);
    const id=`chatcmpl-${randomUUID()}`;
    const created=Math.floor(Date.now()/1000);
    const model=selected.id;
    let streamed=false;
    let sseStarted=false;
    const startSse=()=>{
      if(sseStarted) return;
      sseStarted=true;
      res.status(200).set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'});
      res.flushHeaders();
    };
    const chunk=(delta:object,finish_reason:string|null)=>{
      if(res.destroyed) return;
      startSse();
      res.write(`data: ${JSON.stringify({id,object:'chat.completion.chunk',created,model,choices:[{index:0,delta,finish_reason}]})}\n\n`);
      // Avoid unbounded buffers for a stalled streaming client.
      if(res.writableLength>1024*1024) abort.abort();
    };
    try {
      const result=await this.providers.complete(selected,request,abort.signal,{
        onQuota:quota=>this.obs.observeQuota(selected.provider,quota),
        onDelta:request.stream?text=>{
          if(abort.signal.aborted) return;
          chunk(streamed?{content:text}:{role:'assistant',content:text},null); streamed=true;
        }:undefined,
      });
      // Account completed upstream work even when the caller disconnected.
      this.obs.usage(selected.provider,model,result);
      if(abort.signal.aborted) throw new Error('aborted');
      if(request.stream) {
        if(!streamed) chunk({role:'assistant',content:result.text},null);
        if(result.toolCalls?.length) chunk({tool_calls:result.toolCalls.map((call,index)=>({index,...call}))},null);
        chunk({},result.toolCalls?.length?'tool_calls':'stop'); res.end('data: [DONE]\n\n'); return;
      }
      return res.status(200).json({id,object:'chat.completion',created,model,
        choices:[{index:0,message:{role:'assistant',content:result.toolCalls?.length?(result.text || null):result.text,...(result.toolCalls?.length?{tool_calls:result.toolCalls}:{})},finish_reason:result.toolCalls?.length?'tool_calls':'stop'}],
        usage:{prompt_tokens:result.input,completion_tokens:result.output,total_tokens:result.input+result.output,
          prompt_tokens_details:{cached_tokens:result.cached},completion_tokens_details:{reasoning_tokens:result.reasoning ?? 0}}});
    } catch(error) {
      const kind=timedOut?'timeout':abort.signal.aborted?'cancelled':error instanceof ProviderError?error.kind:'upstream';
      outcome=kind;
      if(error instanceof ProviderError && error.usage) this.obs.usage(selected.provider,model,error.usage);
      this.obs.failures.inc({provider:selected.provider,kind});
      const status=kind==='timeout'?504:kind==='rate_limit'?429:kind==='authentication'?503:502;
      const message=kind==='timeout'?'Inference request timed out':kind==='rate_limit'?'Provider subscription limit reached':kind==='authentication'?'Provider authentication requires operator action':'Provider request failed';
      this.obs.logger.warn({event:'inference_failed',request_id:res.locals.requestId,provider:selected.provider,model,error_kind:kind},message);
      if(res.destroyed) return;
      if(sseStarted) { res.write(`data: ${JSON.stringify({error:{message,type:kind==='rate_limit'?'rate_limit_error':'server_error',code:null}})}\n\n`); res.end('data: [DONE]\n\n'); return; }
      return apiError(res,status,message,kind==='rate_limit'?'rate_limit_error':'server_error');
    } finally {
      clearTimeout(timer);res.off('close',disconnect);
      this.lifecycle.active.delete(abort);this.obs.inFlight.dec();
      const duration=(performance.now()-started)/1000;
      this.obs.inferenceDuration.observe({provider:selected.provider,model,outcome},duration);
      this.obs.logger.info({event:'inference_completed',request_id:res.locals.requestId,provider:selected.provider,model,outcome,duration_seconds:duration},'Inference finished');
    }
  }
}
