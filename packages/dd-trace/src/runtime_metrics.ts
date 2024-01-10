// TODO: capture every second and flush every 10 seconds

import v8 from 'node:v8';
import { DogStatsDClient } from './dogstatsd.ts';
import Histogram from './histogram.ts';
import log from './log/index.ts';

const INTERVAL = 10 * 1000;
const START_TIME = Date.now();

let interval: number;
let client: DogStatsDClient;
let gauges: Record<string, Map<string, number>>;
let counters: Record<string, Map<string, number>>;
let histograms: Record<string, Map<string, Histogram>>;

reset();

export function start(config) {
  const clientConfig = DogStatsDClient.generateClientConfig(config);

  client = new DogStatsDClient(clientConfig);

  interval = setInterval(() => {
    captureCommonMetrics();
    captureCpuUsage();
    captureHeapSpace();
    client.flush();
  }, INTERVAL);

  Deno.unrefTimer(interval);
}

export function stop() {
  clearInterval(interval);
  reset();
}

export function boolean(name, value, tag) {
  gauge(name, value ? 1 : 0, tag);
}

export function histogram(name: string | number, value, tag) {
  if (!client) return;

  histograms[name] = histograms[name] || new Map();

  if (!histograms[name].has(tag)) {
    histograms[name].set(tag, new Histogram());
  }

  histograms[name].get(tag).record(value);
}

export function updateCount(
  name: string | number,
  count: number,
  tagOrMonotonic?: string | boolean,
  monotonic = false,
) {
  if (!client) return;
  let tag;
  if (typeof tagOrMonotonic === 'boolean') {
    monotonic = tagOrMonotonic;
    tag = undefined;
  } else {
    tag = tagOrMonotonic;
  }

  const map = monotonic ? counters : gauges;

  map[name] = map[name] || new Map();

  const value = map[name].get(tag) || 0;

  map[name].set(tag, value + count);
}

export function gauge(name: string | number, value, tag) {
  if (!client) return;

  gauges[name] = gauges[name] || new Map();
  gauges[name].set(tag, value);
}

export function increment(
  name: Parameters<typeof updateCount>[0],
  tagOrMonotonic?: Parameters<typeof updateCount>[2],
  monotonic?: Parameters<typeof updateCount>[3],
) {
  updateCount(name, 1, tagOrMonotonic, monotonic);
}

export function decrement(
  name: Parameters<typeof updateCount>[0],
  tagOrMonotonic?: Parameters<typeof updateCount>[2],
  monotonic?: Parameters<typeof updateCount>[3],
) {
  updateCount(name, -1, tagOrMonotonic, monotonic);
}

function reset() {
  interval = null;
  client = null;
  gauges = {};
  counters = {};
  histograms = {};
}

function captureCpuUsage() {
  const [avg1min] = Deno.loadavg();
  client.gauge('runtime.deno.cpu.total', parseFloat(avg1min.toFixed(2)));
}

function captureMemoryUsage() {
  const usage = Deno.memoryUsage();
  const system = Deno.systemMemoryInfo();

  client.gauge('runtime.deno.mem.heap_total', usage.heapTotal);
  client.gauge('runtime.deno.mem.heap_used', usage.heapUsed);
  client.gauge('runtime.deno.mem.rss', usage.rss);
  client.gauge('runtime.deno.mem.total', system.total);
  client.gauge('runtime.deno.mem.free', system.free);
  client.gauge('runtime.deno.mem.external', usage.external);
}

function captureProcess() {
  client.gauge('runtime.deno.process.uptime', Math.round(Date.now() - START_TIME / 1000));
}

function captureHeapStats() {
  const stats = v8.getHeapStatistics();

  client.gauge('runtime.deno.heap.total_heap_size', stats.total_heap_size);
  client.gauge('runtime.deno.heap.total_heap_size_executable', stats.total_heap_size_executable);
  client.gauge('runtime.deno.heap.total_physical_size', stats.total_physical_size);
  client.gauge('runtime.deno.heap.total_available_size', stats.total_available_size);
  client.gauge('runtime.deno.heap.heap_size_limit', stats.heap_size_limit);

  stats.malloced_memory && client.gauge('runtime.deno.heap.malloced_memory', stats.malloced_memory);
  stats.peak_malloced_memory && client.gauge('runtime.deno.heap.peak_malloced_memory', stats.peak_malloced_memory);
}

function captureHeapSpace() {
  try {
    if (!v8.getHeapSpaceStatistics) return;

    // (2023-12-22) not implemented yet: https://github.com/denoland/deno/blob/cdbf902/ext/node/polyfills/v8.ts#L20
    const stats = v8.getHeapSpaceStatistics();

    for (let i = 0, l = stats.length; i < l; i++) {
      const tags = [`space:${stats[i].space_name}`];

      client.gauge('runtime.deno.heap.size.by.space', stats[i].space_size, tags);
      client.gauge('runtime.deno.heap.used_size.by.space', stats[i].space_used_size, tags);
      client.gauge('runtime.deno.heap.available_size.by.space', stats[i].space_available_size, tags);
      client.gauge('runtime.deno.heap.physical_size.by.space', stats[i].physical_space_size, tags);
    }
  } catch (e) {
    log.error(e);
  }
}

function captureGauges() {
  Object.keys(gauges).forEach((name) => {
    gauges[name].forEach((value, tag) => {
      client.gauge(name, value, tag ? [tag] : []);
    });
  });
}

function captureCounters() {
  Object.keys(counters).forEach((name) => {
    counters[name].forEach((value, tag) => {
      client.increment(name, value, tag ? [tag] : []);
    });
  });

  counters = {};
}

function captureHistograms() {
  Object.keys(histograms).forEach((name) => {
    histograms[name].forEach((stats: { reset: () => void }, tag) => {
      _histogram(name, stats, tag ? [tag] : []);
      stats.reset();
    });
  });
}

function captureCommonMetrics() {
  captureMemoryUsage();
  captureProcess();
  captureHeapStats();
  captureGauges();
  captureCounters();
  captureHistograms();
}

function _histogram(
  name: string,
  stats: { min: any; max: any; sum: any; avg: any; count: any; median: any; p95: any } | ({ reset: () => void }),
  tags: any[],
) {
  tags = [].concat(tags);

  client.gauge(`${name}.min`, stats.min, tags);
  client.gauge(`${name}.max`, stats.max, tags);
  client.increment(`${name}.sum`, stats.sum, tags);
  client.increment(`${name}.total`, stats.sum, tags);
  client.gauge(`${name}.avg`, stats.avg, tags);
  client.increment(`${name}.count`, stats.count, tags);
  client.gauge(`${name}.median`, stats.median, tags);
  client.gauge(`${name}.95percentile`, stats.p95, tags);
}
