# OpenTelemetry for Go (The Hard-ish Way)

OpenTelemetry is an Application Programming Interface (API) and Software Development Kit (SDK) for the creation, modification, and export of telemetry data such as metrics, logs, and traces. OpenTelemetry for Go is the reference implementation of the API and SDK, for the Go programming language. This guide is intended to walk you through the fundamental steps of adding OpenTelemetry to an existing client-server application.

This guide assumes a familiarity with the Go programming language and common Linux command-line utilities (such as `curl`). In addition, it assumes you are familiar with the  concepts of OpenTelemetry (if you'd like a refresher, see [the introduction](/README.md#about-opentelemetry)). This guide uses code that can be found in the subfolders of this directory, at different stages, for you to follow along with.

The application itself is an HTTP server that uses the Gin framework for routing and middleware. It exposes an endpoint at `/getActivity` that expects an `HTTP POST` request as part of a form submission. This endpoint returns JSON to the caller. You can find the base version of the application, with no instrumentation added, [here](00/main.go).

## Table of Contents

* [Installation](#installation)
* [Initializing OpenTelemetry](#initializing-opentelemetry)
* [Adding Automatic Instrumentation](#adding-automatic-instrumentation)
* [Enriching Automatic Spans](#enriching-automatic-spans)
* [Propagating Span Context](#propagating-span-context)

## Installation

OpenTelemetry contains quite a few individual packages and libraries that you'll need to import. There's a rationale for this behavior, though - the SDK is designed to be composable (as in, you can re-implement various parts of it and mix them together) in order to support integration with a variety of other pre-existing telemetry libraries. In addition, OpenTelemetry can be thought of as a 'low level' API and SDK. This leads to an "explicit, not implicit" design philosophy -- we want to make sure that end users and integrators alike are able to narrowly scope what's imported into their code.

With that in mind, let's talk about installation. In Go, OpenTelemetry is published as a collection of modules in the `go.opentelemetry.io/otel` namespace. In order to keep our business logic relatively clean, we're going to create a separate file that contains our OpenTelemetry setup and configuration code (like [this](01/otel.go)). Next, we need to import the basic requirements for using OpenTelemetry -

* Providers, which is the object that manages the telemetry pipeline for a specific type of telemetry (either metrics or traces).
* Exporters, which define a sink for the telemetry data (such as `stdout`, a file, or a network endpoint).
* Propagators, which define how telemetry context is communicated between processes.

Let's start with the basics - a trace provider, a `stdout` exporter, and W3C Trace-Context propagation. First, import the required packages:

```go
import (
	"context"
	"log"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/stdout"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/semconv"
)
```

In addition to our provider - `"go.opentelemetry.io/otel/sdk/trace"` - we're also installing an exporter, propagation, and bringing in two more useful packages - `resource` and `semconv`. Resources are attributes that apply to all telemetry created by a service, things like the service's friendly name, or the IP address of its host. `semconv` provides helper methods for creating attributes that respect the [OpenTelemetry semantic conventions](https://github.com/open-telemetry/opentelemetry-specification/tree/main/semantic_conventions).

Next, create an initialization function. We don't need to return a value from our initializer, as OpenTelemetry provides some convenience functions in the API to manage access to the tracers and metric instruments it creates.

```go
// InitOpenTelemetry initializes OpenTelemetry and sets up the export pipeline
func InitOpenTelemetry() {
  log.Println("Initializing OpenTelemetry")
  // add init code here
  log.Println("OpenTelemetry Initialized")
}
```

We're ready to configure OpenTelemetry.

## Initializing OpenTelemetry

Like I mentioned earlier, there's three crucial things you need to configure in order to use OpenTelemetry; providers, exporters, and propagation. Conventionally, export is the first thing you'll set up -- you need an exporter for your provider. Let's start by adding a `stdout` exporter to our `InitOpenTelemetry` function:

```go
  exporter, err := stdout.NewExporter(stdout.WithPrettyPrint())
  if err != nil {
    log.Fatalf("Failed to create stdout exporter: %v", err)
  }
```

`stdout.NewExporter` supports [a variety of options](https://pkg.go.dev/go.opentelemetry.io/otel/exporters/stdout#Option) that can be used to tune its configuration. You can disable metric or trace reporting, you can modify the destination of the export stream, and so forth. `WithPrettyPrint` tells the exporter to write JSON-formatted text to the console. After the exporter, our next step will be to create some recommended resources.

```go
	res, err := resource.New(ctx,
		resource.WithAttributes(semconv.ServiceNameKey.String("go-server")),
		resource.WithAttributes(semconv.ServiceVersionKey.String("1.0.0")),
	)
  if err != nil {
		log.Fatalf("Failed to create resources: %v", err)
	}
```

Resources, again, are special attributes that apply to all telemetry created by a service. More specifically, resources can be registered on a provider, and any telemetry that is processed by that provider will be annotated with those resources. In this case, we're creating a `service.name` and `service.version` resource.

> Resources vs. Attributes
> All resources are attributes, but not all attributes are resources. A resource should be something that applies to all of the traces (or metrics) generated by a single provider; you wouldn't put session or request-specific stuff in there.

After this, it's time to create a provider. A provider fulfills several important roles:

* Managing the creation and lifecycle of tracers (or meters), objects that allow you to create and manage specific types of telemetry data.
* Setup and teardown of telemetry processing pipelines
* Batching or synchronizing telemetry data to an exporter, and ensuring that telemetry continues to flow smoothly.

A provider is where configuration, resources, pipelines, and exporters are registered. A provider should be initialized soon after the start of your application, and one of the last things destroyed when the application shuts down. Let's add one now:

```go
	provider := sdktrace.NewTracerProvider(
		sdktrace.WithConfig(sdktrace.Config{DefaultSampler: sdktrace.AlwaysSample()}),
		sdktrace.WithResource(res),
		sdktrace.WithBatcher(
      exporter, 
      sdktrace.WithBatchTimeout(5*time.Second), 
      sdktrace.WithMaxExportBatchSize(10)
    ),
	)
```

The first thing you might notice is the call to `WithConfig`. There's two things you'll want to be aware of here. First, `DefaultSampler` allows you to determine the default sampling strategy for spans and traces being processed by this provider. [Read more](https://pkg.go.dev/go.opentelemetry.io/otel/sdk/trace#Sampler) about the samplers available, or use `AlwaysSample` as a good default. I recommend not sampling at the process level at _all_ and performing tail-based sampling with the OpenTelemetry Collector, or setting this to `ParentBased`. The second config option (not pictured here) is [`SpanLimits`](https://pkg.go.dev/go.opentelemetry.io/otel/sdk/trace#Config) which allow you to limit the number of attributes, events, or links to spans. This usually isn't important, but it can be useful to ensure that you're not adding hundreds of thousands or millions of attributes to a single span if you don't want to.`WithResource` assigns resource(s) to the spans generated by a provider; in this case, the `service.name` and `service.version` resources we created earlier. Finally, `WithBatcher` is a convenience method to create a batching span processor. We give it an exporter (where the span batches go to after processing), along with a fixed time window to batch in (5 seconds) and a maximum batch size (10). More plainly, this tells the batcher to send a batch of spans to the `stdout` exporter every 5 seconds, or for every 10 spans, whichever comes first. Batching is strongly recommended in order to produce consistent report sizes and memory allocations.

The final piece of code in this snippet handles 