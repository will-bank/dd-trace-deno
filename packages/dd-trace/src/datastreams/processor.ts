import os from 'node:os';
import packageJson from 'npm:dd-trace/package.json' assert { type: 'json' }; // Message pack int encoding is done in big endian, but data streams uses little endian
import { type Uint64BE as Uint64 } from 'npm:int64-buffer';

import { LogCollapsingLowestDenseDDSketch } from 'npm:@datadog/sketches-js';

import { DataStreamsWriter } from './writer.ts';
import { computePathwayHash } from './pathway.ts';
const ENTRY_PARENT_HASH = new TextEncoder().encode('\0\0\0\0\0\0\0\0');

const HIGH_ACCURACY_DISTRIBUTION = 0.0075;

class StatsPoint {
  hash: any;
  parentHash: any;
  edgeTags: any;
  edgeLatency: any;
  pathwayLatency: any;
  constructor(hash, parentHash, edgeTags) {
    this.hash = new Uint64(hash);
    this.parentHash = new Uint64(parentHash);
    this.edgeTags = edgeTags;
    this.edgeLatency = new LogCollapsingLowestDenseDDSketch(HIGH_ACCURACY_DISTRIBUTION);
    this.pathwayLatency = new LogCollapsingLowestDenseDDSketch(HIGH_ACCURACY_DISTRIBUTION);
  }

  addLatencies(checkpoint: { edgeLatencyNs: number; pathwayLatencyNs: number }) {
    const edgeLatencySec = checkpoint.edgeLatencyNs / 1e9;
    const pathwayLatencySec = checkpoint.pathwayLatencyNs / 1e9;
    this.edgeLatency.accept(edgeLatencySec);
    this.pathwayLatency.accept(pathwayLatencySec);
  }

  encode() {
    return {
      Hash: this.hash,
      ParentHash: this.parentHash,
      EdgeTags: this.edgeTags,
      EdgeLatency: this.edgeLatency.toProto(),
      PathwayLatency: this.pathwayLatency.toProto(),
    };
  }
}

class StatsBucket extends Map {
  forCheckpoint(checkpoint: { hash: any; parentHash: any; edgeTags: any }) {
    const key = checkpoint.hash;
    if (!this.has(key)) {
      this.set(key, new StatsPoint(checkpoint.hash, checkpoint.parentHash, checkpoint.edgeTags)); // StatsPoint
    }

    return this.get(key);
  }
}

class TimeBuckets extends Map {
  forTime(time) {
    if (!this.has(time)) {
      this.set(time, new StatsBucket());
    }

    return this.get(time);
  }
}

class DataStreamsProcessor {
  writer: DataStreamsWriter;
  bucketSizeNs: number;
  buckets: TimeBuckets;
  hostname: any;
  enabled: any;
  env: any;
  tags: any;
  service: any;
  sequence: number;
  timer: number;
  constructor({
    dsmEnabled,
    hostname,
    port,
    url,
    env,
    tags,
  } = {}) {
    this.writer = new DataStreamsWriter({
      hostname,
      port,
      url,
    });
    this.bucketSizeNs = 1e10;
    this.buckets = new TimeBuckets();
    this.hostname = os.hostname();
    this.enabled = dsmEnabled;
    this.env = env;
    this.tags = tags || {};
    this.service = this.tags.service || 'unnamed-nodejs-service';
    this.sequence = 0;

    if (this.enabled) {
      this.timer = setInterval(this.onInterval.bind(this), 10000);
      this.timer.unref();
    }
  }

  onInterval() {
    const serialized = this._serializeBuckets();
    if (!serialized) return;
    const payload = {
      Env: this.env,
      Service: this.service,
      Stats: serialized,
      TracerVersion: packageJson.version,
      Lang: 'typescript',
    };
    this.writer.flush(payload);
  }

  recordCheckpoint(
    checkpoint: {
      currentTimestamp: any;
      parentHash?: any;
      hash?: any;
      edgeTags?: any;
      edgeLatencyNs?: number;
      pathwayLatencyNs?: number;
    },
  ) {
    if (!this.enabled) return;
    const bucketTime = Math.round(checkpoint.currentTimestamp - (checkpoint.currentTimestamp % this.bucketSizeNs));
    this.buckets.forTime(bucketTime)
      .forCheckpoint(checkpoint)
      .addLatencies(checkpoint);
  }

  setCheckpoint(edgeTags: { find: (arg0: (t: any) => any) => any }, ctx = null) {
    if (!this.enabled) return null;
    const nowNs = Date.now() * 1e6;
    const direction = edgeTags.find((t: { startsWith: (arg0: string) => any }) => t.startsWith('direction:'));
    let pathwayStartNs = nowNs;
    let edgeStartNs = nowNs;
    let parentHash = ENTRY_PARENT_HASH;
    let closestOppositeDirectionHash = ENTRY_PARENT_HASH;
    let closestOppositeDirectionEdgeStart = nowNs;
    if (ctx != null) {
      pathwayStartNs = ctx.pathwayStartNs;
      edgeStartNs = ctx.edgeStartNs;
      parentHash = ctx.hash;
      closestOppositeDirectionHash = ctx.closestOppositeDirectionHash || ENTRY_PARENT_HASH;
      closestOppositeDirectionEdgeStart = ctx.closestOppositeDirectionEdgeStart || nowNs;
      if (direction === ctx.previousDirection) {
        parentHash = ctx.closestOppositeDirectionHash;
        if (parentHash === ENTRY_PARENT_HASH) {
          // if the closest hash from opposite direction is the entry hash, that means
          // we produce in a loop, without consuming
          // in that case, we don't want the pathway to be longer and longer, but we want to restart a new pathway.
          edgeStartNs = nowNs;
          pathwayStartNs = nowNs;
        } else {
          edgeStartNs = ctx.closestOppositeDirectionEdgeStart;
        }
      } else {
        closestOppositeDirectionHash = parentHash;
        closestOppositeDirectionEdgeStart = edgeStartNs;
      }
    }
    const hash = computePathwayHash(this.service, this.env, edgeTags, parentHash);
    const edgeLatencyNs = nowNs - edgeStartNs;
    const pathwayLatencyNs = nowNs - pathwayStartNs;
    const checkpoint = {
      currentTimestamp: nowNs,
      parentHash: parentHash,
      hash: hash,
      edgeTags: edgeTags,
      edgeLatencyNs: edgeLatencyNs,
      pathwayLatencyNs: pathwayLatencyNs,
    };
    this.recordCheckpoint(checkpoint);
    return {
      hash: hash,
      edgeStartNs: edgeStartNs,
      pathwayStartNs: pathwayStartNs,
      previousDirection: direction,
      closestOppositeDirectionHash: closestOppositeDirectionHash,
      closestOppositeDirectionEdgeStart: closestOppositeDirectionEdgeStart,
    };
  }

  _serializeBuckets() {
    const serializedBuckets: ({ Start: any; Duration: any; Stats: any[] })[] = [];

    for (const [timeNs, bucket] of this.buckets.entries()) {
      const points = [];

      for (const stats of bucket.values()) {
        points.push(stats.encode());
      }

      serializedBuckets.push({
        Start: new Uint64(timeNs),
        Duration: new Uint64(this.bucketSizeNs),
        Stats: points,
      });
    }

    this.buckets.clear();

    return serializedBuckets;
  }
}

export { DataStreamsProcessor, ENTRY_PARENT_HASH, StatsBucket, StatsPoint, TimeBuckets };
