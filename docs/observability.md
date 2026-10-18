# Metrics and Loki

## Prometheus

Scrape `/metrics` with `Authorization: Bearer <METRICS_TOKEN>`. If no metrics token is set, the API key is used. Metrics contain bounded provider, configured model, token kind, route, status and failure labels. Request IDs, URLs, prompts, account emails and credentials are never labels.

| Metric | Meaning |
| --- | --- |
| `http_requests_total` | Completed requests including failures/unauthorized calls; unmatched paths share one label |
| `http_request_duration_seconds` | HTTP duration histogram |
| `inference_request_duration_seconds` | SDK startup + inference + cleanup, labeled by provider/model/outcome |
| `inference_requests_in_flight` | Current active requests |
| `inference_tokens_total` | Observed input/output/cached/cache_write/reasoning counters |
| `inference_estimated_api_cost_usd_total` | SDK-reported API-equivalent cost estimate when available; **not subscription money charged** |
| `inference_failures_total` | Authentication/rate_limit/billing/upstream/timeout/cancelled failures |
| `inference_subscription_utilization_ratio` | Latest actual Claude SDK quota utilization (0–1) when reported |
| `inference_subscription_reset_timestamp_seconds` | SDK-reported reset time |
| `inference_subscription_observed_timestamp_seconds` | Observation freshness; no polling/refresh guarantee |
| `inference_subscription_rejections_total` | Rejected quota events, not ordinary allowed/warning events |
| `inference_auth_configured` | Local CLI credential-recognition result, updated by readiness checks |
| `gateway_*` | Standard Node/process/runtime metrics |

`input` includes cache reads and cache writes. `cached` and `cache_write` are subsets: do not sum every token kind. `reasoning` is a subset of output where reported. Claude accounting uses the result's per-model aggregate rather than only the main-loop usage, so internal query calls are counted. No requests resume sessions, so cumulative result envelopes are accounted once per call. Model labels are configured request aliases, not necessarily the resolved dated model ID.

The service records consumed tokens on failed calls if the SDK returned a final usage envelope. If a process is killed, times out before an envelope, or errors without usage, actual consumption can be larger than the observed counters. These are operational estimates, not a billing ledger.

Subscription balances cannot be reconstructed by subtracting token counts: other apps share the allowance and providers can apply different usage multipliers. Claude quota gauges come from real SDK events and remain absent until reported. Informational warnings do not fail requests. Codex currently reports request tokens, not account quota windows. Never interpret absent quota as zero utilization. Gauge values survive only until process restart and may become stale; use observation and reset timestamps when displaying/alerting.

Useful PromQL:

```promql
# Mean inference duration by provider/model over 5 minutes
sum by (provider, model) (rate(inference_request_duration_seconds_sum[5m]))
/
sum by (provider, model) (rate(inference_request_duration_seconds_count[5m]))

# p95 inference duration
histogram_quantile(0.95, sum by (le, provider, model) (rate(inference_request_duration_seconds_bucket[5m])))

# Input/output consumption per hour; excludes subset kinds
sum by (provider, model, kind) (increase(inference_tokens_total{kind=~"input|output"}[1h]))

# Subscription utilization observed in the last 10 minutes, before reset
inference_subscription_utilization_ratio
and on(provider, window) (time() - inference_subscription_observed_timestamp_seconds < 600)
and on(provider, window) (inference_subscription_reset_timestamp_seconds > time())
```

The optional alert rules use these freshness constraints. Configure Prometheus discovery, persistence and retention in your cluster to keep counter history across process restarts.

## Loki

Logs are Pino JSON to stdout, with ISO timestamp, severity, service, event, generated request_id, provider/model, bounded route/status, outcome and duration. No request/response body, query string, Authorization header, provider stderr or raw upstream exception is logged. `LOG_LEVEL` controls verbosity. Rejected inputs are summarized without echoing their values.

Have the existing Kubernetes log collector parse container stdout and forward it to Loki. Select Pods using `app.kubernetes.io/name=harness-relay`. Keep only stable deployment labels (namespace, app, container/service); request IDs belong in structured metadata or JSON content, never indexed Loki labels. The app does not push logs directly, avoiding another network/storage dependency in request handling.

Example LogQL (adapt the selector to your collector's labels):

```logql
{namespace="harness-relay"} | json | event="inference_failed"
{namespace="harness-relay"} | json | request_id="<X-Request-Id value>"
{namespace="harness-relay"} | json | provider="claude" | outcome="rate_limit"
```

Use the response `X-Request-Id` to correlate an HTTP response with inference logs. A request ID is generated by this service, never copied from an untrusted input header.
