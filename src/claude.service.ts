// SDK provider: third-party source provenance in THIRD_PARTY_NOTICES.md.
// Copyright (c) 2026 Gavriel. MIT; see THIRD_PARTY_NOTICES.md.
import { Inject, Injectable } from '@nestjs/common';
import { query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG, type Config } from './config.js';
import { claudeEnvironment } from './credentials.js';
import { type ChatRequest, promptFor } from './request.js';
import { type Completion, type Callbacks, ProviderError } from './completion.js';
import { applyToolOutput, toolOutputSchema } from './tools.js';
import { claudePath } from './cli-paths.js';

export function claudeUsage(message: SDKResultMessage): Completion {
  const totals = Object.values(message.modelUsage ?? {});
  const sum = (key: 'inputTokens'|'outputTokens'|'cacheReadInputTokens'|'cacheCreationInputTokens') => totals.reduce((n,m) => n + (m[key] ?? 0),0);
  // modelUsage includes auxiliary calls; usage is the fallback for older CLI envelopes.
  const cached = totals.length ? sum('cacheReadInputTokens') : message.usage.cache_read_input_tokens ?? 0;
  const cacheWrite = totals.length ? sum('cacheCreationInputTokens') : message.usage.cache_creation_input_tokens ?? 0;
  const fresh = totals.length ? sum('inputTokens') : message.usage.input_tokens;
  return { text: message.subtype === 'success' && !message.is_error ? message.result : '',
    input: fresh + cached + cacheWrite, cached, cacheWrite,
    output: totals.length ? sum('outputTokens') : message.usage.output_tokens,
    estimatedCostUsd: message.total_cost_usd };
}
@Injectable()
export class ClaudeService {
  constructor(@Inject(CONFIG) private readonly config: Config) {}
  async complete(request: ChatRequest, signal: AbortSignal, callbacks: Callbacks = {}): Promise<Completion> {
    const directory = await mkdtemp(join(tmpdir(),'inference-claude-'));
    const abortController = new AbortController();
    const abort = () => abortController.abort();
    signal.addEventListener('abort', abort, {once:true});
    if (signal.aborted) abort();
    let blocked: 'rate_limit'|'billing'|undefined;
    let result: SDKResultMessage | undefined;
    let authenticationError = false;
    try {
      const schema=toolOutputSchema(request);
      const sdkResult = query({ prompt: promptFor(request), options: {
        cwd: directory, env: await claudeEnvironment(this.config),
        pathToClaudeCodeExecutable: claudePath(this.config.CLAUDE_PATH),
        model: request.model ?? this.config.CLAUDE_MODEL,
        effort: (request.reasoning_effort ?? this.config.CLAUDE_REASONING_EFFORT) as 'low'|'medium'|'high'|'xhigh'|'max',
        abortController, persistSession: false, includePartialMessages: Boolean(callbacks.onDelta) && !schema,
        stderr: () => {},
        tools: [], allowedTools: [], mcpServers: {}, strictMcpConfig:true, settingSources:[],
        permissionMode: 'dontAsk',
        settings: { fastMode: ['fast','priority'].includes(request.service_tier ?? 'default'), disableAllHooks:true },
        canUseTool: async () => ({behavior:'deny', message:'Tools are disabled for inference'}),
        maxTurns:schema?3:1,
        ...(schema?{outputFormat:{type:'json_schema' as const,schema}}:{}),
      }});
      try {
        for await (const message of sdkResult) {
          if (!schema && message.type === 'stream_event' && message.event.type === 'content_block_delta' && message.event.delta.type === 'text_delta') {
            callbacks.onDelta?.(message.event.delta.text);
          } else if (message.type === 'assistant' && message.error === 'authentication_failed') {
            authenticationError = true;
          } else if (message.type === 'rate_limit_event') {
            const info = message.rate_limit_info;
            callbacks.onQuota?.({window:info.rateLimitType ?? 'unknown',status:info.status, utilization:info.utilization, resetsAt:info.resetsAt});
            // Informational events must not fail healthy requests (informational quota events).
            if (info.status === 'rejected') blocked = info.errorCode === 'credits_required' || info.overageDisabledReason === 'out_of_credits' ? 'billing' : 'rate_limit';
          } else if (message.type === 'result') result = message;
        }
      } catch(error) {
        // The SDK can throw after yielding an error result. Keep its usage for accounting.
        if(!result || (!result.is_error && result.subtype==='success')) throw error;
      }
      if (!result) throw new ProviderError(blocked ?? (authenticationError ? 'authentication':'upstream'));
      const usage = claudeUsage(result);
      if (result.is_error || result.subtype !== 'success') throw new ProviderError(blocked ?? (authenticationError ? 'authentication':'upstream'),usage);
      return schema?applyToolOutput(request,usage,result.structured_output):usage;
    } finally {
      signal.removeEventListener('abort',abort);
      await rm(directory,{recursive:true,force:true});
    }
  }
}
