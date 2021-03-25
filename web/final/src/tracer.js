import { ConsoleSpanExporter, BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { WebTracerProvider } from '@opentelemetry/web';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { CollectorTraceExporter } from '@opentelemetry/exporter-collector';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';

export default (serviceName) => {
  const provider = new WebTracerProvider();
  provider.register({
    contextManager: new ZoneContextManager()
  })
  const exporter = new CollectorTraceExporter({
    url: 'http://localhost:55681/v1/trace',
    serviceName: serviceName
  });

  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.addSpanProcessor(new BatchSpanProcessor(exporter));

  const tracer = provider.getTracer(serviceName);
  
  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: /localhost.+/g,
        clearTimingResources: true
      }),
      new UserInteractionInstrumentation(),
      new DocumentLoadInstrumentation()
    ],
    tracerProvider: provider
  })
  
  return tracer;
}
