const OVERHEAD_CONTROLLER_CONTEXT_KEY = 'oce';
const REPORT_VULNERABILITY = 'REPORT_VULNERABILITY';
const INTERVAL_RESET_GLOBAL_CONTEXT = 60 * 1000;

const GLOBAL_OCE_CONTEXT = {};

let resetGlobalContextInterval;
let config = {};
let availableRequest = 0;
const OPERATIONS = {
  REPORT_VULNERABILITY: {
    hasQuota: (context: { tokens: { [x: string]: number } }) => {
      const reserved = context && context.tokens && context.tokens[REPORT_VULNERABILITY] > 0;
      if (reserved) {
        context.tokens[REPORT_VULNERABILITY]--;
      }
      return reserved;
    },
    name: REPORT_VULNERABILITY,
    initialTokenBucketSize() {
      return typeof config.maxContextOperations === 'number' ? config.maxContextOperations : 2;
    },
    initContext: function (context: { tokens: { [x: string]: any } }) {
      context.tokens[REPORT_VULNERABILITY] = this.initialTokenBucketSize();
    },
  },
};

function _getNewContext() {
  const oceContext = {
    tokens: {},
  };

  for (const operation in OPERATIONS) {
    OPERATIONS[operation].initContext(oceContext);
  }

  return oceContext;
}

function _getContext(iastContext: { [x: string]: any }) {
  if (iastContext && iastContext[OVERHEAD_CONTROLLER_CONTEXT_KEY]) {
    return iastContext[OVERHEAD_CONTROLLER_CONTEXT_KEY];
  }
  return GLOBAL_OCE_CONTEXT;
}

function _resetGlobalContext() {
  Object.assign(GLOBAL_OCE_CONTEXT, _getNewContext());
}

function acquireRequest(
  rootSpan: {
    context: () => {
      (): any;
      new (): any;
      toSpanId: { (): { (): any; new (): any; slice: { (arg0: number): number; new (): any } }; new (): any };
    };
  },
) {
  if (availableRequest > 0) {
    const sampling = config && typeof config.requestSampling === 'number' ? config.requestSampling : 30;
    if (rootSpan.context().toSpanId().slice(-2) <= sampling) {
      availableRequest--;
      return true;
    }
  }
  return false;
}

function releaseRequest() {
  if (availableRequest < config.maxConcurrentRequests) {
    availableRequest++;
  }
}

function hasQuota(operation: { hasQuota: (arg0: any) => any }, iastContext) {
  const oceContext = _getContext(iastContext);
  return operation.hasQuota(oceContext);
}

function initializeRequestContext(iastContext: { [x: string]: { tokens: {} } }) {
  if (iastContext) iastContext[OVERHEAD_CONTROLLER_CONTEXT_KEY] = _getNewContext();
}

function configure(cfg) {
  config = cfg;
  availableRequest = config.maxConcurrentRequests;
}

function startGlobalContext() {
  if (resetGlobalContextInterval) return;
  _resetGlobalContext();
  resetGlobalContextInterval = setInterval(() => {
    _resetGlobalContext();
  }, INTERVAL_RESET_GLOBAL_CONTEXT);

  Deno.unrefTimer(resetGlobalContextInterval);
}

function finishGlobalContext() {
  if (resetGlobalContextInterval) {
    clearInterval(resetGlobalContextInterval);
    resetGlobalContextInterval = null;
  }
}

export {
  _resetGlobalContext,
  acquireRequest,
  configure,
  finishGlobalContext,
  hasQuota,
  initializeRequestContext,
  OPERATIONS,
  OVERHEAD_CONTROLLER_CONTEXT_KEY,
  releaseRequest,
  startGlobalContext,
};
