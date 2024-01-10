import * as tags from 'https://esm.sh/dd-trace@4.13.1&pin=v135&no-dts/ext/tags.js';
import packageJson from '../../../package.json.ts';
import { LogCollapsingLowestDenseDDSketch } from 'https://esm.sh/@datadog/sketches-js@2.1.0';
import { ORIGIN_KEY, TOP_LEVEL_KEY } from './constants.ts';
const { HTTP_STATUS_CODE, MEASURED } = tags;

import { SpanStatsExporter } from './exporters/span-stats/index.ts';

import { DEFAULT_SERVICE_NAME, DEFAULT_SPAN_NAME } from './encode/tags-processors.ts';

class SpanAggStats {
  aggKey: any;
  hits: number;
  topLevelHits: number;
  errors: number;
  duration: number;
  okDistribution: any;
  errorDistribution: any;
  constructor(aggKey: SpanAggKey) {
    this.aggKey = aggKey;
    this.hits = 0;
    this.topLevelHits = 0;
    this.errors = 0;
    this.duration = 0;
    this.okDistribution = new LogCollapsingLowestDenseDDSketch(0.00775);
    this.errorDistribution = new LogCollapsingLowestDenseDDSketch(0.00775);
  }

  record(span: { duration: any; metrics: { [x: string]: any }; error: any }) {
    const durationNs = span.duration;
    this.hits++;
    this.duration += durationNs;

    if (span.metrics[TOP_LEVEL_KEY]) {
      this.topLevelHits++;
    }

    if (span.error) {
      this.errors++;
      this.errorDistribution.accept(durationNs);
    } else {
      this.okDistribution.accept(durationNs);
    }
  }

  toJSON() {
    const {
      name,
      service,
      resource,
      type,
      statusCode,
      synthetics,
    } = this.aggKey;

    return {
      Name: name,
      Service: service,
      Resource: resource,
      Type: type,
      HTTPStatusCode: statusCode,
      Synthetics: synthetics,
      Hits: this.hits,
      TopLevelHits: this.topLevelHits,
      Errors: this.errors,
      Duration: this.duration,
      OkSummary: this.okDistribution.toProto(), // TODO: custom proto encoding
      ErrorSummary: this.errorDistribution.toProto(), // TODO: custom proto encoding
    };
  }
}

class SpanAggKey {
  name: any;
  service: any;
  resource: any;
  type: any;
  statusCode: any;
  synthetics: boolean;
  constructor(span: { name: any; service: any; resource: string; type: string; meta: { [x: string]: string } }) {
    this.name = span.name || DEFAULT_SPAN_NAME;
    this.service = span.service || DEFAULT_SERVICE_NAME;
    this.resource = span.resource || '';
    this.type = span.type || '';
    this.statusCode = span.meta[HTTP_STATUS_CODE] || 0;
    this.synthetics = span.meta[ORIGIN_KEY] === 'synthetics';
  }

  toString() {
    return [
      this.name,
      this.service,
      this.resource,
      this.type,
      this.statusCode,
      this.synthetics,
    ].join(',');
  }
}

class SpanBuckets extends Map {
  forSpan(span: { name: any; service: any; resource: string; type: string; meta: { [x: string]: string } }) {
    const aggKey = new SpanAggKey(span);
    const key = aggKey.toString();

    if (!this.has(key)) {
      this.set(key, new SpanAggStats(aggKey));
    }

    return this.get(key);
  }
}

class TimeBuckets extends Map {
  forTime(time: number) {
    if (!this.has(time)) {
      this.set(time, new SpanBuckets());
    }

    return this.get(time);
  }
}

class SpanStatsProcessor {
  exporter: any;
  interval: number;
  bucketSizeNs: number;
  buckets: TimeBuckets;
  hostname: any;
  enabled: boolean;
  env: any;
  tags: any;
  sequence: number;
  timer: number;
  constructor({
    stats: {
      enabled = false,
      interval = 10,
    },
    hostname,
    port,
    url,
    env,
    tags,
  } = {}) {
    this.exporter = new SpanStatsExporter({
      hostname,
      port,
      tags,
      url,
    });
    this.interval = interval;
    this.bucketSizeNs = interval * 1e9;
    this.buckets = new TimeBuckets();
    this.hostname = Deno.hostname();
    this.enabled = enabled;
    this.env = env;
    this.tags = tags || {};
    this.sequence = 0;

    if (enabled) {
      this.timer = setInterval(this.onInterval.bind(this), interval * 1e3);
      Deno.unrefTimer(this.timer);
    }
  }

  onInterval() {
    const serialized = this._serializeBuckets();
    if (!serialized) return;

    this.exporter.export({
      Hostname: this.hostname,
      Env: this.env,
      Version: Deno.env.get('DD_VERSION'),
      Stats: serialized,
      Lang: 'typescript',
      TracerVersion: packageJson.version,
      RuntimeID: this.tags['runtime-id'],
      Sequence: ++this.sequence,
    });
  }

  onSpanFinished(span: { metrics: { [x: string]: any }; startTime: any; duration: any }) {
    if (!this.enabled) return;
    if (!span.metrics[TOP_LEVEL_KEY] && !span.metrics[MEASURED]) return;

    const spanEndNs = span.startTime + span.duration;
    const bucketTime = spanEndNs - (spanEndNs % this.bucketSizeNs);

    this.buckets.forTime(bucketTime)
      .forSpan(span)
      .record(span);
  }

  _serializeBuckets() {
    const { bucketSizeNs } = this;
    const serializedBuckets: ({ Start: any; Duration: any; Stats: any[] })[] = [];

    for (const [timeNs, bucket] of this.buckets.entries()) {
      const bucketAggStats = [];

      for (const stats of bucket.values()) {
        bucketAggStats.push(stats.toJSON());
      }

      serializedBuckets.push({
        Start: timeNs,
        Duration: bucketSizeNs,
        Stats: bucketAggStats,
      });
    }

    this.buckets.clear();

    return serializedBuckets;
  }
}

export { SpanAggKey, SpanAggStats, SpanBuckets, SpanStatsProcessor, TimeBuckets };
