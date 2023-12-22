const TaintedUtils = await import('@datadog/native-iast-taint-tracking');
import { IAST_TRANSACTION_ID } from '../iast-context.ts';
import iastLog from './iast-log.ts';
import iastTelemetry from './telemetry.ts';
import { REQUEST_TAINTED } from '../telemetry/iast-metric.ts';
import { isInfoAllowed } from '../telemetry/verbosity.ts';
import { getTaintTrackingImpl, getTaintTrackingNoop } from './taint-tracking-impl.ts';

function createTransaction(id, iastContext: { [x: string]: any }) {
  if (id && iastContext) {
    iastContext[IAST_TRANSACTION_ID] = TaintedUtils.createTransaction(id);
  }
}

let onRemoveTransaction = (transactionId, iastContext: { [x: string]: any }) => {};

function onRemoveTransactionInformationTelemetry(transactionId, iastContext: undefined) {
  const metrics = TaintedUtils.getMetrics(transactionId, iastTelemetry.verbosity);
  if (metrics && metrics.requestCount) {
    REQUEST_TAINTED.add(metrics.requestCount, null, iastContext);
  }
}

function removeTransaction(iastContext: { [x: string]: any }) {
  if (iastContext && iastContext[IAST_TRANSACTION_ID]) {
    const transactionId = iastContext[IAST_TRANSACTION_ID];

    onRemoveTransaction(transactionId, iastContext);

    TaintedUtils.removeTransaction(transactionId);
    delete iastContext[IAST_TRANSACTION_ID];
  }
}

function newTaintedString(iastContext: { [x: string]: any }, string, name, type) {
  let result = string;
  if (iastContext && iastContext[IAST_TRANSACTION_ID]) {
    const transactionId = iastContext[IAST_TRANSACTION_ID];
    result = TaintedUtils.newTaintedString(transactionId, string, name, type);
  } else {
    result = string;
  }
  return result;
}

function taintObject(iastContext: { [x: string]: any }, object, type, keyTainting, keyType) {
  let result = object;
  if (iastContext && iastContext[IAST_TRANSACTION_ID]) {
    const transactionId = iastContext[IAST_TRANSACTION_ID];
    const queue: ({ parent: any; property: string; value: any; key: string })[] | {
      parent: null;
      property: null;
      value: any;
    }[] = [{ parent: null, property: null, value: object }];

    const visited = new WeakSet();
    while (queue.length > 0) {
      const { parent, property, value, key } = queue.pop();
      if (value === null) {
        continue;
      }
      try {
        if (typeof value === 'string') {
          const tainted = TaintedUtils.newTaintedString(transactionId, value, property, type);
          if (!parent) {
            result = tainted;
          } else {
            if (keyTainting && key) {
              const taintedProperty = TaintedUtils.newTaintedString(transactionId, key, property, keyType);

              parent[taintedProperty] = tainted;
            } else {
              parent[key] = tainted;
            }
          }
        } else if (typeof value === 'object' && !visited.has(value)) {
          visited.add(value);
          const keys = Object.keys(value);
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];

            queue.push({ parent: value, property: property ? `${property}.${key}` : key, value: value[key], key });
          }
          if (parent && keyTainting && key) {
            const taintedProperty = TaintedUtils.newTaintedString(transactionId, key, property, keyType);

            parent[taintedProperty] = value;
          }
        }
      } catch (e) {
        iastLog.error(`Error visiting property : ${property}`).errorAndPublish(e);
      }
    }
  }
  return result;
}

function isTainted(iastContext: { [x: string]: any }, string) {
  let result = false;
  if (iastContext && iastContext[IAST_TRANSACTION_ID]) {
    const transactionId = iastContext[IAST_TRANSACTION_ID];
    result = TaintedUtils.isTainted(transactionId, string);
  } else {
    result = false;
  }
  return result;
}

function getRanges(
  iastContext: {
    [x: string]: any;
    rootSpan?: { context: () => { (): any; new (): any; toSpanId: { (): any; new (): any } } };
  },
  string,
) {
  let result = [];
  if (iastContext && iastContext[IAST_TRANSACTION_ID]) {
    const transactionId = iastContext[IAST_TRANSACTION_ID];
    result = TaintedUtils.getRanges(transactionId, string);
  } else {
    result = [];
  }
  return result;
}

function enableTaintOperations(telemetryVerbosity: number) {
  if (isInfoAllowed(telemetryVerbosity)) {
    onRemoveTransaction = onRemoveTransactionInformationTelemetry;
  }

  global._ddiast = getTaintTrackingImpl(telemetryVerbosity);
}

function disableTaintOperations() {
  global._ddiast = getTaintTrackingNoop();
}

function setMaxTransactions(transactions) {
  if (!transactions) {
    return;
  }

  TaintedUtils.setMaxTransactions(transactions);
}

export {
  createTransaction,
  disableTaintOperations,
  enableTaintOperations,
  getRanges,
  IAST_TRANSACTION_ID,
  isTainted,
  newTaintedString,
  removeTransaction,
  setMaxTransactions,
  taintObject,
};
