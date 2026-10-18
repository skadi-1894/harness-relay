# Harness Relay

Harness Relay exposes coding harnesses through an OpenAI-compatible HTTP API. The current implementation supports Codex; additional providers are planned.

Minimal NestJS facade exposing an OpenAI-compatible Chat Completions endpoint backed by the official Codex TypeScript SDK and CLI. Bring your own ChatGPT subscription and local Codex login. MIT licensed; independent project, not affiliated with OpenAI.

## Quick start

Requires Node.js 22+, npm, and access to a Codex-supported model through your account.

```sh
npm ci
cp .env.example .env
# Set INFERENCE_API_KEY to a random secret in .env.
# Use a dedicated Codex home, without personal config, MCP servers, skills, or hooks.
CODEX_HOME="$HOME/.harness-relay" npx --package @openai/codex@0.163.0 codex login
npm run build
npm start
```

The SDK includes the CLI; a global CLI installation is optional. `CODEX_PATH` can override its executable. The service defaults to the dedicated `$HOME/.harness-relay` home. Do not point it at your everyday Codex home: inherited configuration may enable tools or change the provider. Subscription authentication stays in that home, never in the repository or image. API-key environment variables are removed from the child process.

```sh
curl http://127.0.0.1:3000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_INFERENCE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-6.1-sol","messages":[{"role":"user","content":"Explain dependency injection briefly"}],"reasoning_effort":"medium","service_tier":"fast"}'
```

For an OpenAI SDK client, set `baseURL` to `http://127.0.0.1:3000/v1` and `apiKey` to your `INFERENCE_API_KEY`.

## API and settings

| Endpoint | Behavior |
| --- | --- |
| `GET /health` | Public process liveness; does not verify subscription or model access |
| `GET /v1/models` | Bearer-protected list from `CODEX_MODELS` |
| `POST /v1/chat/completions` | Bearer-protected text conversation, JSON or buffered SSE |

Supported request fields: `messages` (text-only system/developer/user/assistant), `model`, `stream`, `reasoning_effort`, `service_tier`. Unknown fields are rejected with 400 rather than silently ignored. `priority` aliases Codex `fast`. Default model, effort, tier, timeout and concurrency are configured in `.env`; see `.env.example`. Models are an operator-configured allowlist, not a live account catalog.

`stream: true` uses OpenAI SSE chunk framing and `[DONE]`, but sends the text only after inference finishes. It does **not** stream tokens. Requests are stateless: all supplied messages are serialized into one Codex prompt. Role separation is therefore an adaptation, not native Chat Completions message semantics. Tools, images, JSON-schema output, temperature, max_tokens, Responses API, billing, routing between providers and multi-account support are outside this minimal version.

Each request gets a temporary empty working directory, read-only sandbox, no approvals, disabled shell and web search, a deadline and cancellation on disconnect. Concurrency is bounded; excess requests return 429. Run with a dedicated account/container and Codex home. This wraps an agent CLI, not a raw inference engine.

Fast mode and reasoning settings depend on model/account support. Fast mode consumes subscription allowance faster; it is not a latency guarantee. This wrapper does not extend allowances or make subscription access equivalent to a paid OpenAI API entitlement. Consult the current account terms before sharing access.

## Docker

Authenticate the dedicated home on the host first, then:

```sh
docker compose up --build -d
```

The image runs as the unprivileged `node` user. Ensure the mounted dedicated home is writable by that container user (UID 1000 on Linux); login refreshes may write authentication state. The mount intentionally includes no host source code. Compose exposes port 3000 on localhost only. Keep `.env` out of Git and keep the service behind authentication/TLS if placing it on a network.

## Development and CI

```sh
npm run dev
npm run check
```

Jest tests cover HTTP compatibility, authentication, validation, settings, errors, SSE, timeouts and concurrency using a mocked inference backend; tests never consume subscription allowance. Husky runs the checks before commits.

GitHub Actions checks every PR and builds the Docker image. Pushes to `main` and version tags publish to `ghcr.io/<owner>/harness-relay` using `GITHUB_TOKEN` with `packages:write`. Tags include commit SHA, `latest` for the default branch, and semantic version for `v*` tags. PRs never publish. Set the repository and GHCR package visibility to public for open-source distribution (new packages may start private).

## References

- [Official Codex SDK](https://developers.openai.com/codex/sdk)
- [Codex speed and subscription usage](https://developers.openai.com/codex/speed)
- [NestJS documentation](https://docs.nestjs.com/)
- [Husky](https://typicode.github.io/husky/)
- [Publishing Docker images with GitHub Actions](https://docs.github.com/en/actions/publishing-packages/publishing-docker-images)
