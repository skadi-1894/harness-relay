import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { Observability } from './observability.js';

const config = loadConfig();
const app = await createApp(config);
await app.listen(config.PORT, config.HOST);
app.get(Observability).logger.info({event:'server_started',host:config.HOST,port:config.PORT},'Harness Relay listening');
