import dc from 'node:diagnostics_channel';
import { isFalse } from './util.ts';
import plugins from './plugins/index.ts';
import log from './log/index.ts';
import Nomenclature from './service-naming/index.ts';

const loadChannel = dc.channel('dd-trace:instrumentation:load');

// instrument everything that needs Plugin System V2 instrumentation
// import 'https://esm.sh/dd-trace@4.13.1&pin=v135&no-dts/packages/datadog-instrumentations/index.js';

const DD_TRACE_DISABLED_PLUGINS = Deno.env.get('DD_TRACE_DISABLED_PLUGINS');

const disabledPlugins = new Set(
  DD_TRACE_DISABLED_PLUGINS && DD_TRACE_DISABLED_PLUGINS.split(',').map((plugin: string) => plugin.trim()),
);

// TODO actually ... should we be looking at environment variables this deep down in the code?

const pluginClasses = {};

loadChannel.subscribe(({ name }) => {
  maybeEnable(plugins[name]);
});

// Globals
// maybeEnable((await import('https://esm.sh/dd-trace@4.13.1&pin=v135&no-dts/packages/datadog-plugin-fetch/src/index.js')).default);
maybeEnable((await import('./plugins/log_plugin.ts')).default);

function maybeEnable(Plugin: { id: string }) {
  if (!Plugin || typeof Plugin !== 'function') return;
  if (!pluginClasses[Plugin.id]) {
    const envName = `DD_TRACE_${Plugin.id.toUpperCase()}_ENABLED`;
    const enabled = Deno.env.get(envName.replace(/[^a-z0-9_]/ig, '_'));

    // TODO: remove the need to load the plugin class in order to disable the plugin
    if (isFalse(enabled) || disabledPlugins.has(Plugin.id)) {
      log.debug(`Plugin "${Plugin.id}" was disabled via configuration option.`);

      pluginClasses[Plugin.id] = null;
    } else {
      pluginClasses[Plugin.id] = Plugin;
    }
  }
}

// TODO this must always be a singleton.
export default class PluginManager {
  private _tracer: any;
  private _tracerConfig: any;
  private _pluginsByName: {};
  private _configsByName: {};
  private _loadedSubscriber: ({ name }: { name: any }) => void;
  constructor(tracer) {
    this._tracer = tracer;
    this._tracerConfig = null;
    this._pluginsByName = {};
    this._configsByName = {};

    this._loadedSubscriber = ({ name }) => {
      const Plugin = plugins[name];

      if (!Plugin || typeof Plugin !== 'function') return;

      this.loadPlugin(Plugin.id);
    };

    loadChannel.subscribe(this._loadedSubscriber);
  }

  loadPlugin(name: string) {
    const Plugin = pluginClasses[name];

    if (!Plugin) return;
    if (!this._pluginsByName[name]) {
      this._pluginsByName[name] = new Plugin(this._tracer, this._tracerConfig);
    }
    if (!this._tracerConfig) return; // TODO: don't wait for tracer to be initialized

    const pluginConfig = this._configsByName[name] || {
      enabled: this._tracerConfig.plugins !== false,
    };

    // extracts predetermined configuration from tracer and combines it with plugin-specific config
    this._pluginsByName[name].configure({
      ...this._getSharedConfig(name),
      ...pluginConfig,
    });
  }

  // TODO: merge config instead of replacing
  configurePlugin(name: string | number, pluginConfig?: any) {
    const enabled = this._isEnabled(pluginConfig);

    this._configsByName[name] = {
      ...pluginConfig,
      enabled,
    };

    this.loadPlugin(name);
  }

  // like instrumenter.enable()
  configure(config = {}) {
    this._tracerConfig = config;
    Nomenclature.configure(config);

    for (const name in pluginClasses) {
      this.loadPlugin(name);
    }
  }

  // This is basically just for testing. like intrumenter.disable()
  destroy() {
    for (const name in this._pluginsByName) {
      this._pluginsByName[name].configure({ enabled: false });
    }

    loadChannel.unsubscribe(this._loadedSubscriber);
  }

  _isEnabled(pluginConfig: { enabled: boolean }) {
    if (typeof pluginConfig === 'boolean') return pluginConfig;
    if (!pluginConfig) return true;

    return pluginConfig.enabled !== false;
  }

  // TODO: figure out a better way to handle this
  _getSharedConfig(name: string | number) {
    const {
      logInjection,
      serviceMapping,
      queryStringObfuscation,
      site,
      url,
      headerTags,
      dbmPropagationMode,
      dsmEnabled,
      clientIpEnabled,
    } = this._tracerConfig;

    const sharedConfig = {};

    if (logInjection !== undefined) {
      sharedConfig.logInjection = logInjection;
    }

    if (queryStringObfuscation !== undefined) {
      sharedConfig.queryStringObfuscation = queryStringObfuscation;
    }

    sharedConfig.dbmPropagationMode = dbmPropagationMode;
    sharedConfig.dsmEnabled = dsmEnabled;

    if (serviceMapping && serviceMapping[name]) {
      sharedConfig.service = serviceMapping[name];
    }

    if (clientIpEnabled !== undefined) {
      sharedConfig.clientIpEnabled = clientIpEnabled;
    }

    sharedConfig.site = site;
    sharedConfig.url = url;
    sharedConfig.headers = headerTags || [];

    return sharedConfig;
  }
}
