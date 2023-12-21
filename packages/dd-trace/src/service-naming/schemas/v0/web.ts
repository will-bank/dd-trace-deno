import { awsServiceV0, httpPluginClientService, identityService } from '../util.ts';
import * as version from 'https://esm.sh/dd-trace@4.13.1/version.js';

export const client = {
  grpc: {
    opName: () => version.DD_MAJOR <= 2 ? 'grpc.request' : 'grpc.client',
    serviceName: identityService,
  },
  moleculer: {
    opName: () => 'moleculer.call',
    serviceName: identityService,
  },
  http: {
    opName: () => 'http.request',
    serviceName: httpPluginClientService,
  },
  fetch: {
    opName: () => 'http.request',
    serviceName: httpPluginClientService,
  },
  http2: {
    opName: () => 'http.request',
    serviceName: httpPluginClientService,
  },
  aws: {
    opName: () => 'aws.request',
    serviceName: awsServiceV0,
  },
  lambda: {
    opName: () => 'aws.request',
    serviceName: awsServiceV0,
  },
};

export const server = {
  grpc: {
    opName: () => version.DD_MAJOR <= 2 ? 'grpc.request' : 'grpc.server',
    serviceName: identityService,
  },
  moleculer: {
    opName: () => 'moleculer.action',
    serviceName: identityService,
  },
  http: {
    opName: () => 'web.request',
    serviceName: identityService,
  },
  http2: {
    opName: () => 'web.request',
    serviceName: identityService,
  },
  next: {
    opName: () => 'next.request',
    serviceName: identityService,
  },
};
