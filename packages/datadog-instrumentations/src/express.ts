'use strict';

const { createWrapRouterMethod } = require('./router');
import shimmer from '../../datadog-shimmer/index.ts';
const { addHook, channel } = await import('./helpers/instrument.ts');
const { AbortController } = require('node-abort-controller');

const handleChannel = dc.channel('apm:express:request:handle');

function wrapHandle(handle: { apply: (arg0: any, arg1: IArguments) => any }) {

  return function handleWithTrace(req, res) {
    if (handleChannel.hasSubscribers) {
      handleChannel.publish({ req });
    }

    return handle.apply(this, arguments);
  };
}

const wrapRouterMethod = createWrapRouterMethod('express');

addHook({ name: 'express', versions: ['>=4'] }, (express: { application: any; Router: any }) => {
  shimmer.wrap(express.application, 'handle', wrapHandle);
  shimmer.wrap(express.Router, 'use', wrapRouterMethod);
  shimmer.wrap(express.Router, 'route', wrapRouterMethod);

  return express;
});

const queryParserReadCh = dc.channel('datadog:query:read:finish');

function publishQueryParsedAndNext(req, res, next: { apply: (arg0: any, arg1: IArguments) => void }) {
  return function () {
    if (queryParserReadCh.hasSubscribers && req) {
      const abortController = new AbortController();

      queryParserReadCh.publish({ req, res, abortController });

      if (abortController.signal.aborted) return;
    }

    next.apply(this, arguments);
  };
}

addHook({
  name: 'express',
  versions: ['>=4'],
  file: 'lib/middleware/query.js',
}, (query: { apply: (arg0: any, arg1: IArguments) => any }) => {
  return shimmer.wrap(query, function () {
    const queryMiddleware = query.apply(this, arguments);


    return shimmer.wrap(queryMiddleware, function (req, res, next: { apply: (arg0: any, arg1: IArguments) => void }) {
      arguments[2] = publishQueryParsedAndNext(req, res, next);
      return queryMiddleware.apply(this, arguments);
    });
  });
});

const processParamsStartCh = dc.channel('datadog:express:process_params:start');
const wrapProcessParamsMethod = (requestPositionInArguments: number) => {
  return (original: { apply: (arg0: any, arg1: IArguments) => any }) => {
    return function () {
      if (processParamsStartCh.hasSubscribers) {
        processParamsStartCh.publish({ req: arguments[requestPositionInArguments] });
      }

      return original.apply(this, arguments);
    };
  };
};

addHook({ name: 'express', versions: ['>=4.0.0 <4.3.0'] }, (express: { Router: any }) => {
  shimmer.wrap(express.Router, 'process_params', wrapProcessParamsMethod(1));
  return express;
});

addHook({ name: 'express', versions: ['>=4.3.0'] }, (express: { Router: any }) => {
  shimmer.wrap(express.Router, 'process_params', wrapProcessParamsMethod(2));
  return express;
});
