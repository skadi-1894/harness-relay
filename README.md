# Harness Relay

**Experimental · pre-1.0 · MIT.** [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Roadmap](docs/roadmap.md) · [Changelog](CHANGELOG.md)

A personal, OpenAI-compatible HTTP facade for Codex CLI and the Claude Agent SDK. Think of it as an OpenRouter-style entry point on your own computer: connect your tools to one familiar API and choose a configured provider/model. It is intended for local development and small, single-user self-hosted setups, including a spare mini PC or home server.

The relay and provider CLIs run on your machine; model inference still runs on the provider's infrastructure. No local GPU or model weights are required.

## Why use it?

Reuse an existing eligible subscription from your own scripts and OpenAI-compatible tools instead of setting up separate API billing for every experiment. When requests use included subscription allowance, they avoid separate per-token API charges for that usage. Subscription limits, model availability and provider terms still apply; purchased credits or overage may cost extra. API-key authentication uses the provider's normal API billing.

This is a small personal relay, not the OpenRouter service: there is no account pooling, automatic provider failover, billing marketplace or full OpenAI API coverage.

**Do not deploy this in Kubernetes or treat it as a production-grade inference gateway.** This project does not support horizontal scaling. A personal subscription is intended for one person's usage, not a shared production traffic budget; adding replicas does not add subscription capacity and can race credential refreshes. Use one Docker Compose instance for one user's tools. For scalable production workloads, use the providers' supported API products and infrastructure designed for that load.

## Quick start — Docker Compose

Follow the [local Docker setup guide](docs/docker-local.md) for configuration, provider login and your first request. Docker Compose is the only documented deployment method; host Node.js is not required.

```sh
git clone https://github.com/skadi-1894/harness-relay.git
cd harness-relay
cp .env.example .env
# Set independent random INFERENCE_API_KEY and METRICS_TOKEN values in .env.
# Enable only the provider(s) you plan to authenticate.
docker compose up --build -d
# Claude: API key, or an approved OAuth/subscription integration.
docker compose exec -it inference npm run auth -- claude login api
# Codex: open the URL shown by the CLI in your host browser.
docker compose exec -it inference npm run auth -- codex login device
```

Set `CODEX_ENABLED=false` for Claude-only operation, or `CLAUDE_ENABLED=false` for Codex-only operation. `DEFAULT_MODEL` chooses the model when a request omits it. Authenticate every enabled provider; readiness stays false until all enabled CLIs recognize credentials.

Claude supports subscription, OAuth-token and API-key authentication. Tokens/keys are stored atomically with `0600` permissions in the dedicated auth volume and loaded on each request. Environment credentials take precedence over the file. Codex stores and refreshes its own login. Claude setup-tokens require rotation when expired or revoked. Neither auth status nor readiness proves that upstream will accept an inference request.

**Provider terms:** [Anthropic's Agent SDK documentation](https://code.claude.com/docs/en/agent-sdk/overview) requires prior approval to offer claude.ai login/rate limits in third-party products. Use an API key unless your subscription integration is approved/permitted. [Codex authentication](https://learn.chatgpt.com/docs/auth) distinguishes ChatGPT-plan sign-in from API-key billing. This relay does not extend allowances or authorize account sharing.

## API

```sh
curl http://127.0.0.1:3000/v1/chat/completions \
  -H 'Authorization: Bearer YOUR_INFERENCE_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"model":"claude/sonnet","messages":[{"role":"user","content":"Explain dependency injection briefly"}],"stream":true,"reasoning_effort":"high"}'
```

Set an OpenAI SDK client's `baseURL` to `http://127.0.0.1:3000/v1` and its `apiKey` to `INFERENCE_API_KEY`.

| Endpoint | Authentication | Meaning |
| --- | --- | --- |
| `GET /health`, `/health/live` | Public | Process liveness |
| `GET /health/ready` | Public | All enabled providers' local CLIs recognize credentials; returns 503 during draining |
| `GET /metrics` | `METRICS_TOKEN`, falling back to `INFERENCE_API_KEY` | Prometheus exposition |
| `GET /v1/models` | `INFERENCE_API_KEY` | Operator-configured model catalog |
| `POST /v1/chat/completions` | `INFERENCE_API_KEY` | Text conversation, JSON or SSE |

Request fields: `messages` (text-only system/developer/user/assistant), `model`, `stream`, `reasoning_effort`, `service_tier`. Unknown fields return 400. Models use `claude/sonnet`, `claude/opus`, `claude/haiku`, or your configured IDs; plain Claude aliases also resolve. Existing Codex model IDs remain compatible; `codex/<model>` also resolves.

Claude supports `low`, `medium`, `high`, `xhigh`, `max` effort; Codex additionally accepts `minimal` and `ultra`. Actual support depends on the upstream model. `service_tier: fast` or `priority` requests fast mode; omitted Claude tier is standard. Configuration is in [.env.example](.env.example).

Claude streams SDK text deltas as OpenAI SSE chunks. Codex currently buffers the complete SDK response before emitting SSE. Errors after streaming begins arrive as an SSE `error` object followed by `[DONE]`. Each request is independent; the supplied history is serialized into one prompt. This is not native Chat Completions role isolation. Tools, images, JSON schema output, temperature, max_tokens and the Responses API are not supported.

## Local operation and monitoring

Run a single Docker Compose instance with its persistent auth volume. The container uses UID 1000, a read-only root filesystem and writable `/tmp`. Request/concurrency limits and graceful shutdown help keep a small personal setup predictable; they do not make a subscription-backed service scalable.

[Local operations](docs/operations.md) covers auth persistence, rotation and updates. [Metrics and Loki](docs/observability.md) describes token/cost semantics, PromQL and optional log collection. Monitoring is optional and does not require a cluster.

## Development and verification

Development requires Node.js 22.13+ and npm.

```sh
npm ci
npm run dev
npm run check
npm run smoke
# Explicit live checks consume provider allowance:
SMOKE_MODEL=claude/sonnet npm run smoke:live
```

Jest verifies HTTP compatibility, auth parsing, credential storage, Claude/Codex SDK adapters, streaming, metrics, quota events, cancellation and release gates. CI checks PRs, builds and smoke-tests the runtime image, then publishes to `ghcr.io/skadi-1894/harness-relay` on main/version-tag pushes. Actions and the Node image are pinned. See [release procedure](docs/releases.md) and [verification record](docs/verification-results.md).

MIT covers this relay and its attributed third-party code; vendor SDKs/CLIs retain their own licenses and terms. This is an independent project, not affiliated with OpenAI or Anthropic.
