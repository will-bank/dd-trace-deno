import SchemaDefinition from '../definition.ts';
import messaging from './messaging.ts';
import storage from './storage.ts';
import * as graphql from './graphql.ts';
import web from './web.ts';

export default new SchemaDefinition({ messaging, storage, web, graphql });
