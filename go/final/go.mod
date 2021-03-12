module main

go 1.15

require (
	github.com/gin-gonic/gin v1.6.3
	go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin v0.18.0
	go.opentelemetry.io/contrib/instrumentation/net/http/httptrace/otelhttptrace v0.18.0
	go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.18.0
	go.opentelemetry.io/otel v0.18.0
	go.opentelemetry.io/otel/exporters/otlp v0.18.0
	go.opentelemetry.io/otel/sdk v0.18.0
	go.opentelemetry.io/otel/trace v0.18.0
)
