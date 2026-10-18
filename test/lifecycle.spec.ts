import {describe,it,expect} from '@jest/globals';
import {Lifecycle} from '../src/lifecycle.js';
import {loadConfig} from '../src/config.js';
const config=loadConfig({INFERENCE_API_KEY:'test-secret-long-enough',SHUTDOWN_GRACE_MS:'30'});
describe('shutdown',()=>{
  it('marks draining before cancelling at the grace deadline',async()=>{
    const lifecycle=new Lifecycle(config);const controller=new AbortController();lifecycle.active.add(controller);
    const done=lifecycle.beforeApplicationShutdown();
    expect(lifecycle.draining).toBe(true);expect(controller.signal.aborted).toBe(false);
    await done;expect(controller.signal.aborted).toBe(true);
  });
  it('allows active work to finish without cancellation',async()=>{
    const lifecycle=new Lifecycle({...config,SHUTDOWN_GRACE_MS:200});const controller=new AbortController();lifecycle.active.add(controller);
    const done=lifecycle.beforeApplicationShutdown();lifecycle.active.delete(controller);
    await done;expect(controller.signal.aborted).toBe(false);
  });
});
