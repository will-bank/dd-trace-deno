import { join } from 'https://deno.land/std@0.204.0/path/join.ts';
import { SEP } from 'https://deno.land/std@0.204.0/path/separator.ts';
import { getNodeModulesPaths } from '../path-line.ts';
import { WEAK_HASH } from '../vulnerabilities.ts';
import Analyzer from './vulnerability-analyzer.ts';

const INSECURE_HASH_ALGORITHMS = new Set([
  'md4',
  'md4WithRSAEncryption',
  'RSA-MD4',
  'RSA-MD5',
  'md5',
  'md5-sha1',
  'ssl3-md5',
  'md5WithRSAEncryption',
  'RSA-SHA1',
  'RSA-SHA1-2',
  'sha1',
  'md5-sha1',
  'sha1WithRSAEncryption',
  'ssl3-sha1',
].map((algorithm) => algorithm.toLowerCase()));

const EXCLUDED_LOCATIONS = getNodeModulesPaths(
  'etag/index.js',
  '@mikro-orm/core/utils/Utils.js',
  'mongodb/lib/core/connection/connection.js',
  'mysql2/lib/auth_41.js',
  'pusher/lib/utils.js',
  'redlock/dist/cjs',
  'sqreen/lib/package-reader/index.js',
  'ws/lib/websocket-server.js',
);

const EXCLUDED_PATHS_FROM_STACK = [
  join('node_modules', 'object-hash', SEP),
];
class WeakHashAnalyzer extends Analyzer {
  constructor() {
    super(WEAK_HASH);
  }

  onConfigure() {
    this.addSub('datadog:crypto:hashing:start', ({ algorithm }) => this.analyze(algorithm));
  }

  _isVulnerable(algorithm: string) {
    if (typeof algorithm === 'string') {
      return INSECURE_HASH_ALGORITHMS.has(algorithm.toLowerCase());
    }
    return false;
  }

  _isExcluded(location: { path: { includes: (arg0: any) => unknown } }) {
    return EXCLUDED_LOCATIONS.some((excludedLocation) => {
      return location.path.includes(excludedLocation);
    });
  }

  _getExcludedPaths() {
    return EXCLUDED_PATHS_FROM_STACK;
  }
}

export default new WeakHashAnalyzer();
