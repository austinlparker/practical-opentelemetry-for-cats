# OpenTelemetry for Go (The Hard-ish Way)

OpenTelemetry is an Application Programming Interface (API) and Software Development Kit (SDK) for the creation, modification, and export of telemetry data such as metrics, logs, and traces. OpenTelemetry for Go is the reference implementation of the API and SDK, for the Go programming language. This guide is intended to walk you through the fundamental steps of adding OpenTelemetry to an existing client-server application.

This guide assumes a familiarity with the Go programming language and common Linux command-line utilities (such as `curl`). In addition, it assumes you are familiar with the  concepts of OpenTelemetry (if you'd like a refresher, see [the introduction](/README.md#about-opentelemetry)). This guide uses code that can be found in the subfolders of this directory, at different stages, for you to follow along with.

The application itself is an HTTP server that uses the Gin framework for routing and middleware. It exposes an endpoint at `/getActivity` that expects an `HTTP POST` request as part of a form submission. This endpoint returns JSON to the caller. You can find the base version of the application, with no instrumentation added, [here](00/main.go).

## Table of Contents

* [Installation](#installation)
* [Initializing OpenTelemetry](#initializing-opentelemetry)
* [Adding Automatic Instrumentation](#adding-automatic-instrumentation)
* [Exporting To The Collector](#exporting-to-the-collector)
* [Span Enrichment](#span-enrichment)

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

> **Resources vs. Attributes**
>
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

> **Cleanup and Exit**
>
> One question I often get is "What happens if my program crashes? How do I ensure the error is flushed?" In most cases this shouldn't be an issue, as the batch processor has logic to ensure that spans added to the queue are exported. If your application or service runs for a short amount of time and stops (such as a batch or serverless job), then you may wish to `defer` a call to the `Shutdown` method of `BatchSpanProcessor` in order to ensure that spans are flushed.

After creating an exporter and provider, set up propagation and register everything. Propagation is set at a process level, rather than at the provider level - this is because propagation and context underpin the trace and metrics providers. Proper configuration and initialization of context propagation is **crucial** to distributed tracing.

```go
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
```

In this example, we're using [W3C Trace Context](https://www.w3.org/TR/trace-context/) for both Trace Context and Baggage. Other propagators exist (you can find documentation [here](https://pkg.go.dev/go.opentelemetry.io/contrib/propagators)) and are useful if you're integrating with an existing tracing system such as AWS X-Ray, Zipkin, or Jaeger. In addition, you can register multiple propagators with `NewCompositeTextMapPropagator` as required - this is useful when migrating from an older tracing system to a fully OpenTelemetry-based one.

The last thing to do, then, is register your trace provider with the OpenTelemetry API.

```go
otel.SetTracerProvider(provider)
```

Once you've done that, OpenTelemetry is ready to use in your application. Now you can get to the business of instrumenting your application code.

## Adding Automatic Instrumentation

Installing and configuring OpenTelemetry is great, but by itself, isn't terribly useful. Thankfully, the OpenTelemetry community and other contributors provide a wide range of integrations with existing frameworks and libraries to jump start your instrumentation. In most cases, this is the best place to start - distributed tracing is all about tracing requests in a distributed system, after all.

The particulars of automatic instrumentation differ based on the library or framework you're using. In this example, we're using the [`gin`](https://github.com/gin-gonic/gin) HTTP web framework. Installing the automatic instrumentation is, quite literally, two lines of code -

```go
import (
	...
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	...
)

func main() {
	...
	router := gin.Default()
	router.Use(otelgin.Middleware("go-server"))
	...
}
```

This instrumentation acts by adding a tracing middleware to all routes that are registered to this router. This middleware is responsible for several things:

* Extracting incoming trace context
* Starting a new span or trace as appropriate
* Adding attributes per the semantic conventions
* Setting the span on the request context
* Closing the span when the request is complete

That's a lot of code that you don't have to write! Once you've added this, you can test it out - start the server with `go get && go run *.go`, then in another window run `curl localhost:8080`. You should see output similar to the following:

```
[
        {
                "SpanContext": {
                        "TraceID": "0deb2ea99a22cd4fd618763a6e42a244",
                        "SpanID": "a5fc8c3bc0ab0561",
                        "TraceFlags": 1,
                        "TraceState": null
                },
                "ParentSpanID": "0000000000000000",
                "SpanKind": 2,
                "Name": "/",
                "StartTime": "2021-03-10T10:12:45.8035704-05:00",
                "EndTime": "2021-03-10T10:12:45.8035943-05:00",
                "Attributes": [
                        {
                                "Key": "net.transport",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "IP.TCP"
                                }
                        },
                        {
                                "Key": "net.peer.ip",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "127.0.0.1"
                                }
                        },
                        {
                                "Key": "net.peer.port",
                                "Value": {
                                        "Type": "INT64",
                                        "Value": 50212
                                }
                        },
                        {
                                "Key": "net.host.name",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "localhost"
                                }
                        },
                        {
                                "Key": "net.host.port",
                                "Value": {
                                        "Type": "INT64",
                                        "Value": 8080
                                }
                        },
                        {
                                "Key": "http.method",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "GET"
                                }
                        },
                        {
                                "Key": "http.target",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "/"
                                }
                        },
                        {
                                "Key": "http.server_name",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "go-server"
                                }
                        },
                        {
                                "Key": "http.route",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "/"
                                }
                        },
                        {
                                "Key": "http.user_agent",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "HTTPie/0.9.8"
                                }
                        },
                        {
                                "Key": "http.scheme",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "http"
                                }
                        },
                        {
                                "Key": "http.host",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "localhost:8080"
                                }
                        },
                        {
                                "Key": "http.flavor",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "1.1"
                                }
                        },
                        {
                                "Key": "http.status_code",
                                "Value": {
                                        "Type": "INT64",
                                        "Value": 200
                                }
                        }
                ],
                "MessageEvents": null,
                "Links": null,
                "StatusCode": "Unset",
                "StatusMessage": "HTTP status code: 200",
                "HasRemoteParent": false,
                "DroppedAttributeCount": 0,
                "DroppedMessageEventCount": 0,
                "DroppedLinkCount": 0,
                "ChildSpanCount": 0,
                "Resource": [
                        {
                                "Key": "host.name",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "hazard"
                                }
                        },
                        {
                                "Key": "service.name",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "go-server"
                                }
                        },
                        {
                                "Key": "telemetry.sdk.language",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "go"
                                }
                        },
                        {
                                "Key": "telemetry.sdk.name",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "opentelemetry"
                                }
                        },
                        {
                                "Key": "telemetry.sdk.version",
                                "Value": {
                                        "Type": "STRING",
                                        "Value": "0.18.0"
                                }
                        }
                ],
                "InstrumentationLibrary": {
                        "Name": "go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin",
                        "Version": "semver:0.18.0"
                }
        }
]
```

Once you've added instrumentation for incoming requests, you'll also want to add them to outgoing ones as well. In this specific example, we don't have a service that will receive the trace context, but having a distinct span that captures the work being done by fetching our remote API will be useful for profiling. Again, we need to add some imports and modify our calling code:

```go
import(
	...
	"net/http/httptrace"
	"go.opentelemetry.io/contrib/instrumentation/net/http/httptrace/otelhttptrace"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	...
)

func getActivityWithParams(ctx context.Context, t string) (apiResponse, error) {
	...
	c := http.Client{Transport: otelhttp.NewTransport(http.DefaultTransport)}
	ctx = httptrace.WithClientTrace(ctx, otelhttptrace.NewClientTrace(ctx))
	...
}
```

What does this do? Similarly to what happens with the server instrumentation, client instrumentation is responsible for creating spans that represent the work being done to communicate with the remote server -- name resolution, TLS negotiation, sending and receiving data. 

If you run the application again (`go get && go run *.go`) then run `curl -X POST localhost:8080/getActivity`, then you'll see significantly more JSON output. If you look for the `InstrumentationLibrary` key, you should see the names of the instrumentation; `httptrace` and `otelgin`.

This covers the essentials of automatic instrumentation. The good news is that these essentials cover a significant amount of the work required to instrument a service. Your incoming, and outgoing, requests are traced. Adding instrumentation for other libraries and calls you might make work in a similar fashion. You can find more instrumentation libraries in the [OpenTelemetry Registry](https://opentelemetry.io/registry/?language=go&component=instrumentation) or the [OpenTelemetry Go Contrib Repository](https://github.com/open-telemetry/opentelemetry-go-contrib/tree/main/instrumentation), along with usage examples.

However, there's a few things we haven't done yet, so stick with me and let's make this data more useful. 

## Exporting To The Collector

The OpenTelemetry Collector is a lightweight telemetry collection and translation server. It can be deployed alongside your application in a variety of ways, depending on how you deploy your application. Running on a VM? Run the collector as a daemon service on each machine. Kubernetes? You can run it as a DaemonSet, Sidecar, or standalone Deployment. Collectors have three main benefits:

* Separation of concerns between instrumentation and collection
* Modify telemetry (filters, sampling) without changing application code
* Transform and export telemetry to different backend services

While you can export your traces directly from a process to a backend system that supports OpenTelemetry (like Jaeger, Zipkin, or a plethora of vendors), using a collector instance as a tracing proxy allows for greater flexibility and control. In addition, collectors can be used as log and metric processors, giving you a 'swiss army knife' for collecting telemetry signals from your application, reducing tool sprawl. 

Exporting to the collector is a straightforward process - you'll need a few pieces of information in advance, though. First, what format can the collector recieve? Second, what port is it listening on? Let's assume you're using OpenTelemetry Protocol (OTLP), with a collector instance available at `collector` on the network (this is how the example `docker-compose.yaml` is set up). Adding OTLP export to a collector requires the following changes to `otel.go`:

```go
import (
	...
	"go.opentelemetry.io/otel/exporters/otlp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpgrpc"
	...
)

func InitOpenTelemetry(ctx context.Context) {
	endpoint := "localhost:4317"
	if collector, ok := os.LookupEnv("COLLECTOR_ENDPOINT"); ok {
		endpoint = collector
	}
	driver := otlpgrpc.NewDriver(
		otlpgrpc.WithEndpoint(endpoint),
		otlpgrpc.WithInsecure(),
	)

	// replace the stdout exporter with this
	exporter, err := otlp.NewExporter(ctx, driver)
	if err != nil {
		log.Fatalf("Failed to create collector exporter: %v", err)
	}
	...
}
```

> **Environment Variables for Configuration**
>
> The [OpenTelemetry Specification](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/protocol/exporter.md) defines standard environment variables for configuring endpoints which, once they're available, should be used in lieu of defining your own env vars for config.

This configuration will batch and forward all spans to a collector rather than `stdout`. For more information on configuring a collector, [see this document](TODO).

## Span Enrichment

Often, you'll want to add more data to a span that already exists, or create children of that span to capture the work being done by business logic in your application. This process can be referred to as 'enrichment' of the telemetry created by automatic instrumentation.

Broadly, enrichment covers two main use cases:

* Explicit creation of new spans in order to better model the work being performed under a request
* Adding events or attributes to an existing span that aren't added by automatic instrumentation

The former use case is relatively straightforward -- it is most often the case that your service does _something_ interesting in the process of handling a request that can vary between invocations, and these other functions are interesting in and of themselves as pieces of code to profile and understand. The latter use case is also rather straightforward -- it's unlikely that the automatic instrumentation for your RPCs will be able to capture information in a request that would be useful for debugging (such as unique session or user identifiers), so you would want to add it in yourself.

Generally, there's two things you need to know in order to enrich existing spans. The first is how to get the _current span from context_, and the other is how to _create a child span_. Fetching the current span requires you to call `trace.SpanFromContext(ctx context.Context)` with the context parameter set to the Go context object you wish to fetch the span from. Refer to line 47 of `./final/main.go` --

```go
oteltrace.SpanFromContext(c.Request.Context()).SetAttributes(attribute.Bool("emptyForm", (len(formType) > 0)))
```

Conveniently, you can chain invocations from `SpanFromContext`; In this example, we're fetching the span that's contained in the Gin request context, then setting an attribute named 'emptyForm' on it to the boolean result of the `formType` variable. In plainer terms, we're creating an attribute on the span that represents this request that tells us if the form was empty or not.

What if you want to start a new span? There's two things you need to do in that case. First, you'll need a `tracer`. If you're just using automatic instrumentation, you may not have created one; A tracer (otherwise known as a 'named tracer') is an interface to the underlying tracer provider, and is used internally by OpenTelemetry to group spans by the component that created them. Remember earlier, how spans from the Gin instrumentation and HTTP client instrumentation had different InstrumentationLibrary values? That's because they came from distinct tracers. You could use this feature to create logical 'components' inside a larger service -- for example, ensuring that spans from your authn/z code are distinct from spans in your API handlers. In our example service, we create a tracer by calling `var tracer = otel.Tracer("go-server")` outside of main, making it available to all of our other functions and files.

Once you have a tracer, creating a child span is performed by calling `tracer.Start(ctx context.Context, name string, ...opts SpanOption)`, like so:

```go
func getActivityWithParams(ctx context.Context, t string) (apiResponse, error) {
	ctx, span := tracer.Start(ctx, "getActivityWithParams", oteltrace.WithAttributes(attribute.String("activityType", t)))
	defer span.End()
	...
}
```

`tracer.Start` returns not only a reference to the span we created, but a new context object. It's important, especially in Go, to ensure that you don't misplace or mishandle the context object, as passing the wrong context to OpenTelemetry functions can result in broken or misshapen traces. Each span must have a name -- conventionally, the name should represent the work being captured by the span. In this case, since the span contains all the work being done by the function `getActivityWithParams`, the span is also named that. Finally, you can pass an arbitrary amount of attributes, events, or other options to a newly created span. Remember to `defer span.End()` so that your span completes when the function returns!

You can find a complete reference to the Tracing API [here](https://pkg.go.dev/go.opentelemetry.io/otel/trace) -- there's a lot more options that I didn't get into, but this should be enough to get you started.

