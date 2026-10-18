import { Inject, Injectable } from '@nestjs/common';
import { Codex } from '@openai/codex-sdk';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG, type Config } from './config.js';
import { type ChatRequest, promptFor } from './request.js';
import { childEnvironment } from './credentials.js';
import { applyToolOutput, toolOutputSchema } from './tools.js';
import { ProviderError } from './completion.js';
import type { Completion } from './completion.js';

export type { Completion } from './completion.js';
@Injectable()
export class CodexService {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  async complete(request: ChatRequest, signal: AbortSignal): Promise<Completion> {
    const directory = await mkdtemp(join(tmpdir(), 'codex-inference-'));
    try {
      const codex = new Codex({
        codexPathOverride: this.config.CODEX_PATH,
        env: { ...childEnvironment(), CODEX_HOME: this.config.CODEX_HOME },
        config: {
          service_tier: (request.service_tier ?? this.config.CODEX_SERVICE_TIER) === 'priority'
            ? 'fast' : (request.service_tier ?? this.config.CODEX_SERVICE_TIER),
          // Disable exec tools rather than relying on the prompt to prevent execution.
          features: { shell_tool: false, fast_mode: true },
          mcp_servers: {},
          cli_auth_credentials_store: 'file',
        },
      });
      const thread = codex.startThread({
        model: request.model ?? this.config.CODEX_MODEL,
        modelReasoningEffort: request.reasoning_effort ?? this.config.CODEX_REASONING_EFFORT,
        workingDirectory: directory, skipGitRepoCheck: true,
        sandboxMode: 'read-only', approvalPolicy: 'never',
        webSearchMode: 'disabled', networkAccessEnabled: false,
      });
      const schema=toolOutputSchema(request);
      const result = await thread.run(promptFor(request), { signal, ...(schema?{outputSchema:schema}:{}) });
      const completion:Completion = { text: result.finalResponse, input: result.usage?.input_tokens ?? 0,
        cached: result.usage?.cached_input_tokens ?? 0, output: result.usage?.output_tokens ?? 0,
        cacheWrite:result.usage?.cache_write_input_tokens ?? 0, reasoning:result.usage?.reasoning_output_tokens ?? 0 };
      if(!schema) return completion;
      let output:unknown;
      try { output=JSON.parse(result.finalResponse); } catch { throw new ProviderError('upstream',completion); }
      return applyToolOutput(request,completion,output);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
