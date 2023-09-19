import { disableRewriter, enableRewriter } from './rewriter.ts';
import {
  createTransaction,
  disableTaintOperations,
  enableTaintOperations,
  removeTransaction,
  setMaxTransactions,
} from './operations';

import taintTrackingPlugin from './plugin.ts';

export function enableTaintTracking(config: { maxConcurrentRequests: any }, telemetryVerbosity) {
  enableRewriter(telemetryVerbosity);
  enableTaintOperations(telemetryVerbosity);
  taintTrackingPlugin.enable();
  setMaxTransactions(config.maxConcurrentRequests);
}

export function disableTaintTracking() {
  disableRewriter();
  disableTaintOperations();
  taintTrackingPlugin.disable();
}

export { createTransaction, removeTransaction, setMaxTransactions, taintTrackingPlugin };
