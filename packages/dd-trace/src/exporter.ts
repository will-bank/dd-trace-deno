import * as exporters from 'npm:dd-trace/ext/exporters.js';
import fs from 'node:fs';
import * as constants from './constants.ts';

import LogExporter from './exporters/log/index.ts';
import AgentExporter from './exporters/agent/index.ts';
import AgentlessExporter from './ci-visibility/exporters/agentless/index.ts';
import AgentProxyExporter from './ci-visibility/exporters/agent-proxy/index.ts';

type Exporter =
  | typeof LogExporter
  | typeof AgentExporter
  | typeof AgentlessExporter
  | typeof AgentProxyExporter

export default (name): Exporter => {
  const inAWSLambda = Deno.env.get('AWS_LAMBDA_FUNCTION_NAME') !== undefined;
  const usingLambdaExtension = inAWSLambda && fs.existsSync(constants.DATADOG_LAMBDA_EXTENSION_PATH);

  switch (name) {
    case exporters.LOG:
      return LogExporter;
    case exporters.AGENT:
      return AgentExporter;
    case exporters.DATADOG:
      return AgentlessExporter;
    case exporters.AGENT_PROXY:
      return AgentProxyExporter;
    default:
      return inAWSLambda && !usingLambdaExtension
        ? LogExporter
        : AgentExporter;
  }
};
