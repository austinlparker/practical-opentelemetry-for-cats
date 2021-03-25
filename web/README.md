# Practical OpenTelemetry for Web

OpenTelemetry is an Application Programming Interface (API) and Software Development Kit (SDK) for the creation, modification, and export of telemetry data such as metrics, logs, and traces. OpenTelemetry for Go is the reference implementation of the API and SDK, for the Go programming language. This guide is intended to walk you through the fundamental steps of adding OpenTelemetry to an existing client-server application.

This guide assumes a familiarity with the JavaScript programming language and common Linux command-line utilities (such as `curl`). In addition, it assumes you are familiar with the  concepts of OpenTelemetry (if you'd like a refresher, see [the introduction](/README.md#about-opentelemetry)). This guide uses code that can be found in the subfolders of this directory, at different stages, for you to follow along with.

//TODO: Fetch instrumentation and CORS
## Table of Contents

* [Installation](#installation)
* [Initializing OpenTelemetry](#initializing-opentelemetry)
* [Adding Automatic Instrumentation](#adding-automatic-instrumentation)
* [Exporting To The Collector](#exporting-to-the-collector)
* [Span Enrichment](#span-enrichment)

## Installation

OpenTelemetry contains quite a few individual packages and libraries that you'll need to import. There's a rationale for this behavior, though - the SDK is designed to be composable (as in, you can re-implement various parts of it and mix them together) in order to support integration with a variety of other pre-existing telemetry libraries. In addition, OpenTelemetry can be thought of as a 'low level' API and SDK. This leads to an "explicit, not implicit" design philosophy -- we want to make sure that end users and integrators alike are able to narrowly scope what's imported into their code.

With that in mind, let's talk about installation. OpenTelemetry packages are published under the `@opentelemetry/*` namespace in NPM. In addition, several metapackages are available that install a bundle of dependencies for you, especially useful for easily installing instrumentation libraries. It's a good practice to install and configure the OpenTelemetry SDK and instrumentation packages in a separate module (see [this file](final/src/tracer.js) for an example), and to only depend on the OpenTelemetry API in the rest of your code. There's three requirements for an OpenTelemetry installation -

* Providers, which manage the telemetry pipeline for a specific type of telemetry (either metrics or traces)
* Exporters, which define sinks for the telemetry data (such as the JavaScript console, a file, or a network endpoint)
* Propagators, which define how telemetry context is communicated between processes.

> **Yes, You Need To Use Webpack**
>
> As of this writing, there's no pre-bundled script file that you can import from a CDN for OpenTelemetry JS. This means you need to use a bundler in order to generate a JS blob that includes all of the dependencies required. If you're using something like `create-react-app`, the bundler that it includes will work fine - that's what I did here!

First, install the required libraries -

```
$ npm install --save @opentelemetry/api @opentelemetry/context-zone @opentelemetry/core @opentelemetry/tracing @opentelemetry/web @opentelemetry/instrumentation-document-load @opentelemetry/instrumentation-fetch @opentelemetry/instrumentation-user-interaction @opentelemetry/exporter-collector
```

Now, create `tracing.js` in `src`, and add the following imports -

```javascript
import { ConsoleSpanExporter, BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { WebTracerProvider } from '@opentelemetry/web';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { CollectorTraceExporter } from '@opentelemetry/exporter-collector';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
```

Let's briefly cover these. `WebTracerProvider` is our _provider_, which is responsible for managing tracers and the span export pipeline. `CollectorTraceExporter` and `ConsoleSpanExporter` are exporters, which are responsible for actually writing traces to an endpoint; The collector exporter will send them through HTTP-JSON to an OpenTelemetry Collector, and the console exporter writes them to the browser console. `SimpleSpanProcessor` and `BatchSpanProcessor` are responsible for actually processing each span as it's finished and sending it to an exporter. We're demonstrating both here; for web applications, it's useful to know about the tradeoffs. Simple processor will report each individual span as it's completed, the batch processor will create configurable batches of spans and send them out.

> **Default Batch Sizes and Export**
>
> By default, the batch processor will export batches up to 512 spans every 5000 milliseconds, with a 30000 millisecond timeout. Up to 2048 spans can be queued for export before they're dropped. Tuning the batch exporter is an important part of using OpenTelemetry in production; You want to ensure that your batches are generally of similar size and don't create too much contention during loads or other times of heavy work. Keep in mind that, if available, OpenTelemetry exporters will try to use the Beacon API so the work of exporting happens in an asynchronus and non-blocking fashion.

There's two more important 'classes' of imports here - `ZoneContextManager` helps manage the in-process context for spans. At a high level, OpenTelemetry needs a way to know what's the 'active' work being done, especially when calling `async` functions or Promises. 