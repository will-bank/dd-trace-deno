import { globMatch } from '../src/util.ts';
import * as priority from 'https://esm.sh/dd-trace@4.13.1&pin=v135&no-dts/ext/priority.js';
const { USER_KEEP, AUTO_KEEP } = priority;
import RateLimiter from './rate_limiter.ts';
import Sampler from './sampler.ts';

class SpanSamplingRule {
  service: any;
  name: any;
  private _sampler: any;
  private _limiter: any;
  constructor({ service, name, sampleRate = 1.0, maxPerSecond } = {}) {
    this.service = service;
    this.name = name;

    this._sampler = new Sampler(sampleRate);
    this._limiter = undefined;

    if (Number.isFinite(maxPerSecond)) {
      this._limiter = new RateLimiter(maxPerSecond);
    }
  }

  get sampleRate() {
    return this._sampler.rate();
  }

  get maxPerSecond() {
    return this._limiter && this._limiter._rateLimit;
  }

  static from(config: { service: any; name: any; sampleRate?: number; maxPerSecond: any }) {
    return new SpanSamplingRule(config);
  }

  match(service: string | any[], name: string | any[]) {
    if (this.service && !globMatch(this.service, service)) {
      return false;
    }

    if (this.name && !globMatch(this.name, name)) {
      return false;
    }

    return true;
  }

  sample() {
    if (!this._sampler.isSampled()) {
      return false;
    }

    if (this._limiter) {
      return this._limiter.isAllowed();
    }

    return true;
  }
}

class SpanSampler {
  private _rules: SpanSamplingRule[];
  constructor({ spanSamplingRules = [] } = {}) {
    this._rules = spanSamplingRules.map(SpanSamplingRule.from);
  }

  findRule(service: string | any[], name: string | any[]) {
    for (const rule of this._rules) {
      if (rule.match(service, name)) {
        return rule;
      }
    }
  }

  sample(spanContext: { _sampling: { priority: any }; _trace: { started: any } }) {
    const decision = spanContext._sampling.priority;
    if (decision === USER_KEEP || decision === AUTO_KEEP) return;

    const { started } = spanContext._trace;
    for (const span of started) {
      const context = span.context();
      const tags = context._tags || {};
      const name = context._name;
      const service = tags.service ||
        tags['service.name'] ||
        span.tracer()._service;

      const rule = this.findRule(service, name);
      if (rule && rule.sample()) {
        span.context()._spanSampling = {
          sampleRate: rule.sampleRate,
          maxPerSecond: rule.maxPerSecond,
        };
      }
    }
  }
}

export default SpanSampler;
