import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from '@prometheus-io/client';
import { pino, type Logger } from 'pino';
import { CONFIG, type Config } from './config.js';
import type { Completion, Quota } from './completion.js';

@Injectable()
export class Observability implements OnModuleDestroy {
  readonly registry=new Registry();
  readonly logger:Logger;
  readonly requests:Counter<'method'|'route'|'status'>;
  readonly httpDuration:Histogram<'method'|'route'>;
  readonly inferenceDuration:Histogram<'provider'|'model'|'outcome'>;
  readonly inFlight:Gauge;
  readonly tokens:Counter<'provider'|'model'|'kind'>;
  readonly cost:Counter<'provider'|'model'>;
  readonly failures:Counter<'provider'|'kind'>;
  readonly quota:Gauge<'provider'|'window'>;
  readonly quotaReset:Gauge<'provider'|'window'>;
  readonly quotaObserved:Gauge<'provider'|'window'>;
  readonly quotaRejections:Counter<'provider'|'window'>;
  readonly authConfigured:Gauge<'provider'>;
  constructor(@Inject(CONFIG) config:Config) {
    this.logger=pino({level:config.LOG_LEVEL,base:{service:'harness-relay'},timestamp:pino.stdTimeFunctions.isoTime,
      redact:{paths:['authorization','token','secret','password','credential','prompt','messages','req.headers.authorization'],censor:'[REDACTED]'}});
    const registers=[this.registry];
    this.requests=new Counter({name:'http_requests_total',help:'Completed HTTP requests',labelNames:['method','route','status'],registers});
    this.httpDuration=new Histogram({name:'http_request_duration_seconds',help:'HTTP duration',labelNames:['method','route'],buckets:[.01,.05,.1,.5,1,5,15,30,60,120,300],registers});
    this.inferenceDuration=new Histogram({name:'inference_request_duration_seconds',help:'Inference duration including SDK startup',labelNames:['provider','model','outcome'],buckets:[.1,.5,1,5,15,30,60,120,300],registers});
    this.inFlight=new Gauge({name:'inference_requests_in_flight',help:'Active inference processes',registers});
    this.tokens=new Counter({name:'inference_tokens_total',help:'Observed tokens; input includes cached and cache_write, reasoning is a subset of output',labelNames:['provider','model','kind'],registers});
    this.cost=new Counter({name:'inference_estimated_api_cost_usd_total',help:'SDK-reported API-equivalent estimate, NOT subscription charges',labelNames:['provider','model'],registers});
    this.failures=new Counter({name:'inference_failures_total',help:'Inference failures by bounded category',labelNames:['provider','kind'],registers});
    this.quota=new Gauge({name:'inference_subscription_utilization_ratio',help:'Last SDK-reported fraction used, absent until observed; check observation timestamp',labelNames:['provider','window'],registers});
    this.quotaReset=new Gauge({name:'inference_subscription_reset_timestamp_seconds',help:'SDK-reported window reset time',labelNames:['provider','window'],registers});
    this.quotaObserved=new Gauge({name:'inference_subscription_observed_timestamp_seconds',help:'When quota was last observed (not a polling guarantee)',labelNames:['provider','window'],registers});
    this.quotaRejections=new Counter({name:'inference_subscription_rejections_total',help:'SDK-reported rejected rate-limit events',labelNames:['provider','window'],registers});
    this.authConfigured=new Gauge({name:'inference_auth_configured',help:'Local CLI recognizes a credential, not live upstream validity',labelNames:['provider'],registers});
    collectDefaultMetrics({register:this.registry,prefix:'gateway_'});
  }
  usage(provider:string,model:string,result:Completion) {
    const values={input:result.input,output:result.output,cached:result.cached,cache_write:result.cacheWrite,reasoning:result.reasoning};
    for(const [kind,value] of Object.entries(values)) if(value!==undefined && Number.isFinite(value) && value>=0) this.tokens.inc({provider,model,kind},value);
    if(result.estimatedCostUsd!==undefined && Number.isFinite(result.estimatedCostUsd) && result.estimatedCostUsd>=0) this.cost.inc({provider,model},result.estimatedCostUsd);
  }
  observeQuota(provider:string,quota:Quota) {
    const known=['five_hour','seven_day','seven_day_opus','seven_day_sonnet','seven_day_overage_included','overage'];
    const labels={provider,window:known.includes(quota.window)?quota.window:'unknown'};
    this.quotaObserved.set(labels,Date.now()/1000);
    if(quota.utilization!==undefined && Number.isFinite(quota.utilization)) this.quota.set(labels,quota.utilization);
    if(quota.resetsAt!==undefined && Number.isFinite(quota.resetsAt)) this.quotaReset.set(labels,quota.resetsAt);
    if(quota.status==='rejected') this.quotaRejections.inc(labels);
  }
  onModuleDestroy() { this.registry.clear(); this.logger.flush(); }
}
