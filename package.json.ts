const response = await fetch("https://esm.sh/dd-trace@5.36.0&pin=v135&no-dts/package.json");
const packageJson = await response.json();

export default {
  ...packageJson,
  version: `${packageJson.version}-deno`,
};
