import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { WebTracerProvider } from '@opentelemetry/web';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { CollectorTraceExporter } from '@opentelemetry/exporter-collector';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { B3Propagator } from '@opentelemetry/propagator-b3';
import { DiagConsoleLogger, DiagLogLevel, diag, propagation } from '@opentelemetry/api';

export default (serviceName) => {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  const provider = new WebTracerProvider();
  provider.register({
    contextManager: new ZoneContextManager(),
    propagator: new B3Propagator()
  })
  const exporter = new CollectorTraceExporter({
    url: 'http://localhost:55681/v1/trace',
  });

  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

  const tracer = provider.getTracer(serviceName);
  
  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: ['http://localhost:8080', 'http://localhost:8080/getActivity'],
        clearTimingResources: true
      }),
    ],
    tracerProvider: provider
  })
  
  console.log(propagation.fields())
  return tracer;
}
