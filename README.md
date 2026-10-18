# Harness Relay

**Experimental · pre-1.0 · MIT.** [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Roadmap](docs/roadmap.md) · [Changelog](CHANGELOG.md)

OpenAI-compatible NestJS inference relay for locally authenticated Codex CLI and the official Claude Agent SDK. Includes subscription/API-key authentication workflows, streaming Claude output, JSON logs, Prometheus metrics and Kubernetes manifests. No conversation memory or thread reuse.

## Quick start

Requires Node.js 22 and access to a configured provider/model. Both CLIs are installed by npm.

```sh
git clone https://github.com/skadi-1894/harness-relay.git
cd harness-relay
npm ci
cp .env.example .env
# Set independent random INFERENCE_API_KEY and METRICS_TOKEN values in .env.
npm run build
npm run auth -- claude login subscription
# Or: npm run auth -- claude login oauth
# Or: npm run auth -- claude login api
npm run auth -- codex login device
npm start
```

Set `CODEX_ENABLED=false` for Claude-only operation, or `CLAUDE_ENABLED=false` for Codex-only operation. `DEFAULT_MODEL` chooses the model when a request omits it. The CLI preserves the earlier `npm run auth` (Codex browser), `npm run auth -- --device-auth`, and `npm run auth:status` shortcuts. Build before running authentication commands.

Claude auth adapts NanoClaw's subscription/OAuth/API flows, token extraction and credential classification, with MIT attribution in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Tokens/keys are stored atomically with `0600` permissions outside the checkout and loaded on each request. Alternatively inject `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` through your secret manager. Environment credentials take precedence over the file. Provider credentials are never accepted through the inference HTTP API.

Use a dedicated Codex/Claude home. Local defaults are `~/.harness-relay` and `~/.harness-relay/claude`; containers persist both under `/state`. Codex stores and refreshes its own login. Claude `setup-token` produces a long-lived token: reauthenticate/rotate it when it expires or is revoked. `npm run auth -- claude status` checks configuration presence; Kubernetes readiness also checks local CLI recognition. Neither promises that upstream has accepted a live inference request.

**Provider terms:** [Anthropic's Agent SDK documentation](https://code.claude.com/docs/en/agent-sdk/overview) says third-party developers need prior approval to offer claude.ai login/rate limits in their products. NanoClaw's implementation is not such approval. Use Anthropic API-key auth unless your subscription integration is approved/permitted. Subscription usage remains subject to account limits; this relay does not extend them.

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

## Deployment and monitoring

```sh
docker compose up --build -d
docker compose exec -it inference npm run auth -- claude login subscription
docker compose exec -it inference npm run auth -- codex login device
```

The container runs as UID 1000 with a read-only root filesystem, a writable `/tmp`, and persistent auth volume. Tini forwards signals and reaps child processes. Admission is rate/concurrency bounded; shutdown marks readiness false, drains active work, then aborts remaining calls. Application metrics are process-local counters; Prometheus retains history across restarts.

[Kubernetes and auth runbook](docs/operations.md) covers PVC-backed login, probes, secrets, resource limits, and monitoring integration. [Metrics and Loki](docs/observability.md) describes token/cost semantics, PromQL, quota freshness, and log collection. Manifests are examples to configure and apply yourself, not a deployment to your cluster.

## Development and verification

```sh
npm run dev
npm run check
npm run smoke
# Explicit live checks consume provider allowance:
SMOKE_MODEL=claude/sonnet npm run smoke:live
```

Jest verifies HTTP compatibility, NanoClaw-derived auth parsing, credential storage, Claude/Codex SDK adapters, streaming, metrics, quota events, cancellation and release gates. CI checks PRs, builds and smoke-tests the runtime image, then publishes to `ghcr.io/skadi-1894/harness-relay` on main/version-tag pushes. Actions and the Node image are pinned. See [release procedure](docs/releases.md) and [verification record](docs/verification-results.md).

MIT covers this relay and the attributed NanoClaw code; vendor SDKs/CLIs retain their own licenses and terms. This is an independent project, not affiliated with OpenAI or Anthropic.
