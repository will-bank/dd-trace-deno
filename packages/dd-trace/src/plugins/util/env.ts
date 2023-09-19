import os from 'node:os';

const OS_PLATFORM = 'os.platform';
const OS_VERSION = 'os.version';
const OS_ARCHITECTURE = 'os.architecture';
const RUNTIME_NAME = 'runtime.name';
const RUNTIME_VERSION = 'runtime.version';

function getRuntimeAndOSMetadata() {
  return {
    [RUNTIME_VERSION]: process.version,
    [OS_ARCHITECTURE]: process.arch,
    [OS_PLATFORM]: process.platform,
    [RUNTIME_NAME]: 'node',
    [OS_VERSION]: os.release(),
  };
}

export { getRuntimeAndOSMetadata, OS_ARCHITECTURE, OS_PLATFORM, OS_VERSION, RUNTIME_NAME, RUNTIME_VERSION };
