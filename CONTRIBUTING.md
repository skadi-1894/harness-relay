# Contributing to Harness Relay

Harness Relay is experimental. Codex is the only implemented provider today. Please discuss new providers and compatibility changes in an issue before opening a large PR.

## Local development

Use Node.js 22 and npm (the lockfile is committed). From a clean checkout:

```sh
npm ci
cp .env.example .env
# Set a random INFERENCE_API_KEY and log in as described in README.md.
npm run build
npm start
```

`npm run dev` starts the source directly. `npm run check` runs type checking, Jest and the production build. Husky runs the same checks before commits. All default tests are offline and must not consume subscription allowance.

## Structure

- `src/request.ts`: strict request schema and transcript adaptation.
- `src/config.ts`: validated operator configuration and model allowlist.
- `src/codex.service.ts`: Codex SDK integration and temporary workspace cleanup.
- `src/api.ts`: HTTP compatibility, deadline, cancellation and concurrency limits.
- `src/app.ts`: application composition and bearer authentication.
- `test/`: HTTP contract and SDK adapter tests.

A future provider should implement the completion boundary (text and explicit input/cache/output usage), preserve cancellation, and have its own authentication/configuration. Add an explicit registry before exposing a second provider; do not silently route unknown model names. Never invent token usage or subscription balance values when a provider does not report them.

## Pull requests

Keep changes focused, explain the user-visible behavior and include appropriate validation. Update README/API documentation when behavior changes. Add regression tests for fixes and meaningful tests for new behavior. Never include credentials, auth homes, prompt logs, screenshots containing secrets, or real private conversations. Security issues belong in private reports, not public issues.

New dependencies should have a clear purpose and compatible license. Preserve required attribution when adapting third-party code. Contributions are provided under this repository's MIT license. There is no CLA requirement.

## Live verification

Follow `docs/verification.md`. Live checks are opt-in, use your own account and consume subscription allowance. Never add account credentials to CI, even temporarily.

## Releases

See `docs/releases.md`. Maintainers review and publish releases; contributors should not create release tags as part of ordinary PRs.
