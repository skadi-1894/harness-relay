# Run locally with Docker Compose

This guide builds from the checkout and keeps provider credentials in a Docker volume. No host Node.js/npm installation is needed. Commands use a Unix shell (Linux/macOS, or WSL). Requires Git, Docker with a running engine, and the Compose plugin (`docker compose version`).

## 1. Prepare configuration

```sh
git clone https://github.com/skadi-1894/harness-relay.git
cd harness-relay
umask 077
cp .env.example .env
chmod 600 .env
```

If you already have `.env`, edit it rather than overwriting it. Generate **two different** random secrets, for example by running `openssl rand -hex 32` twice. Put one into `INFERENCE_API_KEY`, the other into `METRICS_TOKEN` in `.env`.

Choose a provider in `.env` before starting. Claude-only:

```dotenv
INFERENCE_API_KEY=<your first random secret>
METRICS_TOKEN=<your second random secret>
CODEX_ENABLED=false
CLAUDE_ENABLED=true
DEFAULT_MODEL=claude/sonnet
CLAUDE_MODEL=sonnet
CLAUDE_MODELS=sonnet,opus,haiku
```

Codex-only:

```dotenv
INFERENCE_API_KEY=<your first random secret>
METRICS_TOKEN=<your second random secret>
CODEX_ENABLED=true
CLAUDE_ENABLED=false
DEFAULT_MODEL=gpt-6.1-sol
CODEX_MODEL=gpt-6.1-sol
CODEX_MODELS=gpt-6.1-sol
```

To use both, set both enabled flags to `true`, configure their model lists, and authenticate both. The placeholders above are explanatory: replace them with actual secrets. Keep unrelated settings from `.env.example` or use the application's defaults.

## 2. Build and start

```sh
docker compose config --quiet
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:3000/health/live
```

The first build downloads both native CLIs and can take several minutes. The service is exposed only on `127.0.0.1:3000`. A container marked `healthy` means its process is alive; before provider login, `/health/ready` should return `503`.

The Compose file fixes the container listener to port 3000. To use a different host port, edit only the left side of `127.0.0.1:3000:3000` in `compose.yaml`, then use that port in the commands below.

## 3. Authenticate inside the running container

### Claude

For an Anthropic API key, use the hidden prompt:

```sh
docker compose exec -it inference npm run auth -- claude login api
```

For an approved subscription integration, either sign in interactively:

```sh
docker compose exec -it inference npm run auth -- claude login subscription
```

Or generate a token using the official `claude setup-token` on a machine where the browser login works, then paste it into the hidden prompt inside the container:

```sh
docker compose exec -it inference npm run auth -- claude login oauth
```

The latter is useful when a browser redirect cannot reach a CLI running inside Docker. Do not put tokens in command arguments. Provider account terms still apply; see the [README](../README.md#quick-start).

Check saved credential presence:

```sh
docker compose exec inference npm run auth -- claude status
```

### Codex

Start device pairing, then open the URL shown by the CLI in your host browser and enter the code:

```sh
docker compose exec -it inference npm run auth -- codex login device
docker compose exec inference npm run auth -- codex status
```

Account/workspace settings must permit device authentication. This is the official CLI flow; the service never asks for your account password.

### Check readiness

```sh
curl --fail http://127.0.0.1:3000/health/ready
```

Readiness checks local credential recognition for **every enabled provider**, with a cache of up to ten seconds. If you only logged in to Claude, disable Codex in `.env`, then recreate the container with `docker compose up -d`. Credential files are loaded on each request; login itself needs no restart. Readiness does not prove upstream access or available allowance.

## 4. Send a real request

This consumes your configured provider's allowance. Replace `YOUR_INFERENCE_API_KEY` with the key from `.env`; replace the model with `gpt-6.1-sol` for Codex.

```sh
curl --fail-with-body http://127.0.0.1:3000/v1/chat/completions \
  -H 'Authorization: Bearer YOUR_INFERENCE_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"model":"claude/sonnet","messages":[{"role":"user","content":"Reply with hello"}]}'
```

For streaming, add `"stream":true` to the request and `-N` to curl. Claude streams text deltas; Codex currently sends the completed answer in SSE format.

OpenAI-compatible clients use base URL `http://127.0.0.1:3000/v1` and `INFERENCE_API_KEY` as their API key.

## 5. Inspect logs and metrics

```sh
docker compose logs --tail=100 -f inference
curl --fail http://127.0.0.1:3000/metrics \
  -H 'Authorization: Bearer YOUR_METRICS_TOKEN'
```

Logs are JSON suitable for a Loki collector. Metrics include request durations, token counts, failures and provider-reported subscription limit observations. No separate local monitoring stack is needed to start the relay; attach your existing tools when desired. See [observability](observability.md) for metrics semantics and queries.

## 6. Stop, restart and update

```sh
docker compose stop
docker compose start
# After changing .env:
docker compose up -d
# After updating source:
docker compose up --build -d
```

The named `auth` volume survives restart, rebuild and ordinary `docker compose down`. OAuth/API credentials live there, so treat the volume as a secret and include it in your protected backup process. `docker compose down -v` deletes the saved logins: do not use it for routine updates. Keep the same Compose project name/directory, otherwise Docker may select a new empty volume.

Repeated Claude login rotates the stored file. If a credential was supplied as an environment variable instead, it overrides the file; update/remove that variable and recreate the container to change the active credential.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `/health/ready` returns 503 | Inspect its provider flags, log in to every enabled provider, wait ten seconds; disable unused providers |
| `/v1/*` returns 401 | Use `INFERENCE_API_KEY`, not the provider token or metrics token |
| `/metrics` returns 401 | Use `METRICS_TOKEN` (falls back to the API key only when unset) |
| Request returns 400 | Use a configured model and supported text-only request fields |
| Provider returns 429/502/503 | Check auth status, account/model access and JSON error logs; readiness only checks local credentials |
| Browser login cannot finish | Use Claude's token-paste flow or Codex device pairing |
| Updated `.env` has no effect | Run `docker compose up -d` to recreate with the new environment |
| Port 3000 is in use | Change the host-side port mapping and your client URL |

The container starts unprivileged with a read-only root filesystem, writable scratch space and its auth volume. These defaults do not need a host source-code mount or privileged mode.
