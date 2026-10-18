import type { ToolCall } from './tools.js';

export interface Completion {
  toolCalls?: ToolCall[];
  text: string;
  input: number;
  cached: number;
  output: number;
  cacheWrite?: number;
  reasoning?: number;
  estimatedCostUsd?: number;
}
export interface Quota {
  window: string;
  status: 'allowed' | 'allowed_warning' | 'rejected';
  utilization?: number;
  resetsAt?: number;
}
export interface Callbacks { onDelta?: (text: string) => void; onQuota?: (quota: Quota) => void }
export type FailureKind = 'authentication' | 'rate_limit' | 'billing' | 'upstream';
export class ProviderError extends Error {
  constructor(public readonly kind: FailureKind, public readonly usage?: Completion) { super(`Provider ${kind} failure`); }
}
