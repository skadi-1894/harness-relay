# Local operations

Harness Relay is intended for one person's local development and self-hosted inference on a small computer. Docker Compose is the supported deployment approach. **Do not use it as a Kubernetes workload or a horizontally scalable production gateway.** More instances cannot increase the allowance of one personal subscription, and processes sharing a refresh credential can interfere with each other.

For installation, login and your first API request, follow [Docker local setup](docker-local.md). The model runs on the provider's infrastructure; your machine hosts the facade and CLIs.

## Authentication and persistence

The Compose `auth` volume contains the dedicated Codex and Claude homes under `/state`. Treat it as credential material: protect backups and do not share it with other users or mount your everyday CLI home into the relay. Keep one running instance per credential set. Saving login state does not implement conversation memory.

Use `docker compose exec -it inference npm run auth -- claude login api` for an Anthropic API key, or the approved `oauth` / `subscription` method. For Codex, use `docker compose exec -it inference npm run auth -- codex login device`. The official CLI handles browser/device authentication; never supply an account password to this service.

Claude tokens/keys are saved atomically with mode 0600 and read for each request, so file-based rotation needs no restart. Environment credentials (`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`) override saved files; changing them requires `docker compose up -d` to recreate the container. Codex manages its own file credential store and refreshes. Re-run Claude login when a setup-token expires or is revoked.

`/health/live` checks the running process. `/health/ready` checks local credential recognition for every enabled provider, cached for ten seconds. It does not make a model request or verify your remaining allowance. If one provider is unused, disable it in `.env` and recreate the container.

## Limits and updates

The API listens on localhost by default. Connect your own tools using the configured bearer key. Keep `.env` private and use your normal secure access method if reaching a home server remotely.

`MAX_CONCURRENT_REQUESTS` limits active CLI calls. `RATE_LIMIT_PER_MINUTE` is a process-local source-IP limit; it does not create provider capacity. `REQUEST_TIMEOUT_MS` cancels overdue requests. On stop, the service drains for `SHUTDOWN_GRACE_MS`, then cancels remaining work; keep Compose `stop_grace_period` longer than that duration.

The container runs unprivileged with a read-only root filesystem, a writable `/tmp` and an auth volume. CLI tools and inherited project settings are disabled for Claude; client function definitions produce validated decisions for external execution, never local tool execution; Codex runs in an empty working directory with shell/web access disabled. These controls suit a personal relay; they are not a production SLA or multi-user isolation boundary.

Use `docker compose up --build -d` after source updates. Ordinary `docker compose down` preserves the auth volume; removing volumes deletes saved logins. Do not scale the service with Compose replicas. Claude session persistence is disabled; Codex may keep normal CLI artifacts in its dedicated home, but this relay never resumes them.

## Monitoring

The `/metrics` endpoint and JSON stdout logs remain available for optional Prometheus/Loki integration. They help track your own requests, tokens, failures and provider-reported quota events. See [observability](observability.md) for a standalone scrape example and query semantics. The service does not install a monitoring stack.

Included subscription allowance can avoid separate API-token charges for eligible requests. A subscription still has limits and may use paid credits/overage; requests authenticated with an API key incur normal API charges. Provider terms determine whether a subscription-backed integration is permitted.
