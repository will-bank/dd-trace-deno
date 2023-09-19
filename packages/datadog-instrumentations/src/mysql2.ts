'use strict';

const {

  channel,

  addHook,

  AsyncResource,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

addHook({ name: 'mysql2', file: 'lib/connection.js', versions: ['>=1'] }, (Connection: { prototype: any }) => {
  const startCh = dc.channel('apm:mysql2:query:start');
  const finishCh = dc.channel('apm:mysql2:query:finish');
  const errorCh = dc.channel('apm:mysql2:query:error');

  shimmer.wrap(
    Connection.prototype,
    'addCommand',
    (addCommand: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (cmd: { constructor: { name: any }; execute: any }) {
        if (!startCh.hasSubscribers) return addCommand.apply(this, arguments);

        const asyncResource = new AsyncResource('bound-anonymous-fn');
        const name = cmd && cmd.constructor && cmd.constructor.name;
        const isCommand = typeof cmd.execute === 'function';
        const isQuery = isCommand && (name === 'Execute' || name === 'Query');

        // TODO: consider supporting all commands and not just queries
        cmd.execute = isQuery

          ? wrapExecute(cmd, cmd.execute, asyncResource, this.config)
          : bindExecute(cmd, cmd.execute, asyncResource);

        return asyncResource.bind(addCommand, this).apply(this, arguments);
      },
  );

  return Connection;

  function bindExecute(
    cmd: { constructor: { name: any }; execute: any },
    execute: { apply: (arg0: any, arg1: IArguments) => any },
    asyncResource: { bind: (arg0: (packet: any, connection: any) => any, arg1: undefined) => any },
  ) {
    return asyncResource.bind(function executeWithTrace(packet, connection) {
      if (this.onResult) {

        this.onResult = asyncResource.bind(this.onResult);
      }

      return execute.apply(this, arguments);

    }, cmd);
  }


  function wrapExecute(
    cmd: { statement: { query: any }; sql: any },
    execute: { apply: (arg0: any, arg1: IArguments) => any },
    asyncResource: {
      bind: (
        arg0: { (packet: any, connection: any): any; (error: any): void; (error: any): any; (): any },
        arg1: string,
        arg2: undefined,
      ) => any;
    },
    config,
  ) {
    const callbackResource = new AsyncResource('bound-anonymous-fn');


    return asyncResource.bind(function executeWithTrace(packet, connection) {
      const sql = cmd.statement ? cmd.statement.query : cmd.sql;
      const payload = { sql, conf: config };
      startCh.publish(payload);

      if (cmd.statement) {
        cmd.statement.query = payload.sql;
      } else {
        cmd.sql = payload.sql;
      }

      if (this.onResult) {
        const onResult = callbackResource.bind(this.onResult);


        this.onResult = asyncResource.bind(
          function (error) {
            if (error) {
              errorCh.publish(error);
            }
            finishCh.publish(undefined);
            onResult.apply(this, arguments);
          },
          'bound-anonymous-fn',
          this,
        );
      } else {

        this.on('error', asyncResource.bind((error) => errorCh.publish(error)));

        this.on('end', asyncResource.bind(() => finishCh.publish(undefined)));
      }

      this.execute = execute;

      try {
        return execute.apply(this, arguments);
      } catch (err) {
        errorCh.publish(err);
      }
    }, cmd);
  }
});
