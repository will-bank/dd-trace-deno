import { existsSync } from 'https://deno.land/std@0.204.0/fs/exists.ts';
import log from './log/index.ts';
import * as tagger from './tagger.ts';
import { isFalse, isTrue } from './util.ts';
import { GIT_COMMIT_SHA, GIT_REPOSITORY_URL } from './plugins/util/tags.ts';
import { getGitMetadataFromGitProperties } from './git_properties.ts';
import { updateConfig } from './telemetry/index.ts';
import { getIsAzureFunctionConsumptionPlan, getIsGCPFunction } from './serverless.ts';
import recommendedJson from './appsec/recommended.json' assert { type: 'json' };

const coalesce = (...values: unknown[]) => values.find(value =>
  value !== undefined && value !== null && value !== Number.NaN
);

const fromEntries = Object.fromEntries ||
  ((entries: any[]) => entries.reduce((obj, [k, v]) => Object.assign(obj, { [k]: v }), {}));

// eslint-disable-next-line max-len
const qsRegex =
  '(?:p(?:ass)?w(?:or)?d|pass(?:_?phrase)?|secret|(?:api_?|private_?|public_?|access_?|secret_?)key(?:_?id)?|token|consumer_?(?:id|key|secret)|sign(?:ed|ature)?|auth(?:entication|orization)?)(?:(?:\\s|%20)*(?:=|%3D)[^&]+|(?:"|%22)(?:\\s|%20)*(?::|%3A)(?:\\s|%20)*(?:"|%22)(?:%2[^2]|%[^2]|[^"%])+(?:"|%22))|bearer(?:\\s|%20)+[a-z0-9\\._\\-]+|token(?::|%3A)[a-z0-9]{13}|gh[opsu]_[0-9a-zA-Z]{36}|ey[I-L](?:[\\w=-]|%3D)+\\.ey[I-L](?:[\\w=-]|%3D)+(?:\\.(?:[\\w.+\\/=-]|%3D|%2F|%2B)+)?|[\\-]{5}BEGIN(?:[a-z\\s]|%20)+PRIVATE(?:\\s|%20)KEY[\\-]{5}[^\\-]+[\\-]{5}END(?:[a-z\\s]|%20)+PRIVATE(?:\\s|%20)KEY|ssh-rsa(?:\\s|%20)*(?:[a-z0-9\\/\\.+]|%2F|%5C|%2B){100,}';

function maybeFile(filepath) {
  if (!filepath) return;
  try {
    return Deno.readTextFileSync(filepath);
  } catch (e) {
    log.error(e);
    return undefined;
  }
}

function safeJsonParse(input: string) {
  try {
    return JSON.parse(input);
  } catch (err) {
    return undefined;
  }
}

const namingVersions = ['v0', 'v1'];
const defaultNamingVersion = 'v0';

function validateNamingVersion(versionString) {
  if (!versionString) {
    return defaultNamingVersion;
  }
  if (!namingVersions.includes(versionString)) {
    log.warn(
      `Unexpected input for config.spanAttributeSchema, picked default ${defaultNamingVersion}`,
    );
    return defaultNamingVersion;
  }
  return versionString;
}

// Shallow clone with property name remapping
function remapify(input, mappings: { [x: string]: any; sample_rate?: string; max_per_second?: string }) {
  if (!input) return;
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    output[key in mappings ? mappings[key] : key] = value;
  }
  return output;
}

function propagationStyle(key: string, option: any[], defaultValue: string[]) {
  // Extract by key if in object-form value
  if (typeof option === 'object' && !Array.isArray(option)) {
    option = option[key];
  }

  // Should be an array at this point
  if (Array.isArray(option)) return option.map((v) => v.toLowerCase());

  // If it's not an array but not undefined there's something wrong with the input
  if (typeof option !== 'undefined') {
    log.warn('Unexpected input for config.tracePropagationStyle');
  }

  // Otherwise, fallback to env var parsing
  const envKey = `DD_TRACE_PROPAGATION_STYLE_${key.toUpperCase()}`;
  const envVar = coalesce(Deno.env.get(envKey), Deno.env.get('DD_TRACE_PROPAGATION_STYLE'));
  if (typeof envVar !== 'undefined') {
    return envVar.split(',')
      .filter((v: string) => v !== '')
      .map((v: string) => v.trim().toLowerCase());
  }

  return defaultValue;
}

export default class Config {
  debug: boolean;
  logger: any;
  logLevel: any;
  tags: {};
  tracing: boolean;
  dbmPropagationMode: any;
  dsmEnabled: boolean;
  openAiLogsEnabled: any;
  apiKey?: string;
  env?: string;
  url: URL;
  site?: string;
  hostname?: string;
  port: string;
  flushInterval: any;
  flushMinSpans: any;
  queryStringObfuscation: any;
  clientIpEnabled: any;
  clientIpHeader: any;
  plugins: boolean;
  service?: string;
  serviceMapping: any;
  version?: string;
  dogstatsd: { hostname: string; port: number };
  runtimeMetrics: boolean;
  tracePropagationStyle: { inject: any; extract: any };
  experimental: { runtimeId: boolean; exporter: any; enableGetRumData: boolean };
  sampler: { rateLimit: any; rules: any; spanSamplingRules: any };
  reportHostname: boolean;
  scope: any;
  profiling: { enabled: boolean; sourceMap: boolean; exporters: any };
  spanAttributeSchema: any;
  spanComputePeerService: boolean;
  spanRemoveIntegrationFromService: any;
  peerServiceMapping: any;
  lookup: any;
  startupLogs: boolean;
  telemetry: { enabled: boolean; heartbeatInterval: number; logCollection: boolean; debug: boolean; metrics: boolean };
  protocolVersion: any;
  tagsHeaderMaxLength: number;
  appsec: {
    enabled: any;
    rules: any;
    customRulesProvided: boolean;
    rateLimit: any;
    wafTimeout: any;
    obfuscatorKeyRegex: any;
    obfuscatorValueRegex: any;
    blockedTemplateHtml: any;
    blockedTemplateJson: any;
    eventTracking: { enabled: any; mode: any };
  };
  remoteConfig: { enabled: any; pollInterval: any };
  iast: {
    enabled: boolean;
    requestSampling: any;
    maxConcurrentRequests: any;
    maxContextOperations: any;
    deduplicationEnabled: any;
    redactionEnabled: any;
    telemetryVerbosity: any;
  };
  isCiVisibility: boolean;
  isIntelligentTestRunnerEnabled: boolean;
  isGitUploadEnabled: boolean;
  gitMetadataEnabled: boolean;
  isManualApiEnabled: boolean;
  openaiSpanCharLimit: number;
  repositoryUrl: any;
  commitSHA: any;
  stats: { enabled: boolean };
  traceId128BitGenerationEnabled: boolean;
  traceId128BitLoggingEnabled: boolean;
  isGCPFunction: boolean;
  isAzureFunctionConsumptionPlan: boolean;
  private _defaults: {};
  private _env: {};
  private _options: any;
  private _remote: any;
  sampleRate: any;
  constructor(
    options: {
      logger?: any;
      logLevel?: any;
      tags?: any;
      profiling?: any;
      runtimeMetrics?: any;
      dbmPropagationMode?: any;
      dsmEnabled?: any;
      hostname?: any;
      port?: any;
      url?: any;
      isCiVisibility?: any;
      service?: any;
      serviceMapping?: any;
      env?: any;
      version?: any;
      startupLogs?: any;
      openAiLogsEnabled?: any;
      protocolVersion?: any;
      flushMinSpans?: any;
      clientIpEnabled?: any;
      clientIpHeader?: any;
      experimental?: any;
      tracePropagationStyle?: any;
      spanAttributeSchema?: any;
      peerServiceMapping?: any;
      hasOwnProperty?: any;
      spanComputePeerService?: any;
      spanRemoveIntegrationFromService?: any;
      stats?: any;
      traceId128BitGenerationEnabled?: any;
      traceId128BitLoggingEnabled?: any;
      appsec?: any;
      remoteConfig?: any;
      ingestion?: any;
      dogstatsd?: { hostname?: string; port?: number };
      rateLimit?: any;
      samplingRules?: any;
      spanSamplingRules?: any;
      site?: any;
      flushInterval?: any;
      plugins?: any;
      reportHostname?: any;
      lookup?: any;
    },
  ) {
    options = options || {};

    // Configure the logger first so it can be used to warn about other configs
    this.debug = isTrue(coalesce(
      Deno.env.get('DD_TRACE_DEBUG'),
      false,
    ));
    this.logger = options.logger;
    this.logLevel = coalesce(
      options.logLevel,
      Deno.env.get('DD_TRACE_LOG_LEVEL'),
      'debug',
    );

    log.use(this.logger);
    log.toggle(this.debug, this.logLevel, this);

    this.tags = {};

    tagger.add(this.tags, Deno.env.get('DD_TAGS'));
    tagger.add(this.tags, Deno.env.get('DD_TRACE_TAGS'));
    tagger.add(this.tags, Deno.env.get('DD_TRACE_GLOBAL_TAGS'));
    tagger.add(this.tags, options.tags);

    const DD_TRACING_ENABLED = coalesce(
      Deno.env.get('DD_TRACING_ENABLED'),
      true,
    );
    const DD_PROFILING_ENABLED = coalesce(
      options.profiling, // TODO: remove when enabled by default
      Deno.env.get('DD_EXPERIMENTAL_PROFILING_ENABLED'),
      Deno.env.get('DD_PROFILING_ENABLED'),
      false,
    );
    const DD_PROFILING_EXPORTERS = coalesce(
      Deno.env.get('DD_PROFILING_EXPORTERS'),
      'agent',
    );
    const DD_PROFILING_SOURCE_MAP = Deno.env.get('DD_PROFILING_SOURCE_MAP');
    const DD_RUNTIME_METRICS_ENABLED = coalesce(
      options.runtimeMetrics, // TODO: remove when enabled by default
      Deno.env.get('DD_RUNTIME_METRICS_ENABLED'),
      false,
    );
    const DD_DBM_PROPAGATION_MODE = coalesce(
      options.dbmPropagationMode,
      Deno.env.get('DD_DBM_PROPAGATION_MODE'),
      'disabled',
    );
    const DD_DATA_STREAMS_ENABLED = coalesce(
      options.dsmEnabled,
      Deno.env.get('DD_DATA_STREAMS_ENABLED'),
      false,
    );
    const DD_AGENT_HOST = coalesce(
      options.hostname,
      Deno.env.get('DD_AGENT_HOST'),
      Deno.env.get('DD_TRACE_AGENT_HOSTNAME'),
      '127.0.0.1',
    );
    const DD_TRACE_AGENT_PORT = coalesce(
      options.port,
      Deno.env.get('DD_TRACE_AGENT_PORT'),
      '8126',
    );
    const DD_TRACE_AGENT_URL = coalesce(
      options.url,
      Deno.env.get('DD_TRACE_AGENT_URL'),
      Deno.env.get('DD_TRACE_URL'),
      null,
    );
    const DD_IS_CIVISIBILITY = coalesce(
      options.isCiVisibility,
      false,
    );
    const DD_CIVISIBILITY_AGENTLESS_URL = Deno.env.get('DD_CIVISIBILITY_AGENTLESS_URL');

    const DD_CIVISIBILITY_ITR_ENABLED = coalesce(
      Deno.env.get('DD_CIVISIBILITY_ITR_ENABLED'),
      true,
    );

    const DD_CIVISIBILITY_MANUAL_API_ENABLED = coalesce(
      Deno.env.get('DD_CIVISIBILITY_MANUAL_API_ENABLED'),
      false,
    );

    const DD_SERVICE = options.service ||
      Deno.env.get('DD_SERVICE') ||
      Deno.env.get('DD_SERVICE_NAME') ||
      this.tags.service ||
      Deno.env.get('AWS_LAMBDA_FUNCTION_NAME') ||
      Deno.env.get('FUNCTION_NAME') || // Google Cloud Function Name set by deprecated runtimes
      Deno.env.get('K_SERVICE') || // Google Cloud Function Name set by newer runtimes
      Deno.env.get('WEBSITE_SITE_NAME') || // set by Azure Functions
      Deno.mainModule;
    const DD_SERVICE_MAPPING = coalesce(
      options.serviceMapping,
      Deno.env.get('DD_SERVICE_MAPPING')
        ? fromEntries(
          Deno.env.get('DD_SERVICE_MAPPING').split(',').map((x: string) => x.trim().split(':')),
        )
        : {},
    );
    const DD_ENV = coalesce(
      options.env,
      Deno.env.get('DD_ENV'),
      this.tags.env,
    );
    const DD_VERSION = coalesce(
      options.version,
      Deno.env.get('DD_VERSION'),
      this.tags.version,
    );
    const DD_TRACE_STARTUP_LOGS = coalesce(
      options.startupLogs,
      Deno.env.get('DD_TRACE_STARTUP_LOGS'),
      false,
    );

    const DD_OPENAI_LOGS_ENABLED = coalesce(
      options.openAiLogsEnabled,
      Deno.env.get('DD_OPENAI_LOGS_ENABLED'),
      false,
    );

    const DD_API_KEY = coalesce(
      Deno.env.get('DATADOG_API_KEY'),
      Deno.env.get('DD_API_KEY'),
    );

    const inAWSLambda = Deno.env.get('AWS_LAMBDA_FUNCTION_NAME') !== undefined;

    const isGCPFunction = getIsGCPFunction();
    const isAzureFunctionConsumptionPlan = getIsAzureFunctionConsumptionPlan();

    const inServerlessEnvironment = inAWSLambda || isGCPFunction || isAzureFunctionConsumptionPlan;

    const DD_TRACE_TELEMETRY_ENABLED = coalesce(
      Deno.env.get('DD_TRACE_TELEMETRY_ENABLED'),
      !inServerlessEnvironment,
    );
    const DD_TELEMETRY_HEARTBEAT_INTERVAL = Deno.env.get('DD_TELEMETRY_HEARTBEAT_INTERVAL')
      ? Math.floor(parseFloat(Deno.env.get('DD_TELEMETRY_HEARTBEAT_INTERVAL')) * 1000)
      : 60000;
    const DD_OPENAI_SPAN_CHAR_LIMIT = Deno.env.get('DD_OPENAI_SPAN_CHAR_LIMIT')
      ? parseInt(Deno.env.get('DD_OPENAI_SPAN_CHAR_LIMIT'))
      : 128;
    const DD_TELEMETRY_DEBUG = coalesce(
      Deno.env.get('DD_TELEMETRY_DEBUG'),
      false,
    );
    const DD_TELEMETRY_METRICS_ENABLED = coalesce(
      Deno.env.get('DD_TELEMETRY_METRICS_ENABLED'),
      false,
    );
    const DD_TRACE_AGENT_PROTOCOL_VERSION = coalesce(
      options.protocolVersion,
      Deno.env.get('DD_TRACE_AGENT_PROTOCOL_VERSION'),
      '0.4',
    );
    const DD_TRACE_PARTIAL_FLUSH_MIN_SPANS = coalesce(
      parseInt(options.flushMinSpans),
      parseInt(Deno.env.get('DD_TRACE_PARTIAL_FLUSH_MIN_SPANS')),
      1000,
    );
    const DD_TRACE_OBFUSCATION_QUERY_STRING_REGEXP = coalesce(
      Deno.env.get('DD_TRACE_OBFUSCATION_QUERY_STRING_REGEXP'),
      qsRegex,
    );
    const DD_TRACE_CLIENT_IP_ENABLED = coalesce(
      options.clientIpEnabled,
      Deno.env.get('DD_TRACE_CLIENT_IP_ENABLED') && isTrue(Deno.env.get('DD_TRACE_CLIENT_IP_ENABLED')),
      false,
    );
    const DD_TRACE_CLIENT_IP_HEADER = coalesce(
      options.clientIpHeader,
      Deno.env.get('DD_TRACE_CLIENT_IP_HEADER'),
      null,
    );
    // TODO: Remove the experimental env vars as a major?
    const DD_TRACE_B3_ENABLED = coalesce(
      options.experimental && options.experimental.b3,
      Deno.env.get('DD_TRACE_EXPERIMENTAL_B3_ENABLED'),
      false,
    );
    const defaultPropagationStyle: string[] = ['datadog', 'tracecontext'];
    if (isTrue(DD_TRACE_B3_ENABLED)) {
      defaultPropagationStyle.push('b3');
      defaultPropagationStyle.push('b3 single header');
    }
    if (
      Deno.env.get('DD_TRACE_PROPAGATION_STYLE') && (
        Deno.env.get('DD_TRACE_PROPAGATION_STYLE_INJECT') ||
        Deno.env.get('DD_TRACE_PROPAGATION_STYLE_EXTRACT')
      )
    ) {
      log.warn(
        'Use either the DD_TRACE_PROPAGATION_STYLE environment variable or separate ' +
          'DD_TRACE_PROPAGATION_STYLE_INJECT and DD_TRACE_PROPAGATION_STYLE_EXTRACT ' +
          'environment variables',
      );
    }
    const DD_TRACE_PROPAGATION_STYLE_INJECT = propagationStyle(
      'inject',
      options.tracePropagationStyle,
      defaultPropagationStyle,
    );
    const DD_TRACE_PROPAGATION_STYLE_EXTRACT = propagationStyle(
      'extract',
      options.tracePropagationStyle,
      defaultPropagationStyle,
    );
    const DD_TRACE_RUNTIME_ID_ENABLED = coalesce(
      options.experimental && options.experimental.runtimeId,
      Deno.env.get('DD_TRACE_EXPERIMENTAL_RUNTIME_ID_ENABLED'),
      false,
    );
    const DD_TRACE_EXPORTER = coalesce(
      options.experimental && options.experimental.exporter,
      Deno.env.get('DD_TRACE_EXPERIMENTAL_EXPORTER'),
    );
    const DD_TRACE_GET_RUM_DATA_ENABLED = coalesce(
      options.experimental && options.experimental.enableGetRumData,
      Deno.env.get('DD_TRACE_EXPERIMENTAL_GET_RUM_DATA_ENABLED'),
      false,
    );
    const DD_TRACE_SPAN_ATTRIBUTE_SCHEMA = validateNamingVersion(
      coalesce(
        options.spanAttributeSchema,
        Deno.env.get('DD_TRACE_SPAN_ATTRIBUTE_SCHEMA'),
      ),
    );
    const DD_TRACE_PEER_SERVICE_MAPPING = coalesce(
      options.peerServiceMapping,
      Deno.env.get('DD_TRACE_PEER_SERVICE_MAPPING')
        ? fromEntries(
          Deno.env.get('DD_TRACE_PEER_SERVICE_MAPPING').split(',').map((x: string) => x.trim().split(':')),
        )
        : {},
    );

    const peerServiceSet = options.hasOwnProperty('spanComputePeerService') ||
      Deno.env.has('DD_TRACE_PEER_SERVICE_DEFAULTS_ENABLED');
    const peerServiceValue = coalesce(
      options.spanComputePeerService,
      Deno.env.get('DD_TRACE_PEER_SERVICE_DEFAULTS_ENABLED'),
    );

    const DD_TRACE_PEER_SERVICE_DEFAULTS_ENABLED = DD_TRACE_SPAN_ATTRIBUTE_SCHEMA === 'v0'
      // In v0, peer service is computed only if it is explicitly set to true
      ? peerServiceSet && isTrue(peerServiceValue)
      // In >v0, peer service is false only if it is explicitly set to false
      : (peerServiceSet ? !isFalse(peerServiceValue) : true);

    const DD_TRACE_REMOVE_INTEGRATION_SERVICE_NAMES_ENABLED = coalesce(
      options.spanRemoveIntegrationFromService,
      isTrue(Deno.env.get('DD_TRACE_REMOVE_INTEGRATION_SERVICE_NAMES_ENABLED')),
    );
    const DD_TRACE_X_DATADOG_TAGS_MAX_LENGTH = coalesce(
      Deno.env.get('DD_TRACE_X_DATADOG_TAGS_MAX_LENGTH'),
      '512',
    );

    const DD_TRACE_STATS_COMPUTATION_ENABLED = coalesce(
      options.stats,
      Deno.env.get('DD_TRACE_STATS_COMPUTATION_ENABLED'),
      isGCPFunction || isAzureFunctionConsumptionPlan,
    );

    const DD_TRACE_128_BIT_TRACEID_GENERATION_ENABLED = coalesce(
      options.traceId128BitGenerationEnabled,
      Deno.env.get('DD_TRACE_128_BIT_TRACEID_GENERATION_ENABLED'),
      false,
    );

    const DD_TRACE_128_BIT_TRACEID_LOGGING_ENABLED = coalesce(
      options.traceId128BitLoggingEnabled,
      Deno.env.get('DD_TRACE_128_BIT_TRACEID_LOGGING_ENABLED'),
      false,
    );

    let appsec = options.appsec != null ? options.appsec : options.experimental && options.experimental.appsec;

    if (typeof appsec === 'boolean') {
      appsec = {
        enabled: appsec,
      };
    } else if (appsec == null) {
      appsec = {};
    }

    const DD_APPSEC_ENABLED = coalesce(
      appsec.enabled,
      Deno.env.get('DD_APPSEC_ENABLED') && isTrue(Deno.env.get('DD_APPSEC_ENABLED')),
    );

    const DD_APPSEC_RULES = coalesce(
      appsec.rules,
      Deno.env.get('DD_APPSEC_RULES'),
    );
    const DD_APPSEC_TRACE_RATE_LIMIT = coalesce(
      parseInt(appsec.rateLimit),
      parseInt(Deno.env.get('DD_APPSEC_TRACE_RATE_LIMIT')),
      100,
    );
    const DD_APPSEC_WAF_TIMEOUT = coalesce(
      parseInt(appsec.wafTimeout),
      parseInt(Deno.env.get('DD_APPSEC_WAF_TIMEOUT')),
      5e3, // µs
    );
    const DD_APPSEC_OBFUSCATION_PARAMETER_KEY_REGEXP = coalesce(
      appsec.obfuscatorKeyRegex,
      Deno.env.get('DD_APPSEC_OBFUSCATION_PARAMETER_KEY_REGEXP'),
      `(?i)(?:p(?:ass)?w(?:or)?d|pass(?:_?phrase)?|secret|(?:api_?|private_?|public_?)key)|token|consumer_?(?:id|key|se\
cret)|sign(?:ed|ature)|bearer|authorization`,
    );
    const DD_APPSEC_OBFUSCATION_PARAMETER_VALUE_REGEXP = coalesce(
      appsec.obfuscatorValueRegex,
      Deno.env.get('DD_APPSEC_OBFUSCATION_PARAMETER_VALUE_REGEXP'),
      `(?i)(?:p(?:ass)?w(?:or)?d|pass(?:_?phrase)?|secret|(?:api_?|private_?|public_?|access_?|secret_?)key(?:_?id)?|to\
ken|consumer_?(?:id|key|secret)|sign(?:ed|ature)?|auth(?:entication|orization)?)(?:\\s*=[^;]|"\\s*:\\s*"[^"]+")|bearer\
\\s+[a-z0-9\\._\\-]+|token:[a-z0-9]{13}|gh[opsu]_[0-9a-zA-Z]{36}|ey[I-L][\\w=-]+\\.ey[I-L][\\w=-]+(?:\\.[\\w.+\\/=-]+)?\
|[\\-]{5}BEGIN[a-z\\s]+PRIVATE\\sKEY[\\-]{5}[^\\-]+[\\-]{5}END[a-z\\s]+PRIVATE\\sKEY|ssh-rsa\\s*[a-z0-9\\/\\.+]{100,}`,
    );
    const DD_APPSEC_HTTP_BLOCKED_TEMPLATE_HTML = coalesce(
      maybeFile(appsec.blockedTemplateHtml),
      maybeFile(Deno.env.get('DD_APPSEC_HTTP_BLOCKED_TEMPLATE_HTML')),
    );
    const DD_APPSEC_HTTP_BLOCKED_TEMPLATE_JSON = coalesce(
      maybeFile(appsec.blockedTemplateJson),
      maybeFile(Deno.env.get('DD_APPSEC_HTTP_BLOCKED_TEMPLATE_JSON')),
    );
    const DD_APPSEC_AUTOMATED_USER_EVENTS_TRACKING = coalesce(
      appsec.eventTracking && appsec.eventTracking.mode,
      Deno.env.get('DD_APPSEC_AUTOMATED_USER_EVENTS_TRACKING'),
      'safe',
    ).toLowerCase();

    const remoteConfigOptions = options.remoteConfig || {};
    const DD_REMOTE_CONFIGURATION_ENABLED = coalesce(
      Deno.env.get('DD_REMOTE_CONFIGURATION_ENABLED') && isTrue(Deno.env.get('DD_REMOTE_CONFIGURATION_ENABLED')),
      !inServerlessEnvironment,
    );
    const DD_REMOTE_CONFIG_POLL_INTERVAL_SECONDS = coalesce(
      parseFloat(remoteConfigOptions.pollInterval),
      parseFloat(Deno.env.get('DD_REMOTE_CONFIG_POLL_INTERVAL_SECONDS')),
      5, // seconds
    );

    const iastOptions = options.experimental && options.experimental.iast;
    const DD_IAST_ENABLED = coalesce(
      iastOptions &&
        (iastOptions === true || iastOptions.enabled === true),
      Deno.env.get('DD_IAST_ENABLED'),
      false,
    );
    const DD_TELEMETRY_LOG_COLLECTION_ENABLED = coalesce(
      Deno.env.get('DD_TELEMETRY_LOG_COLLECTION_ENABLED'),
      DD_IAST_ENABLED,
    );

    const defaultIastRequestSampling = 30;
    const iastRequestSampling = coalesce(
      parseInt(iastOptions && iastOptions.requestSampling),
      parseInt(Deno.env.get('DD_IAST_REQUEST_SAMPLING')),
      defaultIastRequestSampling,
    );
    const DD_IAST_REQUEST_SAMPLING = iastRequestSampling < 0 ||
        iastRequestSampling > 100
      ? defaultIastRequestSampling
      : iastRequestSampling;

    const DD_IAST_MAX_CONCURRENT_REQUESTS = coalesce(
      parseInt(iastOptions && iastOptions.maxConcurrentRequests),
      parseInt(Deno.env.get('DD_IAST_MAX_CONCURRENT_REQUESTS')),
      2,
    );

    const DD_IAST_MAX_CONTEXT_OPERATIONS = coalesce(
      parseInt(iastOptions && iastOptions.maxContextOperations),
      parseInt(Deno.env.get('DD_IAST_MAX_CONTEXT_OPERATIONS')),
      2,
    );

    const DD_IAST_DEDUPLICATION_ENABLED = coalesce(
      iastOptions && iastOptions.deduplicationEnabled,
      Deno.env.get('DD_IAST_DEDUPLICATION_ENABLED') && isTrue(Deno.env.get('DD_IAST_DEDUPLICATION_ENABLED')),
      true,
    );

    const DD_IAST_REDACTION_ENABLED = coalesce(
      iastOptions && iastOptions.redactionEnabled,
      !isFalse(Deno.env.get('DD_IAST_REDACTION_ENABLED')),
      true,
    );

    const DD_IAST_TELEMETRY_VERBOSITY = coalesce(
      iastOptions && iastOptions.telemetryVerbosity,
      Deno.env.get('DD_IAST_TELEMETRY_VERBOSITY'),
      'INFORMATION',
    );

    const DD_CIVISIBILITY_GIT_UPLOAD_ENABLED = coalesce(
      Deno.env.get('DD_CIVISIBILITY_GIT_UPLOAD_ENABLED'),
      true,
    );

    const DD_TRACE_GIT_METADATA_ENABLED = coalesce(
      Deno.env.get('DD_TRACE_GIT_METADATA_ENABLED'),
      true,
    );

    const ingestion = options.ingestion || {};
    const dogstatsd = coalesce(options.dogstatsd, {});
    const sampler = {
      rateLimit: coalesce(options.rateLimit, Deno.env.get('DD_TRACE_RATE_LIMIT'), ingestion.rateLimit),
      rules: coalesce(
        options.samplingRules,
        safeJsonParse(Deno.env.get('DD_TRACE_SAMPLING_RULES')),
        [],
      ).map((rule) => {
        return remapify(rule, {
          sample_rate: 'sampleRate',
        });
      }),
      spanSamplingRules: coalesce(
        options.spanSamplingRules,
        safeJsonParse(maybeFile(Deno.env.get('DD_SPAN_SAMPLING_RULES_FILE'))),
        safeJsonParse(Deno.env.get('DD_SPAN_SAMPLING_RULES')),
        [],
      ).map((rule) => {
        return remapify(rule, {
          sample_rate: 'sampleRate',
          max_per_second: 'maxPerSecond',
        });
      }),
    };

    const defaultFlushInterval = inAWSLambda ? 0 : 2000;

    this.tracing = !isFalse(DD_TRACING_ENABLED);
    this.dbmPropagationMode = DD_DBM_PROPAGATION_MODE;
    this.dsmEnabled = isTrue(DD_DATA_STREAMS_ENABLED);
    this.openAiLogsEnabled = DD_OPENAI_LOGS_ENABLED;
    this.apiKey = DD_API_KEY;
    this.env = DD_ENV;
    this.url = DD_CIVISIBILITY_AGENTLESS_URL
      ? new URL(DD_CIVISIBILITY_AGENTLESS_URL)
      : getAgentUrl(DD_TRACE_AGENT_URL, options);
    this.site = coalesce(options.site, Deno.env.get('DD_SITE'), 'datadoghq.com');
    this.hostname = DD_AGENT_HOST || (this.url && this.url.hostname);
    this.port = String(DD_TRACE_AGENT_PORT || (this.url && this.url.port));
    this.flushInterval = coalesce(parseInt(options.flushInterval, 10), defaultFlushInterval);
    this.flushMinSpans = DD_TRACE_PARTIAL_FLUSH_MIN_SPANS;
    this.queryStringObfuscation = DD_TRACE_OBFUSCATION_QUERY_STRING_REGEXP;
    this.clientIpEnabled = DD_TRACE_CLIENT_IP_ENABLED;
    this.clientIpHeader = DD_TRACE_CLIENT_IP_HEADER;
    this.plugins = !!coalesce(options.plugins, true);
    this.service = DD_SERVICE;
    this.serviceMapping = DD_SERVICE_MAPPING;
    this.version = DD_VERSION;
    this.dogstatsd = {
      hostname: coalesce(dogstatsd.hostname, Deno.env.get('DD_DOGSTATSD_HOSTNAME'), this.hostname),
      port: Number(coalesce(dogstatsd.port, Deno.env.get('DD_DOGSTATSD_PORT'), 8125)),
    };
    this.runtimeMetrics = isTrue(DD_RUNTIME_METRICS_ENABLED);
    this.tracePropagationStyle = {
      inject: DD_TRACE_PROPAGATION_STYLE_INJECT,
      extract: DD_TRACE_PROPAGATION_STYLE_EXTRACT,
    };
    this.experimental = {
      runtimeId: isTrue(DD_TRACE_RUNTIME_ID_ENABLED),
      exporter: DD_TRACE_EXPORTER,
      enableGetRumData: isTrue(DD_TRACE_GET_RUM_DATA_ENABLED),
    };
    this.sampler = sampler;
    this.reportHostname = isTrue(coalesce(options.reportHostname, Deno.env.get('DD_TRACE_REPORT_HOSTNAME'), false));
    this.scope = Deno.env.get('DD_TRACE_SCOPE');
    this.profiling = {
      enabled: isTrue(DD_PROFILING_ENABLED),
      sourceMap: !isFalse(DD_PROFILING_SOURCE_MAP),
      exporters: DD_PROFILING_EXPORTERS,
    };
    this.spanAttributeSchema = DD_TRACE_SPAN_ATTRIBUTE_SCHEMA;
    this.spanComputePeerService = DD_TRACE_PEER_SERVICE_DEFAULTS_ENABLED;
    this.spanRemoveIntegrationFromService = DD_TRACE_REMOVE_INTEGRATION_SERVICE_NAMES_ENABLED;
    this.peerServiceMapping = DD_TRACE_PEER_SERVICE_MAPPING;
    this.lookup = options.lookup;
    this.startupLogs = isTrue(DD_TRACE_STARTUP_LOGS);
    // Disabled for CI Visibility's agentless
    this.telemetry = {
      enabled: DD_TRACE_EXPORTER !== 'datadog' && isTrue(DD_TRACE_TELEMETRY_ENABLED),
      heartbeatInterval: DD_TELEMETRY_HEARTBEAT_INTERVAL,
      logCollection: isTrue(DD_TELEMETRY_LOG_COLLECTION_ENABLED),
      debug: isTrue(DD_TELEMETRY_DEBUG),
      metrics: isTrue(DD_TELEMETRY_METRICS_ENABLED),
    };
    this.protocolVersion = DD_TRACE_AGENT_PROTOCOL_VERSION;
    this.tagsHeaderMaxLength = parseInt(DD_TRACE_X_DATADOG_TAGS_MAX_LENGTH);
    this.appsec = {
      enabled: DD_APPSEC_ENABLED,
      rules: DD_APPSEC_RULES ? safeJsonParse(maybeFile(DD_APPSEC_RULES)) : recommendedJson,
      customRulesProvided: !!DD_APPSEC_RULES,
      rateLimit: DD_APPSEC_TRACE_RATE_LIMIT,
      wafTimeout: DD_APPSEC_WAF_TIMEOUT,
      obfuscatorKeyRegex: DD_APPSEC_OBFUSCATION_PARAMETER_KEY_REGEXP,
      obfuscatorValueRegex: DD_APPSEC_OBFUSCATION_PARAMETER_VALUE_REGEXP,
      blockedTemplateHtml: DD_APPSEC_HTTP_BLOCKED_TEMPLATE_HTML,
      blockedTemplateJson: DD_APPSEC_HTTP_BLOCKED_TEMPLATE_JSON,
      eventTracking: {
        enabled: ['extended', 'safe'].includes(DD_APPSEC_AUTOMATED_USER_EVENTS_TRACKING),
        mode: DD_APPSEC_AUTOMATED_USER_EVENTS_TRACKING,
      },
    };
    this.remoteConfig = {
      enabled: DD_REMOTE_CONFIGURATION_ENABLED,
      pollInterval: DD_REMOTE_CONFIG_POLL_INTERVAL_SECONDS,
    };
    this.iast = {
      enabled: isTrue(DD_IAST_ENABLED),
      requestSampling: DD_IAST_REQUEST_SAMPLING,
      maxConcurrentRequests: DD_IAST_MAX_CONCURRENT_REQUESTS,
      maxContextOperations: DD_IAST_MAX_CONTEXT_OPERATIONS,
      deduplicationEnabled: DD_IAST_DEDUPLICATION_ENABLED,
      redactionEnabled: DD_IAST_REDACTION_ENABLED,
      telemetryVerbosity: DD_IAST_TELEMETRY_VERBOSITY,
    };

    this.isCiVisibility = isTrue(DD_IS_CIVISIBILITY);

    this.isIntelligentTestRunnerEnabled = this.isCiVisibility && isTrue(DD_CIVISIBILITY_ITR_ENABLED);
    this.isGitUploadEnabled = this.isCiVisibility &&
      (this.isIntelligentTestRunnerEnabled && !isFalse(DD_CIVISIBILITY_GIT_UPLOAD_ENABLED));

    this.gitMetadataEnabled = isTrue(DD_TRACE_GIT_METADATA_ENABLED);
    this.isManualApiEnabled = this.isCiVisibility && isTrue(DD_CIVISIBILITY_MANUAL_API_ENABLED);

    this.openaiSpanCharLimit = DD_OPENAI_SPAN_CHAR_LIMIT;

    if (this.gitMetadataEnabled) {
      this.repositoryUrl = coalesce(
        Deno.env.get('DD_GIT_REPOSITORY_URL'),
        this.tags[GIT_REPOSITORY_URL],
      );
      this.commitSHA = coalesce(
        Deno.env.get('DD_GIT_COMMIT_SHA'),
        this.tags[GIT_COMMIT_SHA],
      );
      if (!this.repositoryUrl || !this.commitSHA) {
        const DD_GIT_PROPERTIES_FILE = coalesce(
          Deno.env.get('DD_GIT_PROPERTIES_FILE'),
          `${Deno.cwd()}/git.properties`,
        );
        let gitPropertiesString;
        try {
          gitPropertiesString = Deno.readTextFileSync(DD_GIT_PROPERTIES_FILE);
        } catch (e) {
          // Only log error if the user has set a git.properties path
          if (Deno.env.get('DD_GIT_PROPERTIES_FILE')) {
            log.error(e);
          }
        }
        if (gitPropertiesString) {
          const { commitSHA, repositoryUrl } = getGitMetadataFromGitProperties(gitPropertiesString);
          this.commitSHA = this.commitSHA || commitSHA;
          this.repositoryUrl = this.repositoryUrl || repositoryUrl;
        }
      }
    }

    this.stats = {
      enabled: isTrue(DD_TRACE_STATS_COMPUTATION_ENABLED),
    };

    this.traceId128BitGenerationEnabled = isTrue(DD_TRACE_128_BIT_TRACEID_GENERATION_ENABLED);
    this.traceId128BitLoggingEnabled = isTrue(DD_TRACE_128_BIT_TRACEID_LOGGING_ENABLED);

    this.isGCPFunction = isGCPFunction;
    this.isAzureFunctionConsumptionPlan = isAzureFunctionConsumptionPlan;

    tagger.add(this.tags, {
      service: this.service,
      env: this.env,
      version: this.version,
      'runtime-id': crypto.randomUUID(),
    });

    this._applyDefaults();
    this._applyEnvironment();
    this._applyOptions(options);
    this._applyRemote({});
    this._merge();
  }

  // Supports only a subset of options for now.
  configure(
    options: {
      tracing_header_tags?: any;
      tracing_sampling_rate?: any;
      log_injection_enabled?: any;
      sampleRate?: any;
      ingestion?: { sampleRate: any };
      logInjection?: boolean;
      headerTags?: any;
    },
    remote,
  ) {
    if (remote) {
      this._applyRemote(options);
    } else {
      this._applyOptions(options);
    }

    this._merge();
  }

  _applyDefaults() {
    const defaults = this._defaults = {};

    this._setUnit(defaults, 'sampleRate', undefined);
    this._setBoolean(defaults, 'logInjection', false);
    this._setArray(defaults, 'headerTags', []);
  }

  _applyEnvironment() {
    const {
      DD_TRACE_SAMPLE_RATE,
      DD_LOGS_INJECTION,
      DD_TRACE_HEADER_TAGS,
    } = Deno.env.toObject();

    const env = this._env = {};

    this._setUnit(env, 'sampleRate', DD_TRACE_SAMPLE_RATE);
    this._setBoolean(env, 'logInjection', DD_LOGS_INJECTION);
    this._setArray(env, 'headerTags', DD_TRACE_HEADER_TAGS);
  }

  _applyOptions(options: { sampleRate: any; ingestion: { sampleRate: any }; logInjection: any; headerTags: any }) {
    const opts = this._options = this._options || {};

    options = Object.assign({ ingestion: {} }, options, opts);

    this._setUnit(opts, 'sampleRate', coalesce(options.sampleRate, options.ingestion.sampleRate));
    this._setBoolean(opts, 'logInjection', options.logInjection);
    this._setArray(opts, 'headerTags', options.headerTags);
  }

  _applyRemote(options: { tracing_header_tags?: any; tracing_sampling_rate?: any; log_injection_enabled?: any }) {
    const opts = this._remote = this._remote || {};
    const headerTags = options.tracing_header_tags
      ? options.tracing_header_tags.map((tag: { tag_name: any; header: any }) => {
        return tag.tag_name ? `${tag.header}:${tag.tag_name}` : tag.header;
      })
      : undefined;

    this._setUnit(opts, 'sampleRate', options.tracing_sampling_rate);
    this._setBoolean(opts, 'logInjection', options.log_injection_enabled);
    this._setArray(opts, 'headerTags', headerTags);
  }

  _setBoolean(obj: { [x: string]: any }, name: string, value: string | boolean) {
    if (value === undefined || value === null) {
      this._setValue(obj, name, value);
    } else if (isTrue(value)) {
      this._setValue(obj, name, true);
    } else if (isFalse(value)) {
      this._setValue(obj, name, false);
    }
  }

  _setUnit(obj: { [x: string]: any }, name: string, value: string | number) {
    if (value === null || value === undefined) {
      return this._setValue(obj, name, value);
    }

    value = parseFloat(value);

    if (!isNaN(value)) {
      // TODO: Ignore out of range values instead of normalizing them.
      this._setValue(obj, name, Math.min(Math.max(value, 0), 1));
    }
  }

  _setArray(obj: { [x: string]: any }, name: string, value: string | string[]) {
    if (value === null || value === undefined) {
      return this._setValue(obj, name, null);
    }

    if (typeof value === 'string') {
      value = value && value.split(',');
    }

    if (Array.isArray(value)) {
      this._setValue(obj, name, value);
    }
  }

  _setValue(obj: { [x: string]: any }, name: string | number, value: number | boolean | any[]) {
    obj[name] = value;
  }

  // TODO: Report origin changes and errors to telemetry.
  // TODO: Deeply merge configurations.
  // TODO: Move change tracking to telemetry.
  _merge() {
    const containers = [this._remote, this._options, this._env, this._defaults];
    const origins = ['remote_config', 'code', 'env_var', 'default'];
    const changes: ({ name: string; value: any; origin: string })[] = [];

    for (const name in this._defaults) {
      for (let i = 0; i < containers.length; i++) {
        const container = containers[i];
        const origin = origins[i];

        if ((container[name] !== null && container[name] !== undefined) || container === this._defaults) {
          if (this[name] === container[name] && this.hasOwnProperty(name)) break;

          const value = this[name] = container[name];

          changes.push({ name, value, origin });

          break;
        }
      }
    }

    this.sampler.sampleRate = this.sampleRate;

    updateConfig(changes, this);
  }
}

function getAgentUrl(url: string | URL, options: { hostname: any; port: any }) {
  if (url) return new URL(url);

  if (Deno.build.os === 'windows') return;

  if (
    !options.hostname &&
    !options.port &&
    !Deno.env.get('DD_AGENT_HOST') &&
    !Deno.env.get('DD_TRACE_AGENT_HOSTNAME') &&
    !Deno.env.get('DD_TRACE_AGENT_PORT') &&
    existsSync('/var/run/datadog/apm.socket')
  ) {
    return new URL('unix:///var/run/datadog/apm.socket');
  }
}
