# Verification

## Clean runtime, without account access

```sh
docker build -t harness-relay:check .
docker run --rm harness-relay:check node scripts/smoke.mjs --container
```

This builds from the lockfile and checks the production runtime, public liveness, authentication, model catalog and request validation. No credentials are mounted and no upstream inference is requested. The default CI runs the same smoke check. Linux amd64 is the CI target; other architectures need their own verification.

For local development use `npm ci && npm run check`. To check an already-running service with the key from `.env`, use `npm run smoke`. To override its address, set `SMOKE_BASE_URL`.

## Authenticate and make the first real request

Follow README.md to set `.env`, then:

```sh
npm run auth
# Headless alternative, if enabled for your account:
# npm run auth -- --device-auth
npm run auth:status
npm run build
npm start
# In another terminal in the same checkout:
npm run smoke:live
```

The opt-in live check uses the configured model list (or `SMOKE_MODEL`), requests a fixed public marker, verifies the response and nonzero reported token usage, and prints only model/usage/result metadata. It does not print credentials or conversation content. Authentication, account eligibility and provider availability cannot be tested offline. A new account login requires the account owner to complete the provider's browser/device flow.

In a container, run the official login against the same persistent auth volume as the service:

```sh
docker compose run --rm inference node scripts/auth.mjs --device-auth
docker compose up --build -d
npm run smoke:live
```

Ensure `.env` has the same service bearer key as Compose, and create the dedicated volume directory with permissions writable by the image's `node` user before running Compose. On Linux the container UID is 1000. Do not mount your everyday Codex home.

Live tests are intentionally excluded from public CI. Each maintainer should repeat them before a release; keep credentials and private account data out of the recorded result.
