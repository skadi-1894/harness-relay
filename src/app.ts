import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { ApiController, apiError } from './api.js';
import { CodexService } from './codex.service.js';
import { CONFIG, type Config } from './config.js';

@Module({})
class AppModule {}
export async function createApp(config: Config, backend?: Pick<CodexService, 'complete'>) {
  const app = await NestFactory.create({ module: AppModule, controllers: [ApiController],
    providers: [{ provide: CONFIG, useValue: config }, backend ? { provide: CodexService, useValue: backend } : CodexService] },
    { bodyParser: false, logger: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') return next();
    const actual = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${config.INFERENCE_API_KEY}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return apiError(res, 401, 'Invalid API key', 'authentication_error');
    next();
  });
  app.use(json({ limit: '1mb' }));
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err) return apiError(res, (err as {status?: number}).status ?? 400, 'Invalid JSON body');
    next();
  });
  app.enableShutdownHooks();
  await app.init();
  return app;
}
