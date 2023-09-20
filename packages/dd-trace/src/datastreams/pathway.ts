// encoding used here is sha256
// other languages use FNV1
// this inconsistency is ok because hashes do not need to be consistent across services
import * as hex from "https://deno.land/std@0.201.0/encoding/hex.ts";
import crypto from 'node:crypto';
import { Buffer } from "https://deno.land/std@0.177.0/node/buffer.ts";
import { decodeVarint, encodeVarint } from './encoding.ts';
import LRUCache from 'npm:lru-cache@7.14.0';

const options = { max: 500 };
const cache = new LRUCache(options);

function shaHash(checkpointString: string) {
  const hash = crypto.createHash('md5').update(checkpointString).digest('hex').slice(0, 16);
  return new TextEncoder().encode(hex.decode(hash));
}

function computePathwayHash(service, env, edgeTags: any[], parentHash: { toString: () => string }) {
  const key = `${service}${env}` + edgeTags.join('') + parentHash.toString();
  if (cache.get(key)) {
    return cache.get(key);
  }
  const currentHash = shaHash(`${service}${env}` + edgeTags.join(''));
  const buf = Buffer.concat([currentHash, parentHash], 16);
  const val = shaHash(buf.toString());
  cache.set(key, val);
  return val;
}

function encodePathwayContext(dataStreamsContext: { hash: any; pathwayStartNs: number; edgeStartNs: number }) {
  return Buffer.concat([
    dataStreamsContext.hash,
    new TextEncoder().encode(encodeVarint(Math.round(dataStreamsContext.pathwayStartNs / 1e6))),
    new TextEncoder().encode(encodeVarint(Math.round(dataStreamsContext.edgeStartNs / 1e6))),
  ], 20);
}

function decodePathwayContext(pathwayContext: { length: number; subarray: (arg0: number, arg1: number) => any }) {
  if (pathwayContext == null || pathwayContext.length < 8) {
    return null;
  }
  // hash and parent hash are in LE
  const pathwayHash = pathwayContext.subarray(0, 8);
  const encodedTimestamps = pathwayContext.subarray(8);
  const [pathwayStartMs, encodedTimeSincePrev] = decodeVarint(encodedTimestamps);
  if (pathwayStartMs === undefined) {
    return null;
  }
  const [edgeStartMs] = decodeVarint(encodedTimeSincePrev);
  if (edgeStartMs === undefined) {
    return null;
  }
  return { hash: pathwayHash, pathwayStartNs: pathwayStartMs * 1e6, edgeStartNs: edgeStartMs * 1e6 };
}

export { computePathwayHash, decodePathwayContext, encodePathwayContext };
