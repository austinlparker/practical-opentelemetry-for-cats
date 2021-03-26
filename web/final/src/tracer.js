import { ConsoleSpanExporter, BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { WebTracerProvider } from '@opentelemetry/web';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { CollectorTraceExporter } from '@opentelemetry/exporter-collector';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { AlwaysOnSampler } from '@opentelemetry/core';

export default (serviceName) => {
  const provider = new WebTracerProvider({
    sampler: new AlwaysOnSampler()
  });
  provider.register({
    contextManager: new ZoneContextManager(),
  })
  const exporter = new CollectorTraceExporter({
    url: 'http://localhost:55681/v1/trace',
    serviceName: serviceName
  });
  
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.addSpanProcessor(new BatchSpanProcessor(exporter));
  
  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: /localhost.+/g
      }),
      new DocumentLoadInstrumentation()
    ],
    tracerProvider: provider
  })
}
