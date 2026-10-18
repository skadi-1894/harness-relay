# Verification record

## 2026-10-18 — local pre-release checkout

- Node.js 22: type checking, 20 Jest HTTP/SDK adapter/release-gate tests and production build passed.
- Fresh Docker build targeting Linux amd64 completed from the committed-format npm lockfile, with no host node_modules or credentials in the build context.
- Runtime smoke passed (liveness, authentication, model catalog, invalid request). See `docs/verification.md` for the reproducible command.
- Live HTTP Chat Completions check passed using the official bundled Codex CLI 0.163.0, model `gpt-6.1-sol`, and an existing ChatGPT login in an isolated temporary home. Returned usage: 11,235 input tokens (9,216 cached) and 9 output tokens. This is reported usage, not money spent or a subscription balance.
- The live check did not exercise a new browser/device login. That flow requires the account owner's interaction.
- GitHub Actions workflow validated locally with actionlint. The OSS changes in this record have not been committed or pushed, so their GitHub-hosted checks, GHCR publication and release creation have not run. A base main branch was published independently during this work.
- Production npm dependencies: no reported vulnerabilities at verification time. The dev test-tool chain currently has a moderate `sprintf-js` advisory (GHSA-hp3w-g68c-fv3c), propagated through Jest/ts-jest. npm reports 20 affected dependency nodes; no patched sprintf-js version was available from the registry. It is absent from the runtime dependency tree. Dependabot is enabled; do not use `npm audit fix --force` to downgrade Jest as a workaround.

This record applies to this local checkout and does not establish support for all accounts, models, architectures or future provider versions. Repeat the checks before publishing a release.

## 2026-10-18 — Claude/auth/observability extension

- Added the official Claude Agent SDK 0.3.296 and Claude Code 2.1.296; copied/adapted the version-attributed third-party MIT auth helpers, subscription capture, credential classification and provider event handling.
- 38 Jest tests in the combined test suite cover both providers, token accounting on failure, incremental Claude SSE before completion, quota warning/rejection semantics, auth storage/rotation, readiness, admission limits, request-log privacy and shutdown draining. Tests use SDK fixtures and do not consume subscription allowance.
- A fresh Linux arm64 runtime image built successfully. Native Claude CLI version, liveness, missing-auth readiness (503), and the metrics endpoint were exercised under a read-only root filesystem with writable temporary state; runtime dependencies reported no npm advisories.
- The monitoring rule expressions were validated with promtool. No remote deployment was performed.
- A new Claude browser login and real Claude inference have not been performed: the account owner must complete the interactive login, then run the opt-in live smoke. The earlier Codex live result above predates this extension and is not evidence of a live check of the combined version.
- The earlier dev-toolchain advisory remains confined to development dependencies. No dependency downgrade or forced audit fix was applied.

## 2026-10-18 — local Docker guide and single-user scope

- The local Docker Compose example passes `docker compose config --quiet`; Docker runtime smoke and all 38 Jest tests passed after moving auth helpers into neutral paths.
- Deployment is now limited to a single Docker Compose instance for personal development/self-hosting. Earlier cluster examples have been removed and are not supported deployment artifacts.
- The guide does not imply that interactive account login has been tested. No remote deployment was performed.
