# Harness Relay

**Experimental · pre-1.0 · MIT.** [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Roadmap](docs/roadmap.md) · [Changelog](CHANGELOG.md)

A personal, OpenAI-compatible HTTP facade for Codex CLI and the Claude Agent SDK. Think of it as an OpenRouter-style entry point on your own computer: connect your tools and agents to one familiar API and choose a configured provider/model. It is intended for local development and small, single-user self-hosted setups, including a spare mini PC or home server. Your agents can also query the existing endpoints to inspect usage and provider status when needed.

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
| `POST /v1/chat/completions` | `INFERENCE_API_KEY` | Text conversation and client function calls, JSON or SSE |

Request fields: `messages` (text-only system/developer/user/assistant/tool), `model`, `stream`, `reasoning_effort`, `service_tier`, `tools`, `tool_choice`, `parallel_tool_calls`. Unknown fields return 400. Models use `claude/sonnet`, `claude/opus`, `claude/haiku`, or your configured IDs; plain Claude aliases also resolve. Existing Codex model IDs remain compatible; `codex/<model>` also resolves.

Claude supports `low`, `medium`, `high`, `xhigh`, `max` effort; Codex additionally accepts `minimal` and `ultra`. Actual support depends on the upstream model. `service_tier: fast` or `priority` requests fast mode; omitted Claude tier is standard. Configuration is in [.env.example](.env.example).

Claude streams SDK text deltas as OpenAI SSE chunks. Codex currently buffers the complete SDK response before emitting SSE. Errors after streaming begins arrive as an SSE `error` object followed by `[DONE]`. Each request is independent; the supplied history is serialized into one prompt. This is not native Chat Completions role isolation. Images, public `response_format`/JSON schema output, temperature, max_tokens and the Responses API are not supported.

## Client function calling (including LangChain `bind_tools`)

Both providers accept OpenAI function definitions in `tools`, with `tool_choice: "auto"` (default), `"none"`, `"required"`, or `{"type":"function","function":{"name":"weather"}}`. `parallel_tool_calls: false` limits the response to one call. Empty `tools: []` is valid. Legacy `functions`/`function_call` fields and non-function tools are unsupported.

```json
{
  "model": "claude/sonnet",
  "messages": [{"role": "user", "content": "What is the weather in Warsaw?"}],
  "tools": [{"type": "function", "function": {
    "name": "weather",
    "description": "Get the current weather for a city",
    "parameters": {
      "type": "object", "properties": {"city": {"type": "string"}},
      "required": ["city"], "additionalProperties": false
    }
  }}],
  "tool_choice": "required"
}
```

A call response has `choices[0].finish_reason: "tool_calls"` and `message.tool_calls`, each with an opaque `id`, `type: "function"`, and `function: {name, arguments}`. Arguments are a JSON **string**. Execute calls in your client, append the complete assistant message, then append a `role: "tool"` message for **each** call with its `tool_call_id` and string `content`. Send that history and the same tools in the next request, usually with `tool_choice: "auto"`, to obtain the final answer or more calls. Results may arrive in any order; missing, duplicate and orphaned results return 400.

LangChain can use its usual `ChatOpenAI(...).bind_tools([...])` flow with this relay's base URL and API key. Tool results from `ToolMessage` are accepted. Other unsupported options still return 400; do not configure temperature or max_tokens on this client.

This is a **structured-output adaptation**, using the official [Codex SDK outputSchema](https://github.com/openai/codex/blob/main/sdk/typescript/README.md) and [Claude Agent SDK outputFormat](https://code.claude.com/docs/en/agent-sdk/structured-outputs). Tool definitions and history are serialized into the prompt; this does not provide native Chat Completions role isolation or native provider function-call semantics. The relay never executes client tools, shell commands or MCP servers. Tool-enabled turns buffer the decision, including SSE: tool call chunks carry `index`, `id`, `type`, `function.name` and `function.arguments`, followed by `finish_reason: "tool_calls"` and `[DONE]`. Internal structured-output JSON is never streamed as assistant text.

Parameter schemas are validated locally with AJV (JSON Schema draft-07 and standard formats); invalid/unsupported schemas return 400 before inference. Returned arguments are checked against the corresponding schema, names and choice/parallel constraints before any calls are exposed. Invalid provider decisions return a sanitized 502 and consumed tokens remain counted. `strict` is accepted, but all returned arguments are validated regardless of that flag; unsupported schema dialects/async or unresolved remote references are rejected. Client-side validation and authorization of tool execution still apply. Structured decisions add overhead; provider model support and limits still apply.

## Usage and status for your tools and agents

You do not need a monitoring stack to see what the relay is doing. External agents with HTTP tools can query the existing endpoints directly, using the appropriate bearer key:

| Endpoint | What an agent can inspect |
| --- | --- |
| `GET /metrics` | Observed token consumption by provider/model, request counts, failures, duration histograms and subscription quota observations when the provider reports them |
| `GET /health/ready` | Whether each enabled provider's local CLI recognizes credentials; this is not a live inference or remaining-allowance check |
| `GET /v1/models` | The configured provider/model catalog; this is not a guarantee of upstream account access |

```sh
curl http://127.0.0.1:3000/metrics \
  -H 'Authorization: Bearer YOUR_METRICS_TOKEN'
curl http://127.0.0.1:3000/health/ready
curl http://127.0.0.1:3000/v1/models \
  -H 'Authorization: Bearer YOUR_INFERENCE_API_KEY'
```

`/metrics` returns Prometheus text, which an agent can read without running Prometheus. The other two endpoints return JSON. Configure your agent to query them when you need usage or status information; the relay does not automatically add monitoring tools to inference requests.

Token counters cover observed work through this relay since its process started and reset on restart. They are not your whole subscription history or a billing statement. Other applications may spend the same allowance. Claude quota observations include their last-observed and reset timestamps when available; Codex currently exposes request usage without account quota windows. Missing or stale quota data means unknown, not zero usage or unlimited capacity.

## Local operation and optional monitoring

Run a single Docker Compose instance with its persistent auth volume. The container uses UID 1000, a read-only root filesystem and writable `/tmp`. Request/concurrency limits and graceful shutdown help keep a small personal setup predictable; they do not make a subscription-backed service scalable.

JSON logs are there to diagnose your own requests and errors. Read them directly with `docker compose logs -f inference`; they omit credentials and prompt/response bodies. If you want a dashboard or searchable history, connect the same metrics to Prometheus/Grafana and the logs to Loki. Those integrations are optional conveniences for a personal setup, not a production-readiness claim.

[Local operations](docs/operations.md) covers auth persistence, rotation and updates. [Metrics and Loki](docs/observability.md) documents the metric names, freshness rules, token/cost semantics and example queries.

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
