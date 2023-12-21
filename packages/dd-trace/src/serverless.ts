import { existsSync } from 'https://deno.land/std@0.204.0/fs/exists.ts';

import log from './log/index.ts';

function maybeStartServerlessMiniAgent(config: { isGCPFunction: any }) {
  if (Deno.build.os !== 'windows' && Deno.build.os !== 'linux') {
    log.error(`Serverless Mini Agent is only supported on Windows and Linux.`);
    return;
  }

  const rustBinaryPath = getRustBinaryPath(config);

  log.debug(`Trying to spawn the Serverless Mini Agent at path: ${rustBinaryPath}`);

  // trying to spawn with an invalid path will return a non-descriptive error, so we want to catch
  // invalid paths and log our own error.
  if (!existsSync(rustBinaryPath)) {
    log.error('Serverless Mini Agent did not start. Could not find mini agent binary.');
    return;
  }
  try {
    import('node:child_process').then((child_process) => child_process.spawn(rustBinaryPath, { stdio: 'inherit' }));
  } catch (err) {
    log.error(`Error spawning mini agent process: ${err}`);
  }
}

function getRustBinaryPath(config: { isGCPFunction: any }) {
  if (Deno.env.get('DD_MINI_AGENT_PATH') !== undefined) {
    return Deno.env.get('DD_MINI_AGENT_PATH');
  }

  const rustBinaryPathRoot = config.isGCPFunction ? '/workspace' : '/home/site/wwwroot';
  const rustBinaryPathOsFolder = Deno.build.os === 'windows'
    ? 'datadog-serverless-agent-windows-amd64'
    : 'datadog-serverless-agent-linux-amd64';

  const rustBinaryExtension = Deno.build.os === 'windows' ? '.exe' : '';

  const rustBinaryPath = `${rustBinaryPathRoot}/node_modules/@datadog/sma/${rustBinaryPathOsFolder}/\
datadog-serverless-trace-mini-agent${rustBinaryExtension}`;

  return rustBinaryPath;
}

function getIsGCPFunction() {
  const isDeprecatedGCPFunction = Deno.env.get('FUNCTION_NAME') !== undefined &&
    Deno.env.get('GCP_PROJECT') !== undefined;
  const isNewerGCPFunction = Deno.env.get('K_SERVICE') !== undefined && Deno.env.get('FUNCTION_TARGET') !== undefined;

  return isDeprecatedGCPFunction || isNewerGCPFunction;
}

function getIsAzureFunctionConsumptionPlan() {
  const isAzureFunction = Deno.env.get('FUNCTIONS_EXTENSION_VERSION') !== undefined &&
    Deno.env.get('FUNCTIONS_WORKER_RUNTIME') !== undefined;
  const azureWebsiteSKU = Deno.env.get('WEBSITE_SKU');
  const isConsumptionPlan = azureWebsiteSKU === undefined || azureWebsiteSKU === 'Dynamic';

  return isAzureFunction && isConsumptionPlan;
}

export { getIsAzureFunctionConsumptionPlan, getIsGCPFunction, getRustBinaryPath, maybeStartServerlessMiniAgent };
