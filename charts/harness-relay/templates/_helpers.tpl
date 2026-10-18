{{- define "harness-relay.fullname" -}}
{{- .Release.Name | trunc 54 | trimSuffix "-" -}}
{{- end -}}
{{- define "harness-relay.selectorLabels" -}}
app.kubernetes.io/name: harness-relay
app.kubernetes.io/instance: {{ .Release.Name | quote }}
{{- end -}}
{{- define "harness-relay.labels" -}}
{{ include "harness-relay.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service | quote }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | quote }}
{{- end -}}
