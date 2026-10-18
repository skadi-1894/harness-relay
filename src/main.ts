import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await createApp(config);
await app.listen(config.PORT, config.HOST);
console.log(`Harness Relay listening on ${config.HOST}:${config.PORT}`);
