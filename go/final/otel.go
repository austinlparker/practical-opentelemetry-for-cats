package main

import (
	"context"
	"log"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpgrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/semconv"
)

// InitOpenTelemetetry initializes OpenTelemetry
func InitOpenTelemetry(ctx context.Context) {
	endpoint := "localhost:4317"
	if collector, ok := os.LookupEnv("COLLECTOR_ENDPOINT"); ok {
		endpoint = collector
	}
	driver := otlpgrpc.NewDriver(
		otlpgrpc.WithEndpoint(endpoint),
		otlpgrpc.WithInsecure(),
	)
	exporter, err := otlp.NewExporter(ctx, driver)
	if err != nil {
		log.Fatalf("Failed to create collector exporter: %v", err)
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(semconv.ServiceNameKey.String("go-server")),
	)

	provider := sdktrace.NewTracerProvider(
		sdktrace.WithConfig(sdktrace.Config{DefaultSampler: sdktrace.AlwaysSample()}),
		sdktrace.WithResource(res),
		sdktrace.WithBatcher(
			exporter,
			sdktrace.WithBatchTimeout(5*time.Second),
			sdktrace.WithMaxExportBatchSize(10),
		),
	)

	otel.SetTracerProvider(provider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
	log.Println("opentelemetry configured!")
}
