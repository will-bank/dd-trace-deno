import request from '../exporters/common/request.ts';

function getHeaders(
  config: { telemetry: { debug: any } },
  application: { language_name: string; tracer_version: string },
  reqType: undefined,
) {
  const headers = {
    'content-type': 'application/json',
    'dd-telemetry-api-version': 'v1',
    'dd-telemetry-request-type': reqType,
    'dd-client-library-language': application.language_name,
    'dd-client-library-version': application.tracer_version,
  };
  const debug = config.telemetry && config.telemetry.debug;
  if (debug) {

    headers['dd-telemetry-debug-enabled'] = 'true';
  }
  return headers;
}

let seqId = 0;

function getPayload(payload: { [x: string]: any; logger?: any; tags?: any; serviceMapping?: any }) {
  // Some telemetry endpoints payloads accept collections of elements such as the 'logs' endpoint.
  // 'logs' request type payload is meant to send library logs to Datadog’s backend.
  if (Array.isArray(payload)) {
    return payload;
  } else {
    const { logger, tags, serviceMapping, ...trimmedPayload } = payload;
    return trimmedPayload;
  }
}

function sendData(
  config: { tags?: any; hostname?: any; port?: any; url?: any } | { telemetry: { enabled: any } },
  application: {
    service_name: any;
    env: any;
    service_version: any;
    tracer_version: any;
    language_name: string;
    language_version: any;
  },
  host: {
    hostname: any;
    os: any;
    architecture: any;
    kernel_version: any;
    kernel_release: any;
    kernel_name: any;
    os_version?: undefined;
  } | {
    hostname: any;
    os: any;
    architecture: any;
    os_version: any;
    kernel_version?: undefined;
    kernel_release?: undefined;
    kernel_name?: undefined;
  } | {
    hostname: any;
    os: any;
    architecture?: undefined;
    kernel_version?: undefined;
    kernel_release?: undefined;
    kernel_name?: undefined;
    os_version?: undefined;
  },
  reqType: string,
  payload = {},
) {
  const { hostname, port, url } = config;

  const options = {
    url,
    hostname,
    port,
    method: 'POST',
    path: '/telemetry/proxy/api/v2/apmtelemetry',

    headers: getHeaders(config, application, reqType),
  };
  const data = JSON.stringify({
    api_version: 'v1',
    request_type: reqType,
    tracer_time: Math.floor(Date.now() / 1000),

    runtime_id: config.tags['runtime-id'],
    seq_id: ++seqId,
    payload: getPayload(payload),
    application,
    host,
  });

  request(data, options, () => {
    // ignore errors
  });
}

export { sendData };
