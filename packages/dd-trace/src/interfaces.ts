import { type Span as OTSpan } from 'https://esm.sh/opentracing@0.14.7/lib/span.d.ts';
import { type SpanContext as OTSpanContext } from 'https://esm.sh/opentracing@0.14.7/lib/span_context.d.ts';
import {
  type SpanOptions as OTSpanOptions,
  type Tracer as OTTracer,
} from 'https://esm.sh/opentracing@0.14.7/lib/tracer.d.ts';
import { type LookupFunction } from 'node:net';

// TODO(danilo-valente): placeholder type-guard for stores
export type IStore = any;

export type SpanOptions = OTSpanOptions;

export interface ITracerProvider {
  /**
   * Returns a Tracer, creating one if one with the given name and version is
   * not already created.
   *
   * This function may return different Tracer types (e.g.
   * {@link NoopTracerProvider} vs. a functional tracer).
   *
   * @param name The name of the tracer or instrumentation library.
   * @param version The version of the tracer or instrumentation library.
   * @param options The options of the tracer or instrumentation library.
   * @returns Tracer A Tracer with the given name and version
   */
  getTracer(name: string, version?: string, options?: TracerOptions): ITracer;
}

/**
 * Tracer is the entry-point of the Datadog tracing implementation.
 */
export interface ITracer extends OTTracer {
  /**
   * Starts and returns a new Span representing a logical unit of work.
   * @param {string} name The name of the operation.
   * @param {SpanOptions} [options] Options for the newly created span.
   * @returns {ISpan} A new Span object.
   */
  startSpan(name: string, options?: SpanOptions): ISpan;

  /**
   * Injects the given SpanContext instance for cross-process propagation
   * within `carrier`
   * @param  {ISpanContext} spanContext The SpanContext to inject into the
   *         carrier object. As a convenience, a Span instance may be passed
   *         in instead (in which case its .context() is used for the
   *         inject()).
   * @param  {string} format The format of the carrier.
   * @param  {object} carrier The carrier object.
   */
  inject(spanContext: ISpanContext | ISpan, format: string, carrier: object): void;

  /**
   * Returns a SpanContext instance extracted from `carrier` in the given
   * `format`.
   * @param  {string} format The format of the carrier.
   * @param  {object} carrier The carrier object.
   * @return {ISpanContext}
   *         The extracted SpanContext, or null if no such SpanContext could
   *         be found in `carrier`
   */
  extract(format: string, carrier: object): ISpanContext | null;

  /**
   * Initializes the tracer. This should be called before importing other libraries.
   */
  init(options?: TracerOptions): this | Promise<this>;

  /**
   * Sets the URL for the trace agent. This should only be called _after_
   * init() is called, only in cases where the URL needs to be set after
   * initialization.
   */
  setUrl(url: string): this;

  /**
   * Enable and optionally configure a plugin.
   * @param plugin The name of a built-in plugin.
   * @param config Configuration options. Can also be `false` to disable the plugin.
   */
  use(plugin: string, config?: object | boolean): this;

  /**
   * Returns a reference to the current scope.
   */
  scope(): IScope;

  /**
   * Instruments a function by automatically creating a span activated on its
   * scope.
   *
   * The span will automatically be finished when one of these conditions is
   * met:
   *
   * * The function returns a promise, in which case the span will finish when
   * the promise is resolved or rejected.
   * * The function takes a callback as its second parameter, in which case the
   * span will finish when that callback is called.
   * * The function doesn't accept a callback and doesn't return a promise, in
   * which case the span will finish at the end of the function execution.
   *
   * If the `orphanable` option is set to false, the function will not be traced
   * unless there is already an active span or `childOf` option. Note that this
   * option is deprecated and has been removed in version 4.0.
   */
  trace<T>(name: string, fn: (span?: ISpan, fn?: (error?: Error) => any) => T): T;
  trace<T>(
    name: string,
    options: TraceOptions & SpanOptions,
    fn: (span?: ISpan, done?: (error?: Error) => string) => T,
  ): T;

  /**
   * Wrap a function to automatically create a span activated on its
   * scope when it's called.
   *
   * The span will automatically be finished when one of these conditions is
   * met:
   *
   * * The function returns a promise, in which case the span will finish when
   * the promise is resolved or rejected.
   * * The function takes a callback as its last parameter, in which case the
   * span will finish when that callback is called.
   * * The function doesn't accept a callback and doesn't return a promise, in
   * which case the span will finish at the end of the function execution.
   */
  wrap<T = (...args: any[]) => any>(name: string, fn: T): T;
  wrap<T = (...args: any[]) => any>(name: string, options: TraceOptions & SpanOptions, fn: T): T;
  wrap<T = (...args: any[]) => any>(name: string, options: (...args: any[]) => TraceOptions & SpanOptions, fn: T): T;

  /**
   * Create and return a string that can be included in the <head> of a
   * document to enable RUM tracing to include it. The resulting string
   * should not be cached.
   */
  getRumData(): string;

  /**
   * Links an authenticated user to the current trace.
   * @param {User} user Properties of the authenticated user. Accepts custom fields.
   * @returns {ITracer} The Tracer instance for chaining.
   */
  setUser(user: User): this;

  appsec: IAppsec;

  TracerProvider: ITracerProvider;

  dogstatsd: IDogStatsD;
}

export interface TraceOptions extends Analyzable {
  /**
   * The resource you are tracing. The resource name must not be longer than
   * 5000 characters.
   */
  resource?: string;

  /**
   * The service you are tracing. The service name must not be longer than
   * 100 characters.
   */
  service?: string;

  /**
   * The type of request.
   */
  type?: string;
}

/**
 * Span represents a logical unit of work as part of a broader Trace.
 * Examples of span might include remote procedure calls or a in-process
 * function calls to sub-components. A Trace has a single, top-level "root"
 * Span that in turn may have zero or more child Spans, which in turn may
 * have children.
 */
export interface ISpan extends OTSpan {
  _context(): ISpanContext;
}

/**
 * SpanContext represents Span state that must propagate to descendant Spans
 * and across process boundaries.
 *
 * SpanContext is logically divided into two pieces: the user-level "Baggage"
 * (see setBaggageItem and getBaggageItem) that propagates across Span
 * boundaries and any Tracer-implementation-specific fields that are needed to
 * identify or otherwise contextualize the associated Span instance (e.g., a
 * <trace_id, span_id, sampled> tuple).
 */
export interface ISpanContext extends OTSpanContext {
  /**
   * Returns the string representation of the internal trace ID.
   */
  toTraceId(): string;

  /**
   * Returns the string representation of the internal span ID.
   */
  toSpanId(): string;

  /**
   * Returns the string representation used for DBM integration.
   */
  toTraceparent(): string;
}

/**
 * Sampling rule to configure on the priority sampler.
 */
export interface SamplingRule {
  /**
   * Sampling rate for this rule.
   */
  sampleRate: number;

  /**
   * Service on which to apply this rule. The rule will apply to all services if not provided.
   */
  service?: string | RegExp;

  /**
   * Operation name on which to apply this rule. The rule will apply to all operation names if not provided.
   */
  name?: string | RegExp;
}

/**
 * Span sampling rules to ingest single spans where the enclosing trace is dropped
 */
export interface SpanSamplingRule {
  /**
   * Sampling rate for this rule. Will default to 1.0 (always) if not provided.
   */
  sampleRate?: number;

  /**
   * Maximum number of spans matching a span sampling rule to be allowed per second.
   */
  maxPerSecond?: number;

  /**
   * Service name or pattern on which to apply this rule. The rule will apply to all services if not provided.
   */
  service?: string;

  /**
   * Operation name or pattern on which to apply this rule. The rule will apply to all operation names if not provided.
   */
  name?: string;
}

/**
 * Selection and priority order of context propagation injection and extraction mechanisms.
 */
export interface PropagationStyle {
  /**
   * Selection of context propagation injection mechanisms.
   */
  inject: string[];

  /**
   * Selection and priority order of context propagation extraction mechanisms.
   */
  extract: string[];
}

/**
 * List of options available to the tracer.
 */
export interface TracerOptions {
  /**
   * Whether to enable trace ID injection in log records to be able to correlate
   * traces with logs.
   * @default false
   */
  logInjection?: boolean;

  /**
   * Whether to enable startup logs.
   * @default true
   */
  startupLogs?: boolean;

  /**
   * The service name to be used for this program. If not set, the service name
   * will attempted to be inferred from package.json
   */
  service?: string;

  /**
   * Provide service name mappings for each plugin.
   */
  serviceMapping?: { [key: string]: string };

  /**
   * The url of the trace agent that the tracer will submit to.
   * Takes priority over hostname and port, if set.
   */
  url?: string;

  /**
   * The address of the trace agent that the tracer will submit to.
   * @default 'localhost'
   */
  hostname?: string;

  /**
   * The port of the trace agent that the tracer will submit to.
   * @default 8126
   */
  port?: number | string;

  /**
   * Whether to enable profiling.
   */
  profiling?: boolean;

  /**
   * Options specific for the Dogstatsd agent.
   */
  dogstatsd?: {
    /**
     * The hostname of the Dogstatsd agent that the metrics will submitted to.
     */
    hostname?: string;

    /**
     * The port of the Dogstatsd agent that the metrics will submitted to.
     * @default 8125
     */
    port?: number;
  };

  /**
   * Set an application’s environment e.g. prod, pre-prod, stage.
   */
  env?: string;

  /**
   * The version number of the application. If not set, the version
   * will attempted to be inferred from package.json.
   */
  version?: string;

  /**
   * Controls the ingestion sample rate (between 0 and 1) between the agent and the backend.
   */
  sampleRate?: number;

  /**
   * Global rate limit that is applied on the global sample rate and all rules,
   * and controls the ingestion rate limit between the agent and the backend.
   * Defaults to deferring the decision to the agent.
   */
  rateLimit?: number;

  /**
   * Sampling rules to apply to priority samplin. Each rule is a JSON,
   * consisting of `service` and `name`, which are regexes to match against
   * a trace's `service` and `name`, and a corresponding `sampleRate`. If not
   * specified, will defer to global sampling rate for all spans.
   * @default []
   */
  samplingRules?: SamplingRule[];

  /**
   * Span sampling rules that take effect when the enclosing trace is dropped, to ingest single spans
   * @default []
   */
  spanSamplingRules?: SpanSamplingRule[];

  /**
   * Interval in milliseconds at which the tracer will submit traces to the agent.
   * @default 2000
   */
  flushInterval?: number;

  /**
   *  Number of spans before partially exporting a trace. This prevents keeping all the spans in memory for very large traces.
   * @default 1000
   */
  flushMinSpans?: number;

  /**
   * Whether to enable runtime metrics.
   * @default false
   */
  runtimeMetrics?: boolean;

  /**
   * Custom function for DNS lookups when sending requests to the agent.
   * @default dns.lookup()
   */
  lookup?: LookupFunction;

  /**
   * Protocol version to use for requests to the agent. The version configured must be supported by the agent version installed or all traces will be dropped.
   * @default 0.4
   */
  protocolVersion?: string;

  /**
   * Deprecated in favor of the global versions of the variables provided under this option
   *
   * @deprecated
   * @hidden
   */
  ingestion?: {
    /**
     * Controls the ingestion sample rate (between 0 and 1) between the agent and the backend.
     */
    sampleRate?: number;

    /**
     * Controls the ingestion rate limit between the agent and the backend. Defaults to deferring the decision to the agent.
     */
    rateLimit?: number;
  };

  /**
   * Experimental features can be enabled individually using key / value pairs.
   * @default {}
   */
  experimental?: {
    b3?: boolean;
    traceparent?: boolean;

    /**
     * Whether to add an auto-generated `runtime-id` tag to metrics.
     * @default false
     */
    runtimeId?: boolean;

    /**
     * Whether to write traces to log output or agentless, rather than send to an agent
     * @default false
     */
    exporter?: 'log' | 'agent' | 'datadog';

    /**
     * Whether to enable the experimental `getRumData` method.
     * @default false
     */
    enableGetRumData?: boolean;

    /**
     * Configuration of the IAST. Can be a boolean as an alias to `iast.enabled`.
     */
    iast?: boolean | {
      /**
       * Whether to enable IAST.
       * @default false
       */
      enabled?: boolean;
      /**
       * Controls the percentage of requests that iast will analyze
       * @default 30
       */
      requestSampling?: number;
      /**
       * Controls how many request can be analyzing code vulnerabilities at the same time
       * @default 2
       */
      maxConcurrentRequests?: number;
      /**
       * Controls how many code vulnerabilities can be detected in the same request
       * @default 2
       */
      maxContextOperations?: number;
      /**
       * Whether to enable vulnerability deduplication
       */
      deduplicationEnabled?: boolean;
      /**
       * Whether to enable vulnerability redaction
       * @default true
       */
      redactionEnabled?: boolean;
    };
  };

  /**
   * Whether to load all built-in plugins.
   * @default true
   */
  plugins?: boolean;

  /**
   * Custom logger to be used by the tracer (if debug = true),
   * should support error(), warn(), info(), and debug() methods
   * see https://datadog.github.io/dd-trace-js/#custom-logging
   */
  logger?: {
    error: (err: Error | string) => void;
    warn: (message: string) => void;
    info: (message: string) => void;
    debug: (message: string) => void;
  };

  /**
   * Global tags that should be assigned to every span.
   */
  tags?: { [key: string]: any };

  /**
   * Specifies which scope implementation to use. The default is to use the best
   * implementation for the runtime. Only change this if you know what you are
   * doing.
   */
  scope?: 'async_hooks' | 'async_local_storage' | 'async_resource' | 'sync' | 'noop';

  /**
   * Whether to report the hostname of the service host. This is used when the agent is deployed on a different host and cannot determine the hostname automatically.
   * @default false
   */
  reportHostname?: boolean;

  /**
   * A string representing the minimum tracer log level to use when debug logging is enabled
   * @default 'debug'
   */
  logLevel?: 'error' | 'debug';

  /**
   * If false, require a parent in order to trace.
   * @default true
   * @deprecated since version 4.0
   */
  orphanable?: boolean;

  /**
   * Enables DBM to APM link using tag injection.
   * @default 'disabled'
   */
  dbmPropagationMode?: 'disabled' | 'service' | 'full';

  /**
   * Configuration of the AppSec protection. Can be a boolean as an alias to `appsec.enabled`.
   */
  appsec?: boolean | {
    /**
     * Whether to enable AppSec.
     * @default false
     */
    enabled?: boolean;

    /**
     * Specifies a path to a custom rules file.
     */
    rules?: string;

    /**
     * Controls the maximum amount of traces sampled by AppSec attacks, per second.
     * @default 100
     */
    rateLimit?: number;

    /**
     * Controls the maximum amount of time in microseconds the WAF is allowed to run synchronously for.
     * @default 5000
     */
    wafTimeout?: number;

    /**
     * Specifies a regex that will redact sensitive data by its key in attack reports.
     */
    obfuscatorKeyRegex?: string;

    /**
     * Specifies a regex that will redact sensitive data by its value in attack reports.
     */
    obfuscatorValueRegex?: string;

    /**
     * Specifies a path to a custom blocking template html file.
     */
    blockedTemplateHtml?: string;

    /**
     * Specifies a path to a custom blocking template json file.
     */
    blockedTemplateJson?: string;

    /**
     * Controls the automated user event tracking configuration
     */
    eventTracking?: {
      /**
       * Controls the automated user event tracking mode. Possible values are disabled, safe and extended.
       * On safe mode, any detected Personally Identifiable Information (PII) about the user will be redacted from the event.
       * On extended mode, no redaction will take place.
       * @default 'safe'
       */
      mode?: 'safe' | 'extended' | 'disabled';
    };
  };

  /**
   * Configuration of ASM Remote Configuration
   */
  remoteConfig?: {
    /**
     * Specifies the remote configuration polling interval in seconds
     * @default 5
     */
    pollInterval?: number;
  };

  /**
   * Whether to enable client IP collection from relevant IP headers
   * @default false
   */
  clientIpEnabled?: boolean;

  /**
   * Custom header name to source the http.client_ip tag from.
   */
  clientIpHeader?: string;

  /**
   * The selection and priority order of context propagation injection and extraction mechanisms.
   */
  propagationStyle?: string[] | PropagationStyle;
}

/**
 * User object that can be passed to `tracer.setUser()`.
 */
export interface User {
  /**
   * Unique identifier of the user.
   * Mandatory.
   */
  id: string;

  /**
   * Email of the user.
   */
  email?: string;

  /**
   * User-friendly name of the user.
   */
  name?: string;

  /**
   * Session ID of the user.
   */
  session_id?: string;

  /**
   * Role the user is making the request under.
   */
  role?: string;

  /**
   * Scopes or granted authorizations the user currently possesses.
   * The value could come from the scope associated with an OAuth2
   * Access Token or an attribute value in a SAML 2 Assertion.
   */
  scope?: string;

  /**
   * Custom fields to attach to the user (RBAC, Oauth, etc…).
   */
  [key: string]: string | undefined;
}

export type IDogStatsDTags = string[];

export interface IDogStatsD {
  /**
   * Increments a metric by the specified value, optionally specifying tags.
   * @param {string} stat The dot-separated metric name.
   * @param {number} value The amount to increment the stat by.
   * @param {[tag:string]:string|number} tags Tags to pass along, such as `{ foo: 'bar' }`. Values are combined with config.tags.
   */
  increment(stat: string, value?: number, tags?: IDogStatsDTags): void;

  /**
   * Decrements a metric by the specified value, optionally specifying tags.
   * @param {string} stat The dot-separated metric name.
   * @param {number} value The amount to decrement the stat by.
   * @param {[tag:string]:string|number} tags Tags to pass along, such as `{ foo: 'bar' }`. Values are combined with config.tags.
   */
  decrement(stat: string, value?: number, tags?: IDogStatsDTags): void;

  /**
   * Sets a distribution value, optionally specifying tags.
   * @param {string} stat The dot-separated metric name.
   * @param {number} value The amount to increment the stat by.
   * @param {[tag:string]:string|number} tags Tags to pass along, such as `{ foo: 'bar' }`. Values are combined with config.tags.
   */
  distribution(stat: string, value?: number, tags?: IDogStatsDTags): void;

  /**
   * Sets a gauge value, optionally specifying tags.
   * @param {string} stat The dot-separated metric name.
   * @param {number} value The amount to increment the stat by.
   * @param {[tag:string]:string|number} tags Tags to pass along, such as `{ foo: 'bar' }`. Values are combined with config.tags.
   */
  gauge(stat: string, value?: number, tags?: IDogStatsDTags): void;

  /**
   * Forces any unsent metrics to be sent
   *
   * @beta This method is experimental and could be removed in future versions.
   */
  flush(): void;
}

export type IAppsecMetadata = { [key: string]: string };

export interface IAppsec {
  /**
   * Links a successful login event to the current trace. Will link the passed user to the current trace with IAppsec.setUser() internally.
   * @param {User} user Properties of the authenticated user. Accepts custom fields.
   * @param {[key: string]: string} metadata Custom fields to link to the login success event.
   *
   * @beta This method is in beta and could change in future versions.
   */
  trackUserLoginSuccessEvent(user: User, metadata?: IAppsecMetadata): void;

  /**
   * Links a failed login event to the current trace.
   * @param {string} userId The user id of the attemped login.
   * @param {boolean} exists If the user id exists.
   * @param {[key: string]: string} metadata Custom fields to link to the login failure event.
   *
   * @beta This method is in beta and could change in future versions.
   */
  trackUserLoginFailureEvent(userId: string, exists: boolean, metadata?: IAppsecMetadata): void;

  /**
   * Links a custom event to the current trace.
   * @param {string} eventName The name of the event.
   * @param {[key: string]: string} metadata Custom fields to link to the event.
   *
   * @beta This method is in beta and could change in future versions.
   */
  trackCustomEvent(eventName: string, metadata?: IAppsecMetadata): void;

  /**
   * Checks if the passed user should be blocked according to AppSec rules.
   * If no user is linked to the current trace, will link the passed user to it.
   * @param {User} user Properties of the authenticated user. Accepts custom fields.
   * @return {boolean} Indicates whether the user should be blocked.
   *
   * @beta This method is in beta and could change in the future
   */
  isUserBlocked(user: User): boolean;

  /**
   * Sends a "blocked" template response based on the request accept header and ends the response.
   * **You should stop processing the request after calling this function!**
   * @param {Request} req Can be passed to force which request to act on. Optional.
   * @param {Response} res Can be passed to force which response to act on. Optional.
   * @return {boolean} Indicates if the action was successful.
   *
   * @beta This method is in beta and could change in the future
   */
  blockRequest(req?: Request): Response | null;

  /**
   * Links an authenticated user to the current trace.
   * @param {User} user Properties of the authenticated user. Accepts custom fields.
   *
   * @beta This method is in beta and could change in the future
   */
  setUser(user: User): void;
}

/**
 * The Datadog Scope Manager. This is used for context propagation.
 */
export interface IScope {
  /**
   * Get the current active span or null if there is none.
   *
   * @returns {ISpan} The active span.
   */
  active(): ISpan | null;

  /**
   * Activate a span in the scope of a function.
   *
   * @param {ISpan} span The span to activate.
   * @param {Function} fn Function that will have the span activated on its scope.
   * @returns The return value of the provided function.
   */
  activate<T>(span: ISpan, fn: (...args: any[]) => T): T;

  /**
   * Binds a target to the provided span, or the active span if omitted.
   *
   * @param {Function|Promise} target Target that will have the span activated on its scope.
   * @param {ISpan} [span=scope.active()] The span to activate.
   * @returns The bound target.
   */
  bind<T extends (...args: any[]) => void>(fn: T, span?: ISpan | null): T;
  bind<V, T extends (...args: any[]) => V>(fn: T, span?: ISpan | null): T;
  bind<T>(fn: Promise<T>, span?: ISpan | null): Promise<T>;
}

/** @hidden */
interface Analyzable {
  /**
   * Whether to measure the span. Can also be set to a key-value pair with span
   * names as keys and booleans as values for more granular control.
   */
  measured?: boolean | { [key: string]: boolean };
}
