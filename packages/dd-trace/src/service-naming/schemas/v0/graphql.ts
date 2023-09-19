import { identityService } from '../util.ts';

export const server = {
  graphql: {
    opName: () => 'graphql.execute',
    serviceName: identityService,
  },
};
