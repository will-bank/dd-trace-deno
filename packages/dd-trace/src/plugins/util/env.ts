const OS_PLATFORM = 'os.platform';
const OS_VERSION = 'os.version';
const OS_ARCHITECTURE = 'os.architecture';
const RUNTIME_NAME = 'runtime.name';
const RUNTIME_VERSION = 'runtime.version';

function getRuntimeAndOSMetadata() {
  return {
    [RUNTIME_VERSION]: Deno.version.deno,
    [OS_ARCHITECTURE]: Deno.build.arch,
    [OS_PLATFORM]: Deno.build.os,
    [RUNTIME_NAME]: 'deno',
    [OS_VERSION]: Deno.osRelease(),
  };
}

export { getRuntimeAndOSMetadata, OS_ARCHITECTURE, OS_PLATFORM, OS_VERSION, RUNTIME_NAME, RUNTIME_VERSION };
