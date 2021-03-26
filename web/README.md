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
$ npm install --save @opentelemetry/api @opentelemetry/context-zone @opentelemetry/core @opentelemetry/tracing @opentelemetry/web @opentelemetry/instrumentation-document-load @opentelemetry/instrumentation-fetch @opentelemetry/exporter-collector
```

Now, create `tracing.js` in `src`, and add the following imports -

```javascript
import { ConsoleSpanExporter, BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { WebTracerProvider } from '@opentelemetry/web';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { CollectorTraceExporter } from '@opentelemetry/exporter-collector';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { AlwaysOnSampler } from '@opentelemetry/core';
```

Let's briefly cover these. `WebTracerProvider` is our _provider_, which is responsible for managing tracers and the span export pipeline. `CollectorTraceExporter` and `ConsoleSpanExporter` are exporters, which are responsible for actually writing traces to an endpoint; The collector exporter will send them through HTTP-JSON to an OpenTelemetry Collector, and the console exporter writes them to the browser console. `SimpleSpanProcessor` and `BatchSpanProcessor` are responsible for actually processing each span as it's finished and sending it to an exporter. We're demonstrating both here; for web applications, it's useful to know about the tradeoffs. Simple processor will report each individual span as it's completed, the batch processor will create configurable batches of spans and send them out.

> **Default Batch Sizes and Export**
>
> By default, the batch processor will export batches up to 512 spans every 5000 milliseconds, with a 30000 millisecond timeout. Up to 2048 spans can be queued for export before they're dropped. Tuning the batch exporter is an important part of using OpenTelemetry in production; You want to ensure that your batches are generally of similar size and don't create too much contention during loads or other times of heavy work. Keep in mind that, if available, OpenTelemetry exporters will try to use the Beacon API so the work of exporting happens in an asynchronus and non-blocking fashion.

There's two more important imports here - `ZoneContextManager` helps manage the in-process context for spans. At a high level, OpenTelemetry needs a way to know what's the 'active' work being done, especially when calling `async` functions or Promises. Finally, there's `registerInstrumentations` and `FetchInstrumentation`, `UserInteractionInstrumentation`, and `DocumentLoadInstrumentation`. These are 'automatic instrumentation' plugins, and they bootstrap the process of generating trace data from your web application. We'll touch more on each, and what they do, in the next few sections.

With our imports sorted, stub out a new module to hold the initialization code -

```javascript
export default (serviceName) => {
  // init code goes here!
}
```

You're now ready to configure OpenTelemetry.

## Initializing OpenTelemetry

As mentioned earlier, there's three crucial things you need to configure in order to use OpenTelemetry; providers, exporters, and propagation. First things first, set up a provider.

```javascript
  const provider = new WebTracerProvider({
    sampler: new AlwaysOnSampler()
  });
  provider.register({
    contextManager: new ZoneContextManager()
  })
```

Our provider handles a lot of things behind the scenes - managing the creation and life of tracers (or meters, for metrics), which allow you to create and manage telemetry data. They're also responsible for the telemetry processing pipeline, which not only handles dispatch for export, but also allows for transforming spans or metrics after they're completed. One important note here is that some options are set in the `register` method of the provider, while others are set on the provider's constructor. We'll be explicit and register an `AlwaysOnSampler` (which samples all traces), but this is also the default behavior, so it could be omitted. To ensure that we can trace through promises, register a `ZoneContextManager` to our provider. We'll use the default propagator - W3C Trace-Context - but if we wanted to change it, this would be done in `provider.register`.

> **Provider Configuration**
>
> You can find a full list of configuration settings available to the provider [here](https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-tracing/src/types.ts) - there's quite a few options, including the ability to provide a custom generator for trace and spand ID's, and the ability to limit the number of attributes, events, and links on spans.

Next, let's add a basic processor and exporter, and get a tracer from our provider.

```javascript
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()))
```

The simple processor will export and handle each span as it finishes, and the console exporter will write the span as an object to the console. After this, our module should look like so:

```javascript
export default (serviceName) => {
  const provider = new WebTracerProvider({
    sampler: new AlwaysOnSampler()
  });
  provider.register({
    contextManager: new ZoneContextManager(),
  });
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
}
```

To initialize it, we need to add the module to the entry point of our application. In `index.js`, import the module and instantiate it.

```javascript
import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import Tracer from './tracer.js';

Tracer('web')

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);
```

OpenTelemetry is now configured. It doesn't really _do_ anything yet, so let's fix that.

## Adding Automatic Instrumentation

Installing and configuring OpenTelemetry is great, but by itself, isn't terribly useful. Thankfully, the OpenTelemetry community and other contributors provide a wide range of integrations with existing frameworks and libraries to jump start your instrumentation. In most cases, this is the best place to start - distributed tracing is all about tracing requests in a distributed system, after all.

OpenTelemetry for the Web offers a handful of instrumentation plugins out of the box. We saw them earlier in the installation step, and they cover three basic use cases. First, and most importantly, is `fetch` (or `XMLHttpRequest`) instrumentation. This plugin will hook into the `fetch` API and trace outgoing HTTP calls to other sites or services, and handles injecting trace context into those requests in order to propagate traces. The `DocumentLoad` plugin will create a trace for the page load itself.

> **What about the User Interaction plugin?**
>
> Eagle-eyed readers may note the `UserInteraction` instrumentation plugin available in the OpenTelemetry JS repository. This doesn't actually work very well with React, because it's not aware of the modified DOM (all of the clicks show up as on the root element). With time, better instrumentation options should become available.

Configuring these plugins for the web is handled by the `registerInstrumentation` helper. Let's add that now. After you've created your provider, call `registerInstrumentations`:

```javascript
registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({
      propagateTraceHeaderCorsUrls: /localhost.+/g
    }),
    new DocumentLoadInstrumentation()
  ],
  tracerProvider: provider
});
```

One **crucial** note here in the config - `propagateTraceHeaderCorsUrls` accepts a regular expression, and it determines if the fetch plugin should inject trace context based on CORS. If your API calls are being made to a cross-origin resource, then you need to ensure that this is set properly, otherwise your traces will break. We need to do this in the example, because our server and client are on different ports, and are as such cross-origin. The fetch plugin also allows you to ignore URLs that you _don't_ want traced at all by configuring the `ignoreUrls` property.

Let's see if it works. Save, then run the application with `yarn start`, and open your browser console. You should see some output from `ConsoleSpanExporter` that looks like this:

```
{
    "traceId": "c2a9124698062b64e0c56f487999117e",
    "parentId": "a548fc811becc1b9",
    "name": "documentFetch",
    "id": "fa797874588d2a1e",
    "kind": 0,
    "timestamp": 1616684838970064,
    "duration": 327210,
    "attributes": {
        "component": "document-load",
        "http.response_content_length": 867
    },
    "status": {
        "code": 0
    },
    "events": [
        {
            "name": "fetchStart",
            "time": [
                1616684838,
                970064111
            ]
        },
        {
            "name": "domainLookupStart",
            "time": [
                1616684838,
                972354111
            ]
        },
        {
            "name": "domainLookupEnd",
            "time": [
                1616684838,
                972354111
            ]
        },
        {
            "name": "connectStart",
            "time": [
                1616684838,
                972354111
            ]
        },
        {
            "name": "secureConnectionStart",
            "time": [
                1616684838,
                969499111
            ]
        },
        {
            "name": "connectEnd",
            "time": [
                1616684839,
                287609111
            ]
        },
        {
            "name": "requestStart",
            "time": [
                1616684839,
                287694111
            ]
        },
        {
            "name": "responseStart",
            "time": [
                1616684839,
                296599111
            ]
        },
        {
            "name": "responseEnd",
            "time": [
                1616684839,
                297274111
            ]
        }
    ]
}
```

Congratulations! OpenTelemetry is now generating traces. Let's send them somewhere, then talk about how to make them more useful.
