'use strict';

const {

  channel,

  addHook,

  AsyncResource,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

addHook({ name: 'tedious', versions: ['>=1.0.0'] }, (tedious: { Connection: { prototype: any } }) => {
  const startCh = dc.channel('apm:tedious:request:start');
  const finishCh = dc.channel('apm:tedious:request:finish');
  const errorCh = dc.channel('apm:tedious:request:error');
  shimmer.wrap(
    tedious.Connection.prototype,
    'makeRequest',
    (makeRequest: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (request: { callback: any }) {
        if (!startCh.hasSubscribers) {
          return makeRequest.apply(this, arguments);
        }


        const queryOrProcedure = getQueryOrProcedure(request);

        if (!queryOrProcedure) {
          return makeRequest.apply(this, arguments);
        }

        const callbackResource = new AsyncResource('bound-anonymous-fn');
        const asyncResource = new AsyncResource('bound-anonymous-fn');

        const connectionConfig = this.config;

        return asyncResource.runInAsyncScope(() => {
          startCh.publish({ queryOrProcedure, connectionConfig });

          const cb = callbackResource.bind(request.callback, request);

          request.callback = asyncResource.bind(
            function (error) {
              if (error) {
                errorCh.publish(error);
              }
              finishCh.publish(undefined);

              return cb.apply(this, arguments);
            },
            null,
            request,
          );

          try {

            return makeRequest.apply(this, arguments);
          } catch (error) {
            errorCh.publish(error);

            throw error;
          }
        });
      },
  );

  return tedious;
});

function getQueryOrProcedure(
  request: { parameters: any; parametersByName: { statement: any; stmt: any }; sqlTextOrProcedure: any },
) {
  if (!request.parameters) return;

  const statement = request.parametersByName.statement || request.parametersByName.stmt;

  if (!statement) {
    return request.sqlTextOrProcedure;
  }

  return statement.value;
}
