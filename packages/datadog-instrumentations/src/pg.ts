'use strict';

const {

  channel,

  addHook,

  AsyncResource,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

const startCh = dc.channel('apm:pg:query:start');
const finishCh = dc.channel('apm:pg:query:finish');
const errorCh = dc.channel('apm:pg:query:error');

const startPoolQueryCh = dc.channel('datadog:pg:pool:query:start');
const finishPoolQueryCh = dc.channel('datadog:pg:pool:query:finish');

addHook({ name: 'pg', versions: ['>=8.0.3'] }, (pg: { Client: { prototype: any }; Pool: { prototype: any } }) => {
  shimmer.wrap(
    pg.Client.prototype,
    'query',
    (query: { apply: (arg0: any, arg1: IArguments) => any }) => wrapQuery(query),
  );
  shimmer.wrap(
    pg.Pool.prototype,
    'query',
    (query: { apply: (arg0: any, arg1: IArguments) => any }) => wrapPoolQuery(query),
  );
  return pg;
});

addHook({ name: 'pg', file: 'lib/native/index.js', versions: ['>=8.0.3'] }, (Client: { prototype: any }) => {
  shimmer.wrap(Client.prototype, 'query', (query: { apply: (arg0: any, arg1: IArguments) => any }) => wrapQuery(query));
  return Client;
});

function wrapQuery(query: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function () {
    if (!startCh.hasSubscribers) {
      return query.apply(this, arguments);
    }

    const callbackResource = new AsyncResource('bound-anonymous-fn');
    const asyncResource = new AsyncResource('bound-anonymous-fn');
    const processId = this.processID;

    const pgQuery = arguments[0] && typeof arguments[0] === 'object' ? arguments[0] : { text: arguments[0] };

    // The query objects passed in can be pretty complex. They can be instances of EventEmitter.
    //   For this reason we can't make a shallow clone of the object.
    // Some libraries, such as sql-template-tags, can provide a getter .text property.
    //   For this reason we can't replace the .text property.
    // Instead, we create a new object, and set the original query as the prototype.
    // This allows any existing methods to still work and lets us easily provide a new query.
    let newQuery = {
      __ddInjectableQuery: '',

      get text() {
        return this.__ddInjectableQuery || Object.getPrototypeOf(this).text;
      },
    };

    Object.setPrototypeOf(newQuery, pgQuery);

    return asyncResource.runInAsyncScope(() => {
      startCh.publish({
        params: this.connectionParameters,
        query: newQuery,
        processId,
      });


      arguments[0] = newQuery;


      const finish = asyncResource.bind(function (error) {
        if (error) {
          errorCh.publish(error);
        }
        finishCh.publish();
      });


      const retval = query.apply(this, arguments);
      const queryQueue = this.queryQueue || this._queryQueue;
      const activeQuery = this.activeQuery || this._activeQuery;

      newQuery = queryQueue[queryQueue.length - 1] || activeQuery;

      if (!newQuery) {
        return retval;
      }


      if (newQuery.callback) {

        const originalCallback = callbackResource.bind(newQuery.callback);

        newQuery.callback = function (err, res) {
          finish(err);
          return originalCallback.apply(this, arguments);
        };

      } else if (newQuery.once) {
        newQuery

          .once('error', finish)
          .once('end', () => finish());
      } else {

        newQuery.then(() => finish(), finish);
      }

      try {
        return retval;
      } catch (err) {
        errorCh.publish(err);
      }
    });
  };
}

function wrapPoolQuery(query: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function () {
    if (!startPoolQueryCh.hasSubscribers) {
      return query.apply(this, arguments);
    }

    const asyncResource = new AsyncResource('bound-anonymous-fn');

    const pgQuery = arguments[0] && typeof arguments[0] === 'object' ? arguments[0] : { text: arguments[0] };

    return asyncResource.runInAsyncScope(() => {
      startPoolQueryCh.publish({
        query: pgQuery,
      });

      const finish = asyncResource.bind(function () {
        finishPoolQueryCh.publish();
      });


      const cb = arguments[arguments.length - 1];
      if (typeof cb === 'function') {

        arguments[arguments.length - 1] = shimmer.wrap(cb, function () {
          finish();
          return cb.apply(this, arguments);
        });
      }


      const retval = query.apply(this, arguments);

      if (retval && retval.then) {
        retval.then(() => {
          finish();
        }).catch(() => {
          finish();
        });
      }

      return retval;
    });
  };
}
