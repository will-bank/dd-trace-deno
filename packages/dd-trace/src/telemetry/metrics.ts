import packageJson from 'npm:dd-trace/package.json' assert { type: 'json' };
import { sendData } from './send-data.ts';

function getId(type: string, namespace: MetricsCollection, name, tags) {
  return `${type}:${namespace}.${name}:${tagArray(tags).sort().join(',')}`;
}

function tagArray(tags = {}) {
  if (Array.isArray(tags)) return tags;
  const list: string[] = [];

  for (const [key, value] of Object.entries(tags)) {
    list.push(`${key}:${value}`.toLowerCase());
  }
  return list;
}

function now() {
  return Date.now() / 1e3;
}

function mapToJsonArray(map: this | this) {

  return Array.from(map.values()).map((v: { toJSON: () => any }) => v.toJSON());
}

function hasPoints(metric: { points: string | any[] }) {
  return metric.points.length > 0;
}

class Metric {
  namespace: any;
  metric: any;
  tags: any[];
  common: any;
  points: any[];

  constructor(namespace: { toString: () => any }, metric, common, tags) {
    this.namespace = namespace.toString();
    this.metric = common ? metric : `deno.${metric}`;
    this.tags = tagArray(tags);
    if (common) {
      this.tags.push('lib_language:deno');
      this.tags.push(`version:${Deno.version.deno}`);
    } else {
      this.tags.push(`lib_version:${packageJson.version}`);
    }
    this.common = common;

    this.points = [];
  }

  toString() {
    const { namespace, metric } = this;
    return `${namespace}.${metric}`;
  }

  reset() {
    this.points = [];
  }

  track() {
    throw new Error('not implemented');
  }

  toJSON() {

    const { metric, points, interval, type, tags, common } = this;
    return {
      metric,
      points,
      interval,
      type,
      tags,
      common,
    };
  }
}

class CountMetric extends Metric {

  get type() {
    return 'count';
  }

  inc(value: number) {
    return this.track(value);
  }

  dec(value = -1) {
    return this.track(value);
  }

  track(value = 1) {
    if (this.points.length) {
      this.points[0][1] += value;
    } else {
      this.points.push([now(), value]);
    }
  }
}

class DistributionMetric extends Metric {

  get type() {
    return 'distribution';
  }

  track(value = 1) {
    this.points.push(value);
  }


  toJSON() {
    const { metric, points, tags, common } = this;
    return {
      metric,
      points,
      common,
      tags,
    };
  }
}

class GaugeMetric extends Metric {

  get type() {
    return 'gauge';
  }

  mark(value: number) {
    return this.track(value);
  }

  track(value = 1) {
    this.points.push([now(), value]);
  }
}

class RateMetric extends Metric {
  interval: any;
  rate: number;

  constructor(namespace: { toString: () => any }, metric, common, tags, interval) {
    super(namespace, metric, common, tags);

    this.interval = interval;
    this.rate = 0;
  }


  get type() {
    return 'rate';
  }

  reset() {
    super.reset();
    this.rate = 0;
  }

  track(value = 1) {
    this.rate += value;
    const rate = this.interval ? (this.rate / this.interval) : 0.0;
    this.points = [[now(), rate]];
  }
}

const metricsTypes = {
  count: CountMetric,
  distribution: DistributionMetric,
  gauge: GaugeMetric,
  rate: RateMetric,
};

class MetricsCollection extends Map {
  namespace: any;
  constructor(namespace: string) {
    super();
    this.namespace = namespace;
  }

  reset() {

    for (const metric of this.values()) {
      metric.reset();
    }
  }

  toString() {
    return this.namespace;
  }

  toJSON() {

    if (!this.size) return;

    const series = mapToJsonArray(this)
      .filter(hasPoints);

    if (!series.length) return;

    const { namespace } = this;
    return {
      namespace,
      series,
    };
  }
}

function getMetric(collection: MetricsCollection, type: string, name, tags, interval: undefined) {
  const metricId = getId(type, collection, name, tags);


  let metric = collection.get(metricId);
  if (metric) return metric;


  const Factory = metricsTypes[type];
  if (!Factory) {
    throw new Error(`Unknown metric type ${type}`);
  }

  metric = new Factory(collection, name, true, tags, interval);

  collection.set(metricId, metric);

  return metric;
}

class Namespace {
  distributions: MetricsCollection;
  metrics: MetricsCollection;
  constructor(namespace: string) {
    this.distributions = new MetricsCollection(namespace);
    this.metrics = new MetricsCollection(namespace);
  }

  reset() {
    this.metrics.reset();
    this.distributions.reset();
  }


  count(name, tags: any[]) {

    return getMetric(this.metrics, 'count', name, tags);
  }


  gauge(name, tags) {

    return getMetric(this.metrics, 'gauge', name, tags);
  }


  rate(name, interval: undefined, tags) {
    return getMetric(this.metrics, 'rate', name, tags, interval);
  }


  distribution(name, tags) {

    return getMetric(this.distributions, 'distribution', name, tags);
  }

  toJSON() {
    const { distributions, metrics } = this;
    return {
      distributions: distributions.toJSON(),
      metrics: metrics.toJSON(),
    };
  }
}

class NamespaceManager extends Map {
  namespace(name: string) {

    let ns = this.get(name);
    if (ns) return ns;

    ns = new Namespace(name);

    this.set(name, ns);
    return ns;
  }

  toJSON() {
    return mapToJsonArray(this);
  }

  send(
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

    for (const namespace of this.values()) {
      const { metrics, distributions } = namespace.toJSON();

      if (metrics) {
        sendData(config, application, host, 'generate-metrics', metrics);
      }

      if (distributions) {
        sendData(config, application, host, 'distributions', distributions);
      }

      // TODO: This could also be clear() but then it'd have to rebuild all
      // metric instances on every send. This may be desirable if we want tags
      // with high cardinality and variability over time.
      namespace.reset();
    }
  }
}

const manager = new NamespaceManager();

export {
  CountMetric,
  DistributionMetric,
  GaugeMetric,
  manager,
  MetricsCollection,
  Namespace,
  NamespaceManager,
  RateMetric,
};
