# Security policy

## Supported versions

Harness Relay is pre-1.0 and experimental. Security fixes target the latest released version and current `main`; older releases are not maintained. No audit or production-readiness claim is made.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/skadi-1894/harness-relay/security/advisories/new). Describe the affected version, impact and a minimal reproduction using dummy credentials. Do not disclose exploits or secrets through public issues or pull requests. There is no guaranteed response SLA.

If a credential has already leaked, revoke it with its provider before reporting. Never attach `auth.json`, `.env`, a Codex home, bearer tokens, or full private request logs.

## Trust boundary

This service runs an agent CLI under its own operating-system identity. API callers must be trusted to spend that account's allowance. Bearer authentication, disabled tools and a read-only sandbox do not make a shared account safe for arbitrary public access. Use a dedicated Codex home, an unprivileged container, network isolation and TLS where appropriate. Do not use your daily Codex configuration as the service configuration.

`/health` is public liveness only; it does not verify account health or model access. Prompts and responses may be processed and retained by the upstream provider according to that provider's terms. Rate limits, supported models and billing remain provider-controlled.
