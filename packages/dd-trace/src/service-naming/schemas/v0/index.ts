import SchemaDefinition from '../definition.ts';
import * as messaging from './messaging.ts';
import * as storage from './storage.ts';
import * as graphql from './graphql.ts';
import * as web from './web.ts';

export default new SchemaDefinition({ messaging, storage, web, graphql });
