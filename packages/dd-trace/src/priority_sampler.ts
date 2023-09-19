import RateLimiter from './rate_limiter.ts';
import Sampler from './sampler.ts';
import * as ext from 'npm:dd-trace/ext/index.js';
import { setSamplingRules } from './startup-log.ts';

import {
  DECISION_MAKER_KEY,
  SAMPLING_AGENT_DECISION,
  SAMPLING_LIMIT_DECISION,
  SAMPLING_MECHANISM_AGENT,
  SAMPLING_MECHANISM_DEFAULT,
  SAMPLING_MECHANISM_MANUAL,
  SAMPLING_MECHANISM_RULE,
  SAMPLING_RULE_DECISION,
} from './constants.ts';

const SERVICE_NAME = ext.tags.SERVICE_NAME;
const SAMPLING_PRIORITY = ext.tags.SAMPLING_PRIORITY;
const MANUAL_KEEP = ext.tags.MANUAL_KEEP;
const MANUAL_DROP = ext.tags.MANUAL_DROP;
const USER_REJECT = ext.priority.USER_REJECT;
const AUTO_REJECT = ext.priority.AUTO_REJECT;
const AUTO_KEEP = ext.priority.AUTO_KEEP;
const USER_KEEP = ext.priority.USER_KEEP;
const DEFAULT_KEY = 'service:,env:';

const defaultSampler = new Sampler(AUTO_KEEP);

class PrioritySampler {
  private _env: any;
  private _rules: any;
  private _limiter: any;
  private _samplers: {};
  constructor(env, config: { sampleRate: any; rateLimit?: number; rules?: any[] }) {
    this.configure(env, config);
    this.update({});
  }

  configure(env, { sampleRate, rateLimit = 100, rules = [] } = {}) {
    this._env = env;
    this._rules = this._normalizeRules(rules, sampleRate);
    this._limiter = new RateLimiter(rateLimit);

    setSamplingRules(this._rules);
  }

  isSampled(span: { context: () => any }) {
    const priority = this._getPriorityFromAuto(span);
    return priority === USER_KEEP || priority === AUTO_KEEP;
  }

  sample(span: { context: (() => any) | (() => any) }, auto = true) {
    if (!span) return;

    const context = this._getContext(span);
    const root = context._trace.started[0];

    // TODO: remove the decision maker tag when priority is less than AUTO_KEEP
    if (context._sampling.priority !== undefined) return;
    if (!root) return; // noop span

    const tag = this._getPriorityFromTags(context._tags);

    if (this.validate(tag)) {
      context._sampling.priority = tag;
      context._sampling.mechanism = SAMPLING_MECHANISM_MANUAL;
    } else if (auto) {
      context._sampling.priority = this._getPriorityFromAuto(root);
    } else {
      return;
    }

    this._addDecisionMaker(root);
  }

  update(rates: { [x: string]: any }) {
    const samplers = {};

    for (const key in rates) {
      const rate = rates[key];
      const sampler = new Sampler(rate);

      samplers[key] = sampler;
    }

    samplers[DEFAULT_KEY] = samplers[DEFAULT_KEY] || defaultSampler;

    this._samplers = samplers;
  }

  validate(samplingPriority) {
    switch (samplingPriority) {
      case USER_REJECT:
      case USER_KEEP:
      case AUTO_REJECT:
      case AUTO_KEEP:
        return true;
      default:
        return false;
    }
  }

  _getContext(span: { context: () => any }) {
    return typeof span.context === 'function' ? span.context() : span;
  }

  _getPriorityFromAuto(span: { context: () => any }) {
    const context = this._getContext(span);
    const rule = this._findRule(context);

    return rule ? this._getPriorityByRule(context, rule) : this._getPriorityByAgent(context);
  }

  _getPriorityFromTags(tags: { [x: string]: string }) {
    if (hasOwn(tags, MANUAL_KEEP) && tags[MANUAL_KEEP] !== false) {
      return USER_KEEP;
    } else if (hasOwn(tags, MANUAL_DROP) && tags[MANUAL_DROP] !== false) {
      return USER_REJECT;
    } else {
      const priority = parseInt(tags[SAMPLING_PRIORITY], 10);

      if (priority === 1 || priority === 2) {
        return USER_KEEP;
      } else if (priority === 0 || priority === -1) {
        return USER_REJECT;
      }
    }
  }

  _getPriorityByRule(
    context: { _trace: { [x: string]: any }; _sampling: { mechanism: any } },
    rule: { sampleRate: any; sampler: { isSampled: (arg0: any) => any } },
  ) {
    context._trace[SAMPLING_RULE_DECISION] = rule.sampleRate;
    context._sampling.mechanism = SAMPLING_MECHANISM_RULE;

    return rule.sampler.isSampled(context) && this._isSampledByRateLimit(context) ? USER_KEEP : USER_REJECT;
  }

  _isSampledByRateLimit(context: { _trace: { [x: string]: any } }) {
    const allowed = this._limiter.isAllowed();

    context._trace[SAMPLING_LIMIT_DECISION] = this._limiter.effectiveRate();

    return allowed;
  }

  _getPriorityByAgent(
    context: { _tags: { [x: string]: any }; _trace: { [x: string]: any }; _sampling: { mechanism: any } },
  ) {
    const key = `service:${context._tags[SERVICE_NAME]},env:${this._env}`;
    const sampler = this._samplers[key] || this._samplers[DEFAULT_KEY];

    context._trace[SAMPLING_AGENT_DECISION] = sampler.rate();

    if (sampler === defaultSampler) {
      context._sampling.mechanism = SAMPLING_MECHANISM_DEFAULT;
    } else {
      context._sampling.mechanism = SAMPLING_MECHANISM_AGENT;
    }

    return sampler.isSampled(context) ? AUTO_KEEP : AUTO_REJECT;
  }

  _addDecisionMaker(span: { context: () => any }) {
    const context = span.context();
    const trace = context._trace;
    const priority = context._sampling.priority;
    const mechanism = context._sampling.mechanism;

    if (priority >= AUTO_KEEP) {
      if (!trace.tags[DECISION_MAKER_KEY]) {
        trace.tags[DECISION_MAKER_KEY] = `-${mechanism}`;
      }
    } else {
      delete trace.tags[DECISION_MAKER_KEY];
    }
  }

  _normalizeRules(rules: any[], sampleRate) {
    rules = [].concat(rules || []);

    return rules
      .concat({ sampleRate })
      .map((rule: { sampleRate: string }) => ({ ...rule, sampleRate: parseFloat(rule.sampleRate) }))
      .filter((rule: { sampleRate: number }) => !isNaN(rule.sampleRate))
      .map((rule: { sampleRate: any }) => ({ ...rule, sampler: new Sampler(rule.sampleRate) }));
  }

  _findRule(context: { _name: any; _tags: { [x: string]: any } }) {
    for (let i = 0, l = this._rules.length; i < l; i++) {
      if (this._matchRule(context, this._rules[i])) return this._rules[i];
    }
  }

  _matchRule(
    context: { _name: any; _tags: { [x: string]: any } },
    rule: { name: { test: (arg0: any) => any }; service: { test: (arg0: any) => any } },
  ) {
    const name = context._name;
    const service = context._tags['service.name'];

    if (rule.name instanceof RegExp && !rule.name.test(name)) return false;
    if (typeof rule.name === 'string' && rule.name !== name) return false;
    if (rule.service instanceof RegExp && !rule.service.test(service)) return false;
    if (typeof rule.service === 'string' && rule.service !== service) return false;

    return true;
  }
}

function hasOwn(object, prop: string) {
  return Object.prototype.hasOwnProperty.call(object, prop);
}

export default PrioritySampler;
