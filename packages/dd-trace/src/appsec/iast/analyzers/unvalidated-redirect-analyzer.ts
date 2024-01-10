import InjectionAnalyzer from './injection-analyzer.ts';
import { UNVALIDATED_REDIRECT } from '../vulnerabilities.ts';
import { getNodeModulesPaths } from '../path-line.ts';
import {
  HTTP_REQUEST_HEADER_VALUE,
  HTTP_REQUEST_PATH,
  HTTP_REQUEST_PATH_PARAM,
} from 'https://esm.sh/dd-trace@4.13.1&pin=v135&no-dts/packages/dd-trace/src/appsec/iast/taint-tracking/source-types.js';

const EXCLUDED_PATHS = getNodeModulesPaths('express/lib/response.js');

class UnvalidatedRedirectAnalyzer extends InjectionAnalyzer {
  constructor() {
    super(UNVALIDATED_REDIRECT);
  }

  onConfigure() {
    this.addSub('datadog:http:server:response:set-header:finish', ({ name, value }) => this.analyze(name, value));
  }

  analyze(name: string, value) {
    if (!this.isLocationHeader(name) || typeof value !== 'string') return;

    super.analyze(value);
  }

  isLocationHeader(name: string) {
    return name && name.trim().toLowerCase() === 'location';
  }

  _isVulnerable(
    value,
    iastContext: {
      [x: string]: any;
      rootSpan?: { context: () => { (): any; new (): any; toSpanId: { (): any; new (): any } } };
    },
  ) {
    // FIXME: taint-tracking is not supported
    return false;
  }

  // Do not report vulnerability if ranges sources are exclusively url,
  // path params or referer header to avoid false positives.
  _areSafeRanges(ranges: any[]) {
    return ranges && ranges.every(
      (range) => this._isPathParam(range) || this._isUrl(range) || this._isRefererHeader(range),
    );
  }

  _isRefererHeader(range: { iinfo: { type: any; parameterName: string } }) {
    return range.iinfo.type === HTTP_REQUEST_HEADER_VALUE &&
      range.iinfo.parameterName && range.iinfo.parameterName.toLowerCase() === 'referer';
  }

  _isPathParam(range: { iinfo: { type: any } }) {
    return range.iinfo.type === HTTP_REQUEST_PATH_PARAM;
  }

  _isUrl(range: { iinfo: { type: any } }) {
    return range.iinfo.type === HTTP_REQUEST_PATH;
  }

  _getExcludedPaths() {
    return EXCLUDED_PATHS;
  }
}

export default new UnvalidatedRedirectAnalyzer();
