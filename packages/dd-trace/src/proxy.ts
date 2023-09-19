import NoopProxy from './noop/proxy.ts';
import DatadogTracer from './tracer.ts';
import Config from './config.ts';
import * as runtimeMetrics from './runtime_metrics.ts';
import log from './log/index.ts';
import { setStartupLogPluginManager } from './startup-log.ts';
import * as telemetry from './telemetry/index.ts';
import PluginManager from './plugin_manager.ts';
import * as remoteConfig from './appsec/remote_config/index.ts';
import AppsecSdk from './appsec/sdk/index.ts';
import * as dogstatsd from './dogstatsd.ts';
import TracerProvider from './opentelemetry/tracer_provider.ts';

export default class Tracer extends NoopProxy {
  private _initialized: boolean;
  private _pluginManager: any;
  dogstatsd: any;
  private _tracer: DatadogTracer;
  appsec: any;
  private _testApiManualPlugin: any;
  constructor() {
    super();

    this._initialized = false;
    this._pluginManager = new PluginManager(this);
    this.dogstatsd = new dogstatsd.NoopDogStatsDClient();
  }

  async init(options) {
    if (this._initialized) return this;

    this._initialized = true;

    try {
      const config = new Config(options); // TODO: support dynamic code config

      // if (config.dogstatsd) {
      //   // Custom Metrics
      //   this.dogstatsd = new dogstatsd.CustomMetrics(config);

      //   Deno.unrefTimer(
      //     setInterval(() => {
      //       this.dogstatsd.flush();
      //     }, 10 * 1000)
      //   );
      // }

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
          profiler.start(config)
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
          appsec.enable(config)
        }

        this._tracer = new DatadogTracer(config);
        this.appsec = new AppsecSdk(this._tracer, config);

        if (config.iast.enabled) {
          const iast = await import('./appsec/iast/index.ts');
          iast.enable(config, this._tracer)
        }

        this._pluginManager.configure(config);
        setStartupLogPluginManager(this._pluginManager);

        if (config.isManualApiEnabled) {
          const { default: TestApiManualPlugin } = await import('./ci-visibility/test-api-manual/test-api-manual-plugin.ts');
          this._testApiManualPlugin = new TestApiManualPlugin(this);
          this._testApiManualPlugin.configure({ ...config, enabled: true });
        }
      }
    } catch (e) {
      log.error(e);
    }

    return this;
  }

  use() {
    this._pluginManager.configurePlugin(...arguments);
    return this;
  }

  get TracerProvider() {
    return TracerProvider;
  }
}
