# Roadmap

Status: experimental, pre-1.0. Intended for one person’s local development and small self-hosted inference setup via Docker Compose. Horizontal scaling and production traffic are outside the project’s scope.

## Implemented locally

- Codex and Claude SDK providers with configured model allowlists and OpenAI text Chat Completions.
- Claude subscription/OAuth/API-key authentication, Codex browser/device login and a persistent Docker auth volume.
- Incremental Claude text SSE and buffered Codex SSE; tool-enabled turns buffer structured decisions. Conversation history is supplied by the client, without persisted sessions.
- Client function calls and tool-result history for both providers, adapted via SDK structured outputs; tools execute only in the client.
- JSON stdout logs for Loki collectors, bounded Prometheus request/token/duration/error metrics, and SDK-reported Claude subscription quota events.
- Liveness/readiness, rate/concurrency bounds, shutdown draining, non-root Docker Compose and optional standalone monitoring.
- Runtime smoke, release gates and opt-in live verification; vendor terms still apply.

## Next

- Repeat end-to-end inference checks for each provider/account after the operator completes login.
- Native incremental Codex output if the selected SDK transport exposes suitable events.
- Additional protocol compatibility only when supported and tested.

## Out of scope

Kubernetes deployment, horizontal scaling, multi-user production serving, conversation memory, account pooling, subscription-limit bypasses, billing/reselling, general tool execution and reconstruction of subscription balances from token counters.
