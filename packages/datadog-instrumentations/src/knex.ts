'use strict';

const { addHook } = await import('./helpers/instrument.ts');
const { wrapThen } = require('./helpers/promise');
import shimmer from '../../datadog-shimmer/index.ts';

patch('lib/query/builder.js');
patch('lib/raw.js');
patch('lib/schema/builder.js');

function patch(file: string) {
  addHook({
    name: 'knex',
    versions: ['>=0.8.0'],
    file,
  }, (Builder: { prototype: any }) => {
    shimmer.wrap(Builder.prototype, 'then', wrapThen);
    return Builder;
  });
}
