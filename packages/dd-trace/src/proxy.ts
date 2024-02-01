import NoopProxyTracer from './noop/proxy.ts';
import DatadogTracer from './tracer.ts';
import Config from './config.ts';
import * as runtimeMetrics from './runtime_metrics.ts';
import log from './log/index.ts';
import { setStartupLogPluginManager } from './startup-log.ts';
import * as telemetry from './telemetry/index.ts';
import PluginManager from './plugin_manager.ts';
import * as remoteConfig from './appsec/remote_config/index.ts';
import AppsecSdk from './appsec/sdk/index.ts';
import { CustomMetrics } from './dogstatsd.ts';
import TracerProvider from './opentelemetry/tracer_provider.ts';
import NoopAppsecSdk from './appsec/sdk/noop.ts';
import { IAppsec } from './interfaces.ts';

export default class ProxyTracer extends NoopProxyTracer {
  private _initialized: boolean;
  private _pluginManager: PluginManager;
  dogstatsd = CustomMetrics.noop();
  appsec: IAppsec = new NoopAppsecSdk();
  constructor() {
    super();

    this._initialized = false;
    this._pluginManager = new PluginManager(this);
  }

  async init(options): Promise<this> {
    if (this._initialized) return this;

    this._initialized = true;

    try {
      const config = new Config(options); // TODO: support dynamic code config

      try {
        // Custom Metrics
        this.dogstatsd = CustomMetrics.forConfig(config);

        Deno.unrefTimer(
          setInterval(() => {
            this.dogstatsd.flush();
          }, 10 * 1000),
        );
      } catch (e) {
        console.error('Error initializing dogstatsd', e);
        log.error(e);
      }

      if (config.remoteConfig.enabled && !config.isCiVisibility) {
        const rc = remoteConfig.enable(config);

        rc.on('APM_TRACING', (action: string, conf: { lib_config: any }) => {
          if (action === 'unapply') {
            config.configure({}, true);
          } else {
            config.configure(conf.lib_config, true);
          }

          if (config.tracing) {
            this._tracer.configure(config);
            this._pluginManager.configure(config);
          }
        });
      }

      if (config.isGCPFunction || config.isAzureFunctionConsumptionPlan) {
        const serverless = await import('./serverless.ts');
        serverless.maybeStartServerlessMiniAgent(config);
      }

      if (config.profiling.enabled) {
        // do not stop tracer initialization if the profiler fails to be imported
        try {
          const profiler = await import('./profiler.ts');
          profiler.start(config);
        } catch (e) {
          log.error(e);
        }
      }

      if (config.runtimeMetrics) {
        runtimeMetrics.start(config);
      }

      if (config.tracing) {
        // TODO: This should probably not require tracing to be enabled.
        telemetry.start(config, this._pluginManager);

        // dirty require for now so zero appsec code is executed unless explicitly enabled
        if (config.appsec.enabled) {
          const appsec = await import('./appsec/index.ts');
          appsec.enable(config);
        }

        this._tracer = new DatadogTracer(config);
        this.appsec = new AppsecSdk(this._tracer, config);

        if (config.iast.enabled) {
          const iast = await import('./appsec/iast/index.ts');
          iast.enable(config, this._tracer);
        }

        this._pluginManager.configure(config);
        setStartupLogPluginManager(this._pluginManager);

        if (config.isManualApiEnabled) {
          log.error('Manual API is not supported');
        }
      }
    } catch (e) {
      log.error(e);
    }

    return this;
  }

  use(...args: Parameters<PluginManager['configurePlugin']>) {
    this._pluginManager.configurePlugin(...args);
    return this;
  }

  get TracerProvider() {
    return TracerProvider;
  }
}
