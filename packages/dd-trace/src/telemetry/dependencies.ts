import path from 'node:path';
import parse from 'npm:module-details-from-path';
import requirePackageJson from '../require-package-json.ts';
import { sendData } from './send-data.ts';
import dc from 'npm:dd-trace/packages/diagnostics_channel/index.js';
import { fileURLToPath } from 'node:url';
import Config from "../config.ts";

const savedDependenciesToSend = new Set();
const detectedDependencyKeys = new Set();
const detectedDependencyVersions = new Set();

const FILE_URI_START = `file://`;
const moduleLoadStartChannel = dc.channel('dd-trace:moduleLoadStart');

let immediate, config, application, host;
let isFirstModule = true;

function waitAndSend(
  config: { tags?: any; hostname?: any; port?: any; url?: any },
  application: {
    service_name: any;
    env: any;
    service_version: any;
    tracer_version: any;
    language_name: string;
    language_version: any;
  },
  host: {
    hostname: any;
    os: any;
    architecture: any;
    kernel_version: any;
    kernel_release: any;
    kernel_name: any;
    os_version?: undefined;
  } | {
    hostname: any;
    os: any;
    architecture: any;
    os_version: any;
    kernel_version?: undefined;
    kernel_release?: undefined;
    kernel_name?: undefined;
  } | {
    hostname: any;
    os: any;
    architecture?: undefined;
    kernel_version?: undefined;
    kernel_release?: undefined;
    kernel_name?: undefined;
    os_version?: undefined;
  },
) {

  if (!immediate) {

    immediate = setImmediate(() => {
      immediate = null;
      if (savedDependenciesToSend.size > 0) {

        const dependencies = Array.from(savedDependenciesToSend.values()).splice(0, 1000).map(
          (pair: { split: (arg0: string) => [any, any] }) => {
            savedDependenciesToSend.delete(pair);
            const [name, version] = pair.split(' ');
            return { name, version };
          },
        );
        sendData(config, application, host, 'app-dependencies-loaded', { dependencies });
        if (savedDependenciesToSend.size > 0) {
          waitAndSend(config, application, host);
        }
      }
    });
    immediate.unref();
  }
}

function loadAllTheLoadedModules() {
  if (require.cache) {
    const filenames = Object.keys(require.cache);
    filenames.forEach((filename) => {
      onModuleLoad({ filename });
    });
  }
}

function onModuleLoad(data: { filename: any; request?: any }) {
  if (isFirstModule) {
    isFirstModule = false;
    loadAllTheLoadedModules();
  }

  if (data) {
    let filename = data.filename;
    if (filename && filename.startsWith(FILE_URI_START)) {
      try {
        filename = fileURLToPath(filename);
      } catch (e) {
        // cannot transform url to path
      }
    }
    const parseResult = filename && parse(filename);
    const request = data.request || (parseResult && parseResult.name);
    const dependencyKey = parseResult && parseResult.basedir ? parseResult.basedir : request;

    if (filename && request && isDependency(filename, request) && !detectedDependencyKeys.has(dependencyKey)) {
      detectedDependencyKeys.add(dependencyKey);

      if (parseResult) {
        const { name, basedir } = parseResult;
        if (basedir) {
          try {

            const { version } = requirePackageJson(basedir, module);
            const dependencyAndVersion = `${name} ${version}`;

            if (!detectedDependencyVersions.has(dependencyAndVersion)) {
              savedDependenciesToSend.add(dependencyAndVersion);
              detectedDependencyVersions.add(dependencyAndVersion);


              waitAndSend(config, application, host);
            }
          } catch (e) {
            // can not read the package.json, do nothing
          }
        }
      }
    }
  }
}
function start(_config: Config, _application, _host: string | any[]) {
  config = _config;
  application = _application;
  host = _host;
  moduleLoadStartChannel.subscribe(onModuleLoad);
}

function isDependency(filename, request: string | string[]) {
  const isDependencyWithSlash = isDependencyWithSeparator(filename, request, '/');
  if (isDependencyWithSlash && process.platform === 'win32') {
    return isDependencyWithSeparator(filename, request, path.sep);
  }
  return isDependencyWithSlash;
}
function isDependencyWithSeparator(filename, request: string | string[], sep: string) {
  return request.indexOf(`..${sep}`) !== 0 &&
    request.indexOf(`.${sep}`) !== 0 &&
    request.indexOf(sep) !== 0 &&
    request.indexOf(`:${sep}`) !== 1;
}

function stop() {
  config = null;
  application = null;
  host = null;
  detectedDependencyKeys.clear();
  savedDependenciesToSend.clear();
  detectedDependencyVersions.clear();
  if (moduleLoadStartChannel.hasSubscribers) {
    moduleLoadStartChannel.unsubscribe(onModuleLoad);
  }
}
export { start, stop };
