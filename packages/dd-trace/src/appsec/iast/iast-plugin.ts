import dc from 'node:diagnostics_channel';

import iastLog from './iast-log.ts';
import Plugin from '../../plugins/plugin.ts';
import iastTelemetry from './telemetry/index.ts';
import { EXECUTED_SOURCE, getExecutedMetric, getInstrumentedMetric, TagKey } from './telemetry/iast-metric.ts';
import { storage } from '../../../../datadog-core/index.ts';
import { getIastContext } from './iast-context.ts';
import instrumentations from 'https://esm.sh/dd-trace@4.13.1&pin=v135&no-dts/packages/datadog-instrumentations/src/helpers/instrumentations.js';

/**
 * Used by vulnerability sources and sinks to subscribe diagnostic channel events
 * and indicate what kind of metrics the subscription provides
 * - moduleName is used identify when a module is loaded and
 *    to increment the INSTRUMENTED_[SINK|SOURCE] metric when it occurs
 * - channelName is the channel used by the hook to publish execution events
 * - tag indicates the name of the metric: taint-tracking/source-types for Sources and analyzers type for Sinks
 * - tagKey can be only SOURCE_TYPE (Source) or VULNERABILITY_TYPE (Sink)
 */
class IastPluginSubscription {
  moduleName: any;
  channelName: any;
  tag: any;
  tagKey: any;
  executedMetric: any;
  instrumentedMetric: any;
  moduleInstrumented: boolean;

  constructor(moduleName, channelName, tag, tagKey = TagKey.VULNERABILITY_TYPE) {
    this.moduleName = moduleName;
    this.channelName = channelName;
    this.tag = tag;
    this.tagKey = tagKey;
    this.executedMetric = getExecutedMetric(this.tagKey);
    this.instrumentedMetric = getInstrumentedMetric(this.tagKey);
    this.moduleInstrumented = false;
  }

  increaseInstrumented() {
    if (this.moduleInstrumented) return;

    this.moduleInstrumented = true;
    this.instrumentedMetric.inc(this.tag);
  }

  increaseExecuted(iastContext) {
    this.executedMetric.inc(this.tag, iastContext);
  }

  matchesModuleInstrumented(name: string) {
    // https module is a special case because it's events are published as http
    name = name === 'https' ? 'http' : name;
    return this.moduleName === name;
  }
}

class IastPlugin extends Plugin {
  configured: boolean;
  pluginSubs: any[];
  onInstrumentationLoadedListener: ({ name }: { name: any }) => void;
  constructor() {
    super();
    this.configured = false;
    this.pluginSubs = [];
  }

  _wrapHandler(handler: (arg0: any, arg1: any) => void) {
    return (message, name) => {
      try {
        handler(message, name);
      } catch (e) {
        iastLog.errorAndPublish(e);
      }
    };
  }

  _getTelemetryHandler(iastSub: { increaseExecuted: (arg0: any) => void }) {
    return () => {
      try {
        const iastContext = getIastContext(storage.getStore());
        iastSub.increaseExecuted(iastContext);
      } catch (e) {
        iastLog.errorAndPublish(e);
      }
    };
  }

  _execHandlerAndIncMetric({ handler, metric, tag, iastContext = getIastContext(storage.getStore()) }) {
    try {
      const result = handler();
      iastTelemetry.isEnabled() && metric.inc(tag, iastContext);
      return result;
    } catch (e) {
      iastLog.errorAndPublish(e);
    }
  }

  addSub(
    iastSub: IastPluginSubscription,
    handler: {
      ({ req }: { req: any }): void;
      ({ qs }: { qs: any }): void;
      ({ req }: { req: any }): void;
      ({ cookies }: { cookies: any }): void;
      ({ req }: { req: any }): void;
    },
  ) {
    if (typeof iastSub === 'string') {
      super.addSub(iastSub, this._wrapHandler(handler));
    } else {
      iastSub = this._getAndRegisterSubscription(iastSub);
      if (iastSub) {
        super.addSub(iastSub.channelName, this._wrapHandler(handler));

        if (iastTelemetry.isEnabled()) {
          super.addSub(iastSub.channelName, this._getTelemetryHandler(iastSub));
        }
      }
    }
  }

  onConfigure() {}

  configure(config: boolean) {
    if (typeof config !== 'object') {
      config = { enabled: config };
    }

    if (config.enabled && !this.configured) {
      this.onConfigure();
      this.configured = true;
    }

    if (iastTelemetry.isEnabled()) {
      if (config.enabled) {
        this.enableTelemetry();
      } else {
        this.disableTelemetry();
      }
    }

    super.configure(config);
  }

  _getAndRegisterSubscription({ moduleName, channelName, tag, tagKey }) {
    if (!channelName && !moduleName) return;

    if (!moduleName) {
      const firstSep = channelName.indexOf(':');
      if (firstSep === -1) {
        moduleName = channelName;
      } else {
        const lastSep = channelName.indexOf(':', firstSep + 1);
        moduleName = channelName.substring(firstSep + 1, lastSep !== -1 ? lastSep : channelName.length);
      }
    }

    const iastSub = new IastPluginSubscription(moduleName, channelName, tag, tagKey);
    this.pluginSubs.push(iastSub);
    return iastSub;
  }

  enableTelemetry() {
    if (this.onInstrumentationLoadedListener) return;

    this.onInstrumentationLoadedListener = ({ name }) => this._onInstrumentationLoaded(name);
    const loadChannel = dc.channel('dd-trace:instrumentation:load');
    loadChannel.subscribe(this.onInstrumentationLoadedListener);

    // check for already instrumented modules
    for (const name in instrumentations) {
      this._onInstrumentationLoaded(name);
    }
  }

  disableTelemetry() {
    if (!this.onInstrumentationLoadedListener) return;

    const loadChannel = dc.channel('dd-trace:instrumentation:load');
    if (loadChannel.hasSubscribers) {
      loadChannel.unsubscribe(this.onInstrumentationLoadedListener);
    }
    this.onInstrumentationLoadedListener = null;
  }

  _onInstrumentationLoaded(name: string) {
    this.pluginSubs
      .filter((sub) => sub.matchesModuleInstrumented(name))
      .forEach((sub) => sub.increaseInstrumented());
  }
}

class SourceIastPlugin extends IastPlugin {
  addSub(
    iastPluginSub: { channelName: string; tag: any },
    handler: {
      ({ req }: { req: any }): void;
      ({ qs }: { qs: any }): void;
      ({ req }: { req: any }): void;
      ({ cookies }: { cookies: any }): void;
      ({ req }: { req: any }): void;
    },
  ) {
    return super.addSub({ tagKey: TagKey.SOURCE_TYPE, ...iastPluginSub }, handler);
  }

  addInstrumentedSource(moduleName: string, tag: any[]) {
    this._getAndRegisterSubscription({
      moduleName,
      tag,
      tagKey: TagKey.SOURCE_TYPE,
    });
  }

  execSource(sourceHandlerInfo: { handler: any; tag: any; iastContext: any; metric?: any }) {
    this._execHandlerAndIncMetric({
      metric: EXECUTED_SOURCE,
      ...sourceHandlerInfo,
    });
  }
}

class SinkIastPlugin extends IastPlugin {
  addSub(
    iastPluginSub: { channelName: string; tag: any },
    handler: {
      ({ req }: { req: any }): void;
      ({ qs }: { qs: any }): void;
      ({ req }: { req: any }): void;
      ({ cookies }: { cookies: any }): void;
      ({ req }: { req: any }): void;
    },
  ) {
    return super.addSub({ tagKey: TagKey.VULNERABILITY_TYPE, ...iastPluginSub }, handler);
  }
}

export { IastPlugin, SinkIastPlugin, SourceIastPlugin };
