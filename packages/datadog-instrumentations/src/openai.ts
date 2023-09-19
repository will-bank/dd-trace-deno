'use strict';

const {

  channel,

  addHook,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

const startCh = dc.channel('apm:openai:request:start');
const finishCh = dc.channel('apm:openai:request:finish');
const errorCh = dc.channel('apm:openai:request:error');

addHook(
  { name: 'openai', file: 'dist/api.js', versions: ['>=3.0.0 <4'] },
  (exports: { OpenAIApi: { prototype: any } }) => {
    const methodNames = Object.getOwnPropertyNames(exports.OpenAIApi.prototype);
    methodNames.shift(); // remove leading 'constructor' method

    for (const methodName of methodNames) {
      shimmer.wrap(
        exports.OpenAIApi.prototype,
        methodName,
        (fn: { apply: (arg0: any, arg1: IArguments) => Promise<any> }) =>
          function () {
            if (!startCh.hasSubscribers) {
              return fn.apply(this, arguments);
            }

            startCh.publish({
              methodName,
              args: arguments,
              basePath: this.basePath,
              apiKey: this.configuration.apiKey,
            });

            return fn.apply(this, arguments)
              .then((response: { headers: any; data: any; request: { path: any; method: any } }) => {
                finishCh.publish({
                  headers: response.headers,
                  body: response.data,
                  path: response.request.path,
                  method: response.request.method,
                });

                return response;
              })
              .catch((err) => {
                errorCh.publish({ err });

                throw err;
              });
          },
      );
    }

    return exports;
  },
);
