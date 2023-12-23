// TODO: Add test with slow or unresponsive agent.
// TODO: Add telemetry for things like dropped requests, errors, etc.

import { Readable } from 'node:stream';
import http from 'node:http';
import { format as formatURL, parse as parseURL } from 'node:url';
import docker from './docker.ts';
import { httpAgent, httpsAgent } from './agents.ts';
import { storage } from '../../../../datadog-core/index.ts';
import log from '../../log/index.ts';

const maxActiveRequests = 8;
const containerId = docker.id();

let activeRequests = 0;

// TODO: Replace with `url.urlToHttpOptions` when supported by all versions
function urlToOptions(url: URL) {
  const agent = url.agent || http.globalAgent;
  const options = new URL(url);
  options.protocol ||= agent.protocol;
  options.hostname = typeof url.hostname === 'string' && url.hostname.startsWith('[')
    ? url.hostname.slice(1, -1)
    : url.hostname ||
      url.host ||
      'localhost';

  return options;
}

function fromUrlString(urlString: string | URL) {
  const url = typeof urlToHttpOptions === 'function' ? urlToOptions(new URL(urlString)) : parseURL(urlString);

  // Add the 'hostname' back if we're using named pipes
  if (url.protocol === 'unix:' && url.host === '.') {
    const udsPath = urlString.replace(/^unix:/, '');
    url.path = udsPath;
    url.pathname = udsPath;
  }

  return url;
}

export const isWritable = () => activeRequests < maxActiveRequests;

function request(
  data: BodyInit,
  options: {
    headers: Record<string, string>;
    url: string;
    socketPath: string;
    path: string | URL;
    protocol: string;
    hostname: string;
    port: number;
    timeout: number;
    agent: any;
  },
  callback: (arg0: Error, arg1: string, arg2: number) => void,
) {
  if (!options.headers) {
    options.headers = {};
  }

  if (options.url) {
    const url = typeof options.url === 'object' ? urlToOptions(options.url) : fromUrlString(options.url);
    if (url.protocol === 'unix:') {
      options.socketPath = url.pathname;
    } else {
      if (!options.path) options.path = url.path;
      // if (!options.path) options.path = url.pathname + url.search;
      options.protocol = url.protocol;
      options.hostname = url.hostname; // for IPv6 this should be '::1' and not '[::1]'
      options.port = url.port;
    }
  }

  const isReadable = data instanceof Readable;

  // The timeout should be kept low to avoid excessive queueing.
  const timeout = options.timeout || 2000;
  const isSecure = options.protocol === 'https:';
  const dataArray = [].concat(data);

  if (!isReadable) {
    options.headers['Content-Length'] = byteLength(dataArray);
  }

  if (containerId) {
    options.headers['Datadog-Container-ID'] = containerId;
  }

  options.agent = isSecure ? httpsAgent : httpAgent;

  const getProtocol = () => {
    const agent = options.agent || http.globalAgent;
    return options.protocol || agent.protocol;
  };
  const getFullUrl = () =>
    new URL(
      formatURL({
        protocol: getProtocol(),
        hostname: options.hostname || 'localhost',
        port: options.port,
        pathname: options.path || options.pathname,
      }),
      options.url,
    );

  const onResponse = async (response: Response) => {
    const responseData = await response.text();

    if (response.status >= 200 && response.status <= 299) {
      callback(null, responseData, response.status);
      return;
    }

    let errorMessage = '';
    try {
      const fullUrl = getFullUrl().href;
      errorMessage = `Error from ${fullUrl}: ${response.status} ${http.STATUS_CODES[response.status]}.`;
    } catch (e) {
      // ignore error
    }
    if (responseData) {
      errorMessage += ` Response from the endpoint: "${responseData}"`;
    }
    const error = new Error(errorMessage);

    error.status = response.status;

    callback(error, null, response.status);
  };

  const makeRequest = async (onError: { (): number; (arg0: any): void }) => {
    if (!isWritable()) {
      log.debug('Maximum number of active requests reached: payload is discarded.');

      return callback(null);
    }

    const url = getFullUrl();

    activeRequests++;

    const store = storage.getStore();

    storage.enterWith({ noop: true });

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        signal: AbortSignal.timeout(timeout),
        body: data,
      });

      onResponse(response);
    } catch (err) {
      onError(err);
    } finally {
      activeRequests--;
    }

    storage.enterWith(store);
  };

  // TODO: Figure out why setTimeout is needed to avoid losing the async context
  // in the retry request before socket.connect() is called.
  // TODO: Test that this doesn't trace itself on retry when the diagnostics
  // channel events are available in the agent exporter.

  makeRequest(() => setTimeout(() => makeRequest(callback)));
}

function byteLength(data: any[]) {
  return data.length > 0 ? data.reduce((prev, next: string | any[]) => prev + next.length, 0) : 0;
}

export default request;
