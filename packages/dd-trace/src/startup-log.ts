import { info, warn } from './log/writer.ts';

import os from 'node:os';
import { inspect } from 'node:util';
import packageJson from 'npm:dd-trace@4.13.1/package.json' assert { type: 'json' };
let config;
let pluginManager;
let samplingRules = [];
let alreadyRan = false;

function getIntegrationsAndAnalytics() {
  const integrations = new Set();
  const extras = {};
  for (const pluginName in pluginManager._pluginsByName) {
    integrations.add(pluginName);
  }
  extras.integrations_loaded = Array.from(integrations);
  return extras;
}

function startupLog({ agentError } = {}) {
  if (!config || !pluginManager) {
    return;
  }

  if (alreadyRan) {
    return;
  }

  alreadyRan = true;

  if (!config.startupLogs) {
    return;
  }

  const url = config.url || `http://${config.hostname || 'localhost'}:${config.port}`;

  const out = {
    [inspect.custom]() {
      return String(this);
    },
    toString() {
      return JSON.stringify(this);
    },
  };

  out.date = new Date().toISOString();
  out.os_name = os.type();
  out.os_version = os.release();
  out.architecture = os.arch();
  out.version = packageJson.version;
  out.lang = 'deno';
  out.lang_version = Deno.version.deno;
  out.env = config.env;
  out.enabled = config.enabled;
  out.service = config.service;
  out.agent_url = url;
  if (agentError) {
    out.agent_error = agentError.message;
  }
  out.debug = !!config.debug;
  out.sample_rate = config.sampler.sampleRate;
  out.sampling_rules = samplingRules;
  out.tags = config.tags;
  if (config.tags && config.tags.version) {
    out.dd_version = config.tags.version;
  }

  out.log_injection_enabled = !!config.logInjection;
  out.runtime_metrics_enabled = !!config.runtimeMetrics;
  out.profiling_enabled = !!(config.profiling || {}).enabled;
  Object.assign(out, getIntegrationsAndAnalytics());

  out.appsec_enabled = !!config.appsec.enabled;

  // // This next bunch is for features supported by other tracers, but not this
  // // one. They may be implemented in the future.

  // out.enabled_cli
  // out.sampling_rules_error
  // out.integration_XXX_analytics_enabled
  // out.integration_XXX_sample_rate
  // out.service_mapping
  // out.service_mapping_error

  info('DATADOG TRACER CONFIGURATION - ' + out);
  if (agentError) {
    warn('DATADOG TRACER DIAGNOSTIC - Agent Error: ' + agentError.message);
  }

  config = undefined;
  pluginManager = undefined;
  samplingRules = undefined;
}

function setStartupLogConfig(aConfig) {
  config = aConfig;
}

function setStartupLogPluginManager(thePluginManager) {
  pluginManager = thePluginManager;
}

function setSamplingRules(theRules: any[]) {
  samplingRules = theRules;
}

export { setSamplingRules, setStartupLogConfig, setStartupLogPluginManager, startupLog };
