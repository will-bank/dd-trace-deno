'use strict';

const { AbortController } = require('node-abort-controller'); // AbortController is not available in node <15
import shimmer from '../../datadog-shimmer/index.ts';
const { channel, addHook } = await import('./helpers/instrument.ts');

const bodyParserReadCh = dc.channel('datadog:body-parser:read:finish');

function publishRequestBodyAndNext(req, res, next: { apply: (arg0: any, arg1: IArguments) => void }) {
  return function () {
    if (bodyParserReadCh.hasSubscribers && req) {
      const abortController = new AbortController();

      bodyParserReadCh.publish({ req, res, abortController });

      if (abortController.signal.aborted) return;
    }

    next.apply(this, arguments);
  };
}

addHook({
  name: 'body-parser',
  file: 'lib/read.js',
  versions: ['>=1.4.0'],
}, (read: { apply: (arg0: any, arg1: IArguments) => void }) => {

  return shimmer.wrap(read, function (req, res, next: { apply: (arg0: any, arg1: IArguments) => void }) {
    arguments[2] = publishRequestBodyAndNext(req, res, next);
    read.apply(this, arguments);
  });
});
