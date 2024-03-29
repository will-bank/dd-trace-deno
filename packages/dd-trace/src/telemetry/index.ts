import dc from 'node:diagnostics_channel';
import packageJson from '../../../../package.json.ts';
import Config from '../config.ts';
import { sendData } from './send-data.ts';

import { manager as metricsManager } from './metrics.ts';

const telemetryStartChannel = dc.channel('datadog:telemetry:start');
const telemetryStopChannel = dc.channel('datadog:telemetry:stop');

let config;
let pluginManager;

let application;
let host;
let interval;
let heartbeatTimeout;
let heartbeatInterval;
const sentIntegrations = new Set();

function getIntegrations() {
  const newIntegrations: ({ name: string; enabled: any; auto_enabled: boolean })[] = [];

  for (const pluginName in pluginManager._pluginsByName) {
    if (sentIntegrations.has(pluginName)) {
      continue;
    }
    newIntegrations.push({
      name: pluginName,

      enabled: pluginManager._pluginsByName[pluginName]._enabled,
      auto_enabled: true,
    });
    sentIntegrations.add(pluginName);
  }
  return newIntegrations;
}

function flatten(input, result = [], prefix = [], traversedObjects = null) {
  traversedObjects = traversedObjects || new WeakSet();
  if (traversedObjects.has(input)) {
    return;
  }
  traversedObjects.add(input);

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'object' && value !== null) {
      flatten(value, result, [...prefix, key], traversedObjects);
    } else {
      result.push({ name: [...prefix, key].join('.'), value });
    }
  }
  return result;
}

function appStarted() {
  return {
    integrations: getIntegrations(),
    dependencies: [],
    configuration: flatten(config),
    additional_payload: [],
  };
}

function onBeforeUnload() {
  removeEventListener('beforeunload', onBeforeUnload);

  sendData(config, application, host, 'app-closing');
}

function createAppObject(config: { service: any; env: any; version: any }) {
  return {
    service_name: config.service,
    env: config.env,
    service_version: config.version,
    tracer_version: packageJson.version,
    language_name: 'deno',
    language_version: Deno.version.deno,
  };
}

function createHostObject() {
  const osName = Deno.build.os;

  if (osName === 'linux' || osName === 'darwin') {
    return {
      hostname: Deno.hostname(),
      os: osName,
      architecture: Deno.build.arch,
      kernel_version: Deno.osRelease(),
      kernel_release: Deno.osRelease(),
      kernel_name: osName,
    };
  }

  if (osName === 'windows') {
    return {
      hostname: Deno.hostname(),
      os: osName,
      architecture: Deno.build.arch,
      os_version: Deno.osRelease(),
    };
  }

  return {
    hostname: Deno.hostname(), // TODO is this enough?
    os: osName,
  };
}

function getTelemetryData() {
  return { config, application, host, heartbeatInterval };
}

function heartbeat(
  config: { tags?: any; hostname?: any; port?: any; url?: any } | { telemetry: { enabled: any } },
  application: {
    service_name: any;
    env: any;
    service_version: any;
    tracer_version: any;
    language_name: string;
    language_version: any;
  },
  host: {
    hostname: any;
    os: any;
    architecture: any;
    kernel_version: any;
    kernel_release: any;
    kernel_name: any;
    os_version?: undefined;
  } | {
    hostname: any;
    os: any;
    architecture: any;
    os_version: any;
    kernel_version?: undefined;
    kernel_release?: undefined;
    kernel_name?: undefined;
  } | {
    hostname: any;
    os: any;
    architecture?: undefined;
    kernel_version?: undefined;
    kernel_release?: undefined;
    kernel_name?: undefined;
    os_version?: undefined;
  },
) {
  heartbeatTimeout = setTimeout(() => {
    sendData(config, application, host, 'app-heartbeat');
    heartbeat(config, application, host);
  }, heartbeatInterval);
  Deno.unrefTimer(heartbeatTimeout);
  return heartbeatTimeout;
}

function start(aConfig: Config, thePluginManager) {
  if (!aConfig.telemetry.enabled) {
    return;
  }
  config = aConfig;
  pluginManager = thePluginManager;

  application = createAppObject(config);
  host = createHostObject();

  heartbeatInterval = config.telemetry.heartbeatInterval;

  sendData(config, application, host, 'app-started', appStarted());
  heartbeat(config, application, host);
  interval = setInterval(() => {
    metricsManager.send(config, application, host);
  }, heartbeatInterval);

  Deno.unrefTimer(interval);
  addEventListener('beforeunload', onBeforeUnload);

  telemetryStartChannel.publish(getTelemetryData());
}

function stop() {
  if (!config) {
    return;
  }

  clearInterval(interval);

  clearTimeout(heartbeatTimeout);
  removeEventListener('beforeunload', onBeforeUnload);

  telemetryStopChannel.publish(getTelemetryData());

  config = undefined;
}

function updateIntegrations() {
  if (!config || !config.telemetry.enabled) {
    return;
  }
  const integrations = getIntegrations();
  if (integrations.length === 0) {
    return;
  }

  sendData(config, application, host, 'app-integrations-change', { integrations });
}

function updateConfig(changes: any[], config: { telemetry?: any; tags?: any; hostname?: any; port?: any; url?: any }) {
  if (!config.telemetry.enabled) return;
  if (changes.length === 0) return;

  // Hack to make system tests happy until we ship telemetry v2
  if (Deno.env.get('DD_INTERNAL_TELEMETRY_V2_ENABLED') !== '1') return;

  const application = createAppObject(config);
  const host = createHostObject();

  const names = {
    sampleRate: 'DD_TRACE_SAMPLE_RATE',
    logInjection: 'DD_LOG_INJECTION',
    headerTags: 'DD_TRACE_HEADER_TAGS',
  };

  const configuration = changes.map((change: { name: string | number; value: any[]; origin: any }) => ({
    name: names[change.name],
    value: Array.isArray(change.value) ? change.value.join(',') : change.value,
    origin: change.origin,
  }));

  sendData(config, application, host, 'app-client-configuration-change', {
    configuration,
  });
}

export { start, stop, updateConfig, updateIntegrations };
