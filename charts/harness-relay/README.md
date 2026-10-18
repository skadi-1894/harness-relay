# Example Helm chart

Deploys one StatefulSet replica, a ClusterIP API Service, a headless identity Service, persistent provider authentication and an optional ServiceMonitor. It does not deploy Prometheus/Loki, publish an image, generate secrets or implement conversation memory.

## Prepare

Requires Kubernetes 1.26+, Helm 3/4, a suitable storage class and a published Harness Relay image. `appVersion: 0.1.0` is a default tag, not a guarantee that this image has been published. Override `image.tag` or pin `image.digest` to an existing image.

Create the target namespace and an existing Secret separately. The Secret must contain `INFERENCE_API_KEY` and `METRICS_TOKEN`, each at least 16 characters. Keep secrets out of Helm values and release history. For example, prepare a mode-0600 file containing only these keys:

```sh
kubectl create namespace harness-relay
kubectl -n harness-relay create secret generic harness-relay --from-env-file=/secure/path/gateway.env
```

## Install

The repository includes values overlays for each provider. This example selects Claude only:

```sh
helm lint charts/harness-relay --strict
helm template harness-relay charts/harness-relay \
  -n harness-relay -f charts/examples/claude-only.yaml
helm upgrade --install harness-relay charts/harness-relay \
  -n harness-relay -f charts/examples/claude-only.yaml \
  --set-string image.tag=YOUR_PUBLISHED_TAG
```

Avoid `--wait`/atomic rollback on the **first** install: readiness remains false until credentials are configured. Startup and liveness remain healthy so you can log in:

```sh
kubectl -n harness-relay exec -it harness-relay-0 -- npm run auth -- claude login api
# Or an approved OAuth/subscription method: claude login oauth / claude login subscription
kubectl -n harness-relay wait --for=condition=Ready pod/harness-relay-0 --timeout=120s
kubectl -n harness-relay port-forward service/harness-relay 3000:3000
```

For Codex, use `charts/examples/codex-only.yaml` and `npm run auth -- codex login device`. Default values enable both providers, so readiness requires login to both. Complete login/status commands and rotation details are in [operations](../../docs/operations.md).

An existing Secret can also contain `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`; the application reads these variables, avoiding interactive login. Environment credentials need a Pod restart to rotate. Do not put them under `env` in values.

## Options

See [values.yaml](values.yaml) and its JSON schema. Main settings:

| Value | Purpose |
| --- | --- |
| `image.repository`, `image.tag`, `image.digest` | Image reference; a digest takes precedence over tag |
| `existingSecret` | Required Secret name in the release namespace |
| `env` | Non-secret provider/model/runtime settings; fixed paths/ports and credentials are reserved |
| `persistence.size`, `persistence.storageClass` | Auth PVC size and optional storage class; empty class uses the cluster default |
| `persistence.existingClaim` | Mount an existing PVC instead of creating a claim template |
| `resources` | Gateway/native CLI resource requests and limits |
| `terminationGracePeriodSeconds` | Must exceed application shutdown grace |
| `serviceMonitor.enabled`, `serviceMonitor.additionalLabels` | Integrate an existing Prometheus Operator installation |
| `imagePullSecrets`, `nodeSelector`, `tolerations`, `affinity`, `podAnnotations` | Registry access, placement and annotations |

`charts/examples/monitoring.yaml` enables the ServiceMonitor; adjust the Prometheus selector label. Its bearer token comes from `existingSecret` using `serviceMonitor.tokenSecretKey` (default `METRICS_TOKEN`). The Operator CRDs must already exist.

Replica count is intentionally fixed at one because multiple processes sharing refreshed OAuth credentials can race. The chart enforces non-root execution, read-only root filesystem, no service-account token, writable `/tmp`, and `/state` on a PVC. It exposes no public ingress; add your usual TLS/access layer if needed.

Keep the release name and PVC settings stable across upgrades: StatefulSet claim templates are immutable. Uninstalling the release normally leaves its claim-template PVC; deleting it loses the saved provider login. Back up and rotate credential storage according to your policies.
