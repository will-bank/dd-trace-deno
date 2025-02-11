import packageJson from 'https://esm.sh/dd-trace@5.36.0&pin=v135&no-dts/package.json' assert { type: 'json' };

export default {
  ...packageJson,
  version: `${packageJson.version}-deno`,
};
