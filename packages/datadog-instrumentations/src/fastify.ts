'use strict';

import shimmer from '../../datadog-shimmer/index.ts';
const { addHook, channel, AsyncResource } = await import('./helpers/instrument.ts');

const errorChannel = dc.channel('apm:fastify:middleware:error');
const handleChannel = dc.channel('apm:fastify:request:handle');

const parsingResources = new WeakMap();

function wrapFastify(fastify: { apply: (arg0: any, arg1: IArguments) => any }, hasParsingEvents: boolean) {
  if (typeof fastify !== 'function') return fastify;

  return function fastifyWithTrace() {
    const app = fastify.apply(this, arguments);

    if (!app || typeof app.addHook !== 'function') return app;

    app.addHook('onRequest', onRequest);
    app.addHook('preHandler', preHandler);

    if (hasParsingEvents) {
      app.addHook('preParsing', preParsing);
      app.addHook('preValidation', preValidation);
    } else {
      app.addHook('onRequest', preParsing);
      app.addHook('preHandler', preValidation);
    }

    app.addHook = wrapAddHook(app.addHook);

    return app;
  };
}

function wrapAddHook(addHook: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function addHookWithTrace(name: string, fn: { apply: (arg0: any, arg1: IArguments) => any }) {
    fn = arguments[arguments.length - 1];

    if (typeof fn !== 'function') return addHook.apply(this, arguments);


    arguments[arguments.length - 1] = shimmer.wrap(
      fn,
      function (request: { raw: any; req: any }, reply, done: { apply: (arg0: any, arg1: IArguments) => any }) {
        const req = getReq(request);

        try {
          if (typeof done === 'function') {
            done = arguments[arguments.length - 1];


            arguments[arguments.length - 1] = function (err) {
              publishError(err, req);

              if (name === 'onRequest' || name === 'preParsing') {
                const parsingResource = new AsyncResource('bound-anonymous-fn');

                parsingResources.set(req, parsingResource);

                return parsingResource.runInAsyncScope(() => {

                  return done.apply(this, arguments);
                });
              } else {
                return done.apply(this, arguments);
              }
            };

            return fn.apply(this, arguments);
          } else {
            const promise = fn.apply(this, arguments);

            if (promise && typeof promise.catch === 'function') {

              return promise.catch((err) => publishError(err, req));
            }

            return promise;
          }
        } catch (e) {
          throw publishError(e, req);
        }
      },
    );

    return addHook.apply(this, arguments);
  };
}

function onRequest(request: { raw: any; req: any }, reply: { raw: any; res: any }, done: () => any) {
  if (typeof done !== 'function') return;

  const req = getReq(request);
  const res = getRes(reply);

  handleChannel.publish({ req, res });

  return done();
}

function preHandler(request: { raw: any; req: any }, reply: { send: (error: any) => any }, done: () => void) {
  if (typeof done !== 'function') return;
  if (!reply || typeof reply.send !== 'function') return done();

  const req = getReq(request);

  reply.send = wrapSend(reply.send, req);

  done();
}

function preValidation(request: { raw: any; req: any }, reply, done: () => any) {
  const req = getReq(request);
  const parsingResource = parsingResources.get(req);

  if (!parsingResource) return done();

  parsingResource.runInAsyncScope(() => done());
}

function preParsing(request: { raw: any; req: any }, reply, payload: () => any, done: () => any) {
  if (typeof done !== 'function') {
    done = payload;
  }

  const req = getReq(request);
  const parsingResource = new AsyncResource('bound-anonymous-fn');

  parsingResources.set(req, parsingResource);
  parsingResource.runInAsyncScope(() => done());
}

function wrapSend(send: { apply: (arg0: any, arg1: IArguments) => any }, req) {

  return function sendWithTrace(error) {
    if (error instanceof Error) {
      errorChannel.publish({ req, error });
    }

    return send.apply(this, arguments);
  };
}

function getReq(request: { raw: any; req: any }) {
  return request && (request.raw || request.req || request);
}

function getRes(reply: { raw: any; res: any }) {
  return reply && (reply.raw || reply.res || reply);
}

function publishError(error, req) {
  if (error) {
    errorChannel.publish({ error, req });
  }

  return error;
}

addHook({ name: 'fastify', versions: ['>=3'] }, (fastify: { apply: (arg0: any, arg1: IArguments) => any }) => {
  const wrapped = shimmer.wrap(fastify, wrapFastify(fastify, true));

  wrapped.fastify = wrapped;
  wrapped.default = wrapped;

  return wrapped;
});

addHook({ name: 'fastify', versions: ['2'] }, (fastify: { apply: (arg0: any, arg1: IArguments) => any }) => {
  return shimmer.wrap(fastify, wrapFastify(fastify, true));
});

addHook({ name: 'fastify', versions: ['1'] }, (fastify: { apply: (arg0: any, arg1: IArguments) => any }) => {
  return shimmer.wrap(fastify, wrapFastify(fastify, false));
});
