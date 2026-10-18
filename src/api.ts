import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CONFIG, type Config } from './config.js';
import { CodexService } from './codex.service.js';
import { chatSchema } from './request.js';

export function apiError(res: Response, status: number, message: string, type = 'invalid_request_error') {
  return res.status(status).json({ error: { message, type, param: null, code: null } });
}
@Controller()
export class ApiController {
  private active = 0;
  constructor(@Inject(CONFIG) private readonly config: Config, private readonly codex: CodexService) {}

  @Get('health') health() { return { status: 'ok' }; }
  @Get('v1/models') models() {
    return { object: 'list', data: this.config.models.map(id => ({ id, object: 'model', created: 0, owned_by: 'codex' })) };
  }
  @Post('v1/chat/completions')
  async chat(@Body() body: unknown, @Req() req: Request, @Res() res: Response) {
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) return apiError(res, 400, parsed.error.message);
    const request = parsed.data;
    const model = request.model ?? this.config.CODEX_MODEL;
    if (!this.config.models.includes(model)) return apiError(res, 400, 'Model is not configured');
    if (this.active >= this.config.MAX_CONCURRENT_REQUESTS) return apiError(res, 429, 'Too many active requests', 'rate_limit_error');
    this.active++;
    const abort = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, this.config.REQUEST_TIMEOUT_MS);
    const disconnect = () => { if (!res.writableEnded) abort.abort(); };
    res.on('close', disconnect);
    try {
      const result = await this.codex.complete(request, abort.signal);
      if (res.destroyed) return;
      if (timedOut) return apiError(res, 504, 'Codex request timed out', 'server_error');
      const id = `chatcmpl-${randomUUID()}`;
      const created = Math.floor(Date.now() / 1000);
      if (request.stream) {
        // The SDK returns completed agent messages, not token deltas. Buffer honestly.
        res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
        const chunk = (delta: object, finish_reason: string | null) => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
        chunk({ role: 'assistant', content: result.text }, null);
        chunk({}, 'stop');
        res.end('data: [DONE]\n\n');
        return;
      }
      return res.status(200).json({ id, object: 'chat.completion', created, model,
        choices: [{ index: 0, message: { role: 'assistant', content: result.text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: result.input, completion_tokens: result.output, total_tokens: result.input + result.output,
          prompt_tokens_details: { cached_tokens: result.cached } } });
    } catch {
      if (!res.destroyed) return apiError(res, timedOut ? 504 : 502, timedOut ? 'Codex request timed out' : 'Codex request failed; check local CLI authentication and model availability', 'server_error');
    } finally {
      clearTimeout(timer); res.off('close', disconnect); this.active--;
    }
  }
}
