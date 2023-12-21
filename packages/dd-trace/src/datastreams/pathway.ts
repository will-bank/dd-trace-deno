// encoding used here is sha256
// other languages use FNV1
// this inconsistency is ok because hashes do not need to be consistent across services
import { Buffer } from 'node:buffer';
import { decodeVarint, encodeVarint } from './encoding.ts';
import LRUCache from 'https://esm.sh/lru-cache@7.14.0';
import { crypto } from 'https://deno.land/std@0.204.0/crypto/crypto.ts';

const options = { max: 500 };
const cache = new LRUCache(options);

function shaHash(checkpointString: string) {
  return crypto.subtle.digestSync('SHA-1', new TextEncoder().encode(checkpointString));
}

function computePathwayHash(service, env, edgeTags: any[], parentHash: { toString: () => string }) {
  const key = `${service}${env}` + edgeTags.join('') + parentHash.toString();
  if (cache.get(key)) {
    return cache.get(key);
  }
  const currentHash = shaHash(`${service}${env}` + edgeTags.join(''));
  const buf = Buffer.concat([new Uint8Array(currentHash), new Uint8Array(parentHash)], 16);
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
