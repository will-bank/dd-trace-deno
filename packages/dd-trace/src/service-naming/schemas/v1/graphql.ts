import { identityService } from '../util.ts';

export const server = {
  graphql: {
    opName: () => 'graphql.server.request',
    serviceName: identityService,
  },
};
