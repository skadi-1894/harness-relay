# NanoClaw

Source: https://github.com/nanocoai/nanoclaw

Revision: `7be8d7f6b9863e7c78c513717c21a6fcf04c3d28`.

Copyright (c) 2026 Gavriel. MIT License, reproduced in `licenses/third-party-auth-MIT.txt`.

- `src/auth/helpers/captured-token.ts`: copied from `setup/lib/captured-token.ts`.
- `src/auth/helpers/supplied-credential.ts`: adapted from `suppliedCredential` in `.claude/skills/add-iron-proxy/scripts/auth.ts`.
- `scripts/capture-claude-token.sh`: adapted from `.claude/skills/add-iron-proxy/scripts/capture-claude-token.sh`.
- `src/auth-cli.ts`: authentication choices and subscription capture flow adapted from that same `auth.ts`; persistent storage uses a local credential file instead of Iron Proxy's store.
- `src/claude.service.ts`: SDK query, result/error and informational rate-limit handling adapted from `container/agent-runner/src/providers/claude.ts`.

Claude Agent SDK and Claude Code have their own vendor licenses and terms; this project's MIT license does not replace them.
