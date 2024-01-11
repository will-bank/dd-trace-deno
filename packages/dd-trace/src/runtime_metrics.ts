// TODO: capture every second and flush every 10 seconds

import v8 from 'node:v8';
import { DogStatsDClient } from './dogstatsd.ts';
import Histogram from './histogram.ts';
import log from './log/index.ts';

const INTERVAL = 10 * 1000;

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

  // Experimental: count unhandled rejections
  addEventListener('unhandledrejection', captureUnhandledRejections);

  Deno.unrefTimer(interval);
}

export function stop() {
  clearInterval(interval);
  removeEventListener('unhandledrejection', captureUnhandledRejections);
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

  client.gauge('runtime.deno.mem.usage.heap_total', usage.heapTotal);
  client.gauge('runtime.deno.mem.usage.heap_used', usage.heapUsed);
  client.gauge('runtime.deno.mem.usage.rss', usage.rss);
  client.gauge('runtime.deno.mem.usage.external', usage.external);

  client.gauge('runtime.deno.mem.system.total', system.total);
  client.gauge('runtime.deno.mem.system.free', system.free);
  client.gauge('runtime.deno.mem.system.available', system.available);
  client.gauge('runtime.deno.mem.system.buffers', system.buffers);
  client.gauge('runtime.deno.mem.system.cached', system.cached);
  client.gauge('runtime.deno.mem.system.swap_total', system.swapTotal);
  client.gauge('runtime.deno.mem.system.swap_free', system.swapFree);
}

function captureProcess() {
  client.gauge('runtime.deno.process.uptime', Math.round(performance.now() / 1000));
}

function captureHeapStats() {
  const stats = v8.getHeapStatistics();

  client.gauge('runtime.deno.heap.total_heap_size', stats.total_heap_size);
  client.gauge('runtime.deno.heap.total_heap_size_executable', stats.total_heap_size_executable);
  client.gauge('runtime.deno.heap.total_physical_size', stats.total_physical_size);
  client.gauge('runtime.deno.heap.total_available_size', stats.total_available_size);
  client.gauge('runtime.deno.heap.heap_size_limit', stats.heap_size_limit);
  client.gauge('runtime.deno.heap.used_heap_size', stats.used_heap_size);
  client.gauge('runtime.deno.heap.malloced_memory', stats.malloced_memory);
  client.gauge('runtime.deno.heap.peak_malloced_memory', stats.peak_malloced_memory);

  client.gauge('runtime.deno.heap.number_of_native_contexts', stats.number_of_native_contexts);
  client.gauge('runtime.deno.heap.number_of_detached_contexts', stats.number_of_detached_contexts);

  if ('total_global_handles_size' in stats) {
    client.gauge('runtime.deno.heap.total_global_handles_size', stats.total_global_handles_size as number);
  }

  if ('used_global_handles_size' in stats) {
    client.gauge('runtime.deno.heap.used_global_handles_size', stats.used_global_handles_size as number);
  }

  if (stats.malloced_memory) {
    client.gauge('runtime.deno.heap.malloced_memory', stats.malloced_memory);
  }

  if (stats.peak_malloced_memory) {
    client.gauge('runtime.deno.heap.peak_malloced_memory', stats.peak_malloced_memory);
  }
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

function captureUnhandledRejections(event: PromiseRejectionEvent) {
  client.increment('runtime.deno.unhandledrejections');
  client.flush();
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
