'use strict';

import * as shimmer from '../../datadog-shimmer/index.ts';
import dc from 'npm:dd-trace@4.13.1/packages/diagnostics_channel/index.js';

const startChannel = dc.channel('apm:fetch:request:start');
const finishChannel = dc.channel('apm:fetch:request:finish');
const errorChannel = dc.channel('apm:fetch:request:error');

function wrapFetch(
  fetch: { (input: URL | RequestInfo, init?: RequestInit): Promise<Response>; apply?: any },
  Request: {
    new (input: URL | RequestInfo, init?: RequestInit): Request;
    new (arg0: any, arg1: any): any;
    prototype?: Request;
  },
) {
  if (typeof fetch !== 'function') return fetch;

  return function (input, init) {
    if (!startChannel.hasSubscribers) return fetch.apply(this, arguments);

    const req = new Request(input, init);
    const headers = req.headers;
    const message = { req, headers };

    return startChannel.runStores(message, () => {
      // Request object is read-only so we need new objects to change headers.

      arguments[0] = message.req;

      arguments[1] = { headers: message.headers };


      return fetch.apply(this, arguments)
        .then(
          (res) => {
            message.res = res;
            finishChannel.publish(message);
            return res;
          },
          (err: { name: string }) => {
            if (err.name !== 'AbortError') {
              message.error = err;
              errorChannel.publish(message);
            }

            finishChannel.publish(message);

            throw err;
          },
        );
    });
  };
}

if (globalThis.fetch) {
  globalThis.fetch = shimmer.wrap(fetch, wrapFetch(fetch, globalThis.Request));
}

export {};
