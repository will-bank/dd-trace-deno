import log from './log/index.ts';
import { profiler } from './profiling/index.ts';

// Stop profiler upon exit in order to collect and export the current profile
addEventListener('befoferunload', () => {
  profiler.stop();
});

export const start = (
  config: {
    profiling?: any;
    service?: any;
    version?: any;
    env?: any;
    url?: any;
    hostname?: any;
    port?: any;
    tags?: any;
  },
) => {
  const { service, version, env, url, hostname, port, tags } = config;
  const { enabled, sourceMap, exporters } = config.profiling;
  const logger = {

    debug: (message) => log.debug(message),

    info: (message) => log.info(message),

    warn: (message) => log.warn(message),

    error: (message) => log.error(message),
  };

  profiler.start({
    enabled,
    service,
    version,
    env,
    logger,
    sourceMap,
    exporters,
    url,
    hostname,
    port,
    tags,
  });
};

export const stop = () => {
  profiler.stop();
};
