import packageJson from 'https://esm.sh/dd-trace@4.13.1/package.json' assert { type: 'json' };

export default {
  ...packageJson,
  version: `${packageJson.version}-deno`,
};
