import * as vulnerabilityReporter from './vulnerability-reporter.ts';
import { disableAllAnalyzers, enableAllAnalyzers } from './analyzers/index.ts';
import web from '../../plugins/util/web.ts';
import { storage } from '../../../../datadog-core/index.ts';
import * as overheadController from './overhead-controller.ts';
import dc from 'node:diagnostics_channel';
import * as iastContextFunctions from './iast-context.ts';
import { IAST_ENABLED_TAG_KEY } from './tags.ts';
import iastTelemetry from './telemetry/index.ts';

// TODO Change to `apm:http:server:request:[start|close]` when the subscription
//  order of the callbacks can be enforce
const requestStart = dc.channel('dd-trace:incomingHttpRequestStart');
const requestClose = dc.channel('dd-trace:incomingHttpRequestEnd');
const iastResponseEnd = dc.channel('datadog:iast:response-end');

function enable(config: { iast: { telemetryVerbosity: any } }, _tracer) {
  iastTelemetry.configure(config, config.iast && config.iast.telemetryVerbosity);
  enableAllAnalyzers(config);
  requestStart.subscribe(onIncomingHttpRequestStart);
  requestClose.subscribe(onIncomingHttpRequestEnd);
  overheadController.configure(config.iast);
  overheadController.startGlobalContext();
  vulnerabilityReporter.start(config, _tracer);
}

function disable() {
  iastTelemetry.stop();
  disableAllAnalyzers();
  overheadController.finishGlobalContext();
  if (requestStart.hasSubscribers) requestStart.unsubscribe(onIncomingHttpRequestStart);
  if (requestClose.hasSubscribers) requestClose.unsubscribe(onIncomingHttpRequestEnd);
  vulnerabilityReporter.stop();
}

function onIncomingHttpRequestStart(data: { req: any }) {
  if (data && data.req) {
    const store = storage.getStore();
    if (store) {
      const topContext = web.getContext(data.req);
      if (topContext) {
        const rootSpan = topContext.span;
        const isRequestAcquired = overheadController.acquireRequest(rootSpan);
        if (isRequestAcquired) {
          const iastContext = iastContextFunctions.saveIastContext(store, topContext, { rootSpan, req: data.req });
          overheadController.initializeRequestContext(iastContext);
          iastTelemetry.onRequestStart(iastContext);
        }
        if (rootSpan.addTags) {
          rootSpan.addTags({
            [IAST_ENABLED_TAG_KEY]: isRequestAcquired ? 1 : 0,
          });
        }
      }
    }
  }
}

function onIncomingHttpRequestEnd(data: { req: any }) {
  if (data && data.req) {
    const store = storage.getStore();
    const topContext = web.getContext(data.req);
    const iastContext = iastContextFunctions.getIastContext(store, topContext);
    if (iastContext && iastContext.rootSpan) {
      iastResponseEnd.publish(data);

      const vulnerabilities = iastContext.vulnerabilities;
      const rootSpan = iastContext.rootSpan;
      vulnerabilityReporter.sendVulnerabilities(vulnerabilities, rootSpan);
      iastTelemetry.onRequestEnd(iastContext, iastContext.rootSpan);
    }
    // TODO web.getContext(data.req) is required when the request is aborted
    if (iastContextFunctions.cleanIastContext(store, topContext, iastContext)) {
      overheadController.releaseRequest();
    }
  }
}

export { disable, enable, onIncomingHttpRequestEnd, onIncomingHttpRequestStart };
