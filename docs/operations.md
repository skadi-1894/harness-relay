# Operations and provider login

## Helm

For a parameterized deployment, use the [example Helm chart](../charts/harness-relay/README.md). It includes existing-Secret authentication, a persistent PVC, probes and an optional ServiceMonitor. The plain manifests below remain available as an alternative.

## Kubernetes

The example uses one StatefulSet replica and a persistent auth volume. Do not scale replicas sharing one OAuth refresh credential: concurrent refreshes may invalidate it. Auth persistence is not conversation memory. Backup/encrypt the PVC as credential material.

1. Publish the image, then pin the image version/digest in `k8s/statefulset.yaml`. The example `0.1.0` image is a placeholder until a release is published. Use a storage class supporting the PVC; ensure any GHCR package is public or configure imagePullSecrets.
2. Create the namespace and a Secret named `harness-relay`, containing independent `INFERENCE_API_KEY` and `METRICS_TOKEN` values. For example, store only these two values in a local protected `gateway.env`, then run `kubectl -n harness-relay create secret generic harness-relay --from-env-file=/path/to/gateway.env`. Do not commit that file or credentials. Manage the Secret via your usual secret manager for production.
3. Set provider/model configuration in the manifest; disable any provider you will not authenticate. Readiness requires every enabled provider to have a locally recognized login.
4. Run `kubectl apply -k k8s`. Before login the Pod can run with readiness false: the startup/liveness probes check `/health/live`, so it will not restart while waiting for auth.
5. Authenticate using the built-in CLI:

```sh
kubectl -n harness-relay exec -it harness-relay-0 -- npm run auth -- claude login subscription
kubectl -n harness-relay exec -it harness-relay-0 -- npm run auth -- claude status
kubectl -n harness-relay exec -it harness-relay-0 -- npm run auth -- codex login device
kubectl -n harness-relay exec -it harness-relay-0 -- npm run auth -- codex status
```

For Claude, `oauth` securely prompts for an existing setup-token; `api` prompts for an Anthropic API key. Subscription login runs the official CLI's browser flow via terminal capture. When a headless browser redirect is unavailable, generate a token locally with the official `claude setup-token` and use the `oauth` method inside the Pod. Never paste a secret into a command argument, a chat or a manifest committed to Git.

Alternatively inject a Claude credential through your secret manager as `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`. Or mount JSON `{ "authEnv": "CLAUDE_CODE_OAUTH_TOKEN", "secret": "..." }` as a Secret file and set `CLAUDE_CREDENTIAL_FILE` to its path. This file is read for each request, so projected Secret rotation needs no restart. Environment injection needs a Pod restart to rotate and takes precedence over a saved credential file.

Codex login uses its official file credential store under `/state/codex`; refreshes can update it. Claude setup-tokens are rotated by repeating login. Readiness caches local CLI checks for ten seconds and never makes a paid model call. It cannot detect every revocation, account ban or upstream outage; use inference errors and an opt-in end-to-end smoke check for that.

## Runtime controls

- A ClusterIP Service exposes port 3000. Add your ingress/TLS/access policies if exposing it beyond trusted clients. Kubernetes RBAC should restrict access to `pods/exec` and the auth PVC/Secrets.
- The root filesystem is read-only, all capabilities are dropped and service-account automount is disabled. The container has no host source tree mounted. Tools and inherited project/user settings are disabled for Claude; Codex uses an empty working directory/read-only sandbox with shell and web search disabled. Use only dedicated configuration homes.
- `MAX_CONCURRENT_REQUESTS` limits active CLI processes. `RATE_LIMIT_PER_MINUTE` is a process-local, source-IP limiter; requests traverse no trusted proxy by default. Behind a proxy, all clients may share its quota. Do not blindly trust X-Forwarded-For.
- `REQUEST_TIMEOUT_MS` aborts requests; disconnects abort upstream work. `SHUTDOWN_GRACE_MS` drains in-flight requests on SIGTERM. Keep `terminationGracePeriodSeconds` larger than this setting. Tini forwards SIGTERM to the gateway so its SDK processes can drain before cancellation; it also reaps orphaned children.
- Resource settings are starting values, not capacity guarantees. Measure CPU/memory with your enabled models and concurrency. Both native CLIs ship in the image.
- No new memory/session continuation layer is implemented. Claude persistence is disabled. Codex may keep its normal CLI session artifacts under its dedicated home; these are never resumed by this relay.
- Third-party functions are version-attributed in `THIRD_PARTY_NOTICES.md`. Upgrading SDK/CLI versions requires re-running tests and opt-in live checks; upstream auth formats/terms may change.

## Monitoring

`monitoring/servicemonitor.yaml` and `monitoring/alerts.yaml` are optional Prometheus Operator resources. Add the labels selected by your Prometheus installation before applying. Create them in the same namespace as the bearer-token Secret. Without the Operator, adapt `monitoring/prometheus.yml` and mount the metrics bearer token as a file.

The app writes JSON to stdout for your existing Alloy/Fluent Bit/Vector collector to ship to Loki. See `docs/observability.md`. It does not run or configure Loki/Prometheus in the cluster itself.
