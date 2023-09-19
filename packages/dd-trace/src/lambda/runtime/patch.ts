import path from 'node:path';

import { _extractModuleNameAndHandlerPath, _extractModuleRootAndHandler, _getLambdaFilePath } from './ritm.ts';
import { datadog } from '../handler.ts';
import { addHook } from '../../../../datadog-instrumentations/src/helpers/instrument.ts';
import shimmer from '../../../../datadog-shimmer.ts';

/**
 * Patches a Datadog Lambda module by calling `patchDatadogLambdaHandler`
 * with the handler name `datadog`.
 *
 * @param {*} datadogLambdaModule node module to be patched.
 * @returns a Datadog Lambda module with the `datadog` function from
 * `datadog-lambda-js` patched.
 */
const patchDatadogLambdaModule = (datadogLambdaModule) => {
  shimmer.wrap(datadogLambdaModule, 'datadog', patchDatadogLambdaHandler);

  return datadogLambdaModule;
};

/**
 * Patches a Datadog Lambda handler in order to do
 * Datadog instrumentation by getting the Lambda handler from its
 * arguments.
 *
 * @param {*} datadogHandler the Datadog Lambda handler to destructure.
 * @returns the datadogHandler with its arguments patched.
 */
function patchDatadogLambdaHandler(datadogHandler: (arg0: any) => any) {

  return (userHandler) => {
    return datadogHandler(datadog(userHandler));
  };
}

/**
 * Patches a Lambda module on the given handler path.
 *
 * @param {string} handlerPath path of the handler to be patched.
 * @returns a module with the given handler path patched.
 */
const patchLambdaModule = (handlerPath: string) => (lambdaModule) => {
  shimmer.wrap(lambdaModule, handlerPath, patchLambdaHandler);

  return lambdaModule;
};

/**
 * Patches a Lambda handler in order to do Datadog instrumentation.
 *
 * @param {*} lambdaHandler the Lambda handler to be patched.
 * @returns a function which patches the given Lambda handler.
 */
function patchLambdaHandler(lambdaHandler) {
  return datadog(lambdaHandler);
}

const lambdaTaskRoot = Deno.env.get('LAMBDA_TASK_ROOT');
const originalLambdaHandler = Deno.env.get('DD_LAMBDA_HANDLER');

if (originalLambdaHandler !== undefined) {
  const [moduleRoot, moduleAndHandler] = _extractModuleRootAndHandler(originalLambdaHandler);
  const [_module, handlerPath] = _extractModuleNameAndHandlerPath(moduleAndHandler);

  const lambdaStylePath = path.resolve(lambdaTaskRoot, moduleRoot, _module);
  const lambdaFilePath = _getLambdaFilePath(lambdaStylePath);

  addHook({ name: lambdaFilePath }, patchLambdaModule(handlerPath));
} else {
  // Instrumentation is done manually.
  addHook({ name: 'datadog-lambda-js' }, patchDatadogLambdaModule);
}
