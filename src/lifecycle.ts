import { Inject, Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import { CONFIG, type Config } from './config.js';

@Injectable()
export class Lifecycle implements BeforeApplicationShutdown {
  draining=false;
  readonly active=new Set<AbortController>();
  constructor(@Inject(CONFIG) private readonly config:Config) {}
  async beforeApplicationShutdown() {
    this.draining=true;
    const deadline=Date.now()+this.config.SHUTDOWN_GRACE_MS;
    while(this.active.size && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,25));
    for(const controller of this.active) controller.abort();
  }
}
