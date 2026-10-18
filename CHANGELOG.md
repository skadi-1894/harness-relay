# Changelog

Changes are grouped by release. Before 1.0, minor releases may change behavior; patch releases are intended for compatible fixes. No release has been published yet.

## Unreleased

### Added

- OpenAI-compatible text Chat Completions and a configured model list via NestJS.
- Official Codex SDK integration with a dedicated auth home and per-request workspace.
- Model, reasoning effort and fast-tier configuration.
- Bearer authentication, request cancellation, deadlines and bounded concurrency.
- Incremental Claude SSE and buffered Codex SSE.
- Jest contract tests, Docker image/Compose and Husky checks.
- Contribution/security documentation, issue/PR templates and Dependabot configuration.
- SHA-pinned CI, container smoke checks and tag-driven release automation.

- Official Claude Agent SDK provider with attributed NanoClaw subscription/OAuth/API-key authentication helpers.
- Protected Prometheus metrics, quota observations, JSON stdout logs for Loki collectors and request IDs.
- Liveness/readiness, graceful draining, rate limiting, persistent auth volumes and Kubernetes/monitoring examples.

### Known limitations

- Subscription quota data is available only when the upstream SDK reports it; token counters are not a subscription balance.
- Authenticated live verification is separate from offline CI.
- A new Claude login and live inference require an operator-authenticated check; offline tests do not establish account access.
