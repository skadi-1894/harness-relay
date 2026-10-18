import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { ApiController, apiError } from './api.js';
import { CodexService } from './codex.service.js';
import { ClaudeService } from './claude.service.js';
import { Providers } from './providers.js';
import { Observability } from './observability.js';
import { Lifecycle } from './lifecycle.js';
import { CONFIG, type Config } from './config.js';

@Module({})
class AppModule {}
export async function createApp(config: Config, backend?: Pick<CodexService,'complete'>, claudeBackend?: Pick<ClaudeService,'complete'>, readiness?:()=>Promise<Record<string,boolean>>) {
  const app=await NestFactory.create({module:AppModule,controllers:[ApiController],providers:[
    {provide:CONFIG,useValue:config},Observability,Lifecycle,Providers,
    backend?{provide:CodexService,useValue:backend}:CodexService,
    claudeBackend?{provide:ClaudeService,useValue:claudeBackend}:ClaudeService,
  ]},{bodyParser:false,logger:false});
  const obs=app.get(Observability);
  if(readiness) app.get(Providers).readiness=readiness;
  const known=new Set(['/health','/health/live','/health/ready','/metrics','/v1/models','/v1/chat/completions']);
  app.use((req:Request,res:Response,next:NextFunction)=>{
    const start=performance.now();
    // Generate our own ID; never log untrusted URL/query/headers/body.
    const requestId=randomUUID();res.locals.requestId=requestId;res.setHeader('X-Request-Id',requestId);
    const route=known.has(req.path)?req.path:'unmatched';
    let recorded=false;
    const record=()=>{
      if(recorded) return; recorded=true;
      const status=res.writableEnded?String(res.statusCode):'499';
      const method=['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(req.method)?req.method:'OTHER';
      const duration=(performance.now()-start)/1000;
      obs.requests.inc({method,route,status});obs.httpDuration.observe({method,route},duration);
      if(!route.startsWith('/health') && route!=='/metrics') obs.logger.info({event:'http_request',request_id:requestId,method,route,status:Number(status),duration_seconds:duration},'HTTP request');
    };
    res.once('finish',record);res.once('close',record);next();
  });
  app.use((req:Request,res:Response,next:NextFunction)=>{
    if(['/health','/health/live','/health/ready'].includes(req.path)) return next();
    const secret=req.path==='/metrics'?(config.METRICS_TOKEN ?? config.INFERENCE_API_KEY):config.INFERENCE_API_KEY;
    const actual=Buffer.from(req.headers.authorization ?? '');const expected=Buffer.from(`Bearer ${secret}`);
    if(actual.length!==expected.length || !timingSafeEqual(actual,expected)) return apiError(res,401,'Invalid API key','authentication_error');
    next();
  });
  app.use('/v1',rateLimit({windowMs:60000,limit:config.RATE_LIMIT_PER_MINUTE,standardHeaders:'draft-8',legacyHeaders:false,
    handler:(_req,res)=>apiError(res,429,'Request rate limit exceeded','rate_limit_error')}));
  app.use(json({limit:'1mb'}));
  app.use((err:unknown,_req:Request,res:Response,next:NextFunction)=>{
    if(err) return apiError(res,(err as {status?:number}).status ?? 400,'Invalid JSON body');next();
  });
  app.enableShutdownHooks();
  await app.init();return app;
}
