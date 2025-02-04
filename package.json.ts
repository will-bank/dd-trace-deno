import packageJson from './package.json' assert { type: 'json' };

export default {
  ...packageJson,
  version: `${packageJson.version}-deno`,
};
