import { encode as hexEncode, decode as hexDecode } from "https://deno.land/std@0.201.0/encoding/hex.ts";
import { format, URL } from 'node:url';
import crypto from 'node:crypto';
import { Buffer } from "https://deno.land/std@0.177.0/node/buffer.ts";
import { EventEmitter } from 'node:events';
import Scheduler from './scheduler.ts';
import packageJson from 'npm:dd-trace@4.13.1/package.json' assert { type: 'json' };
import request from '../../exporters/common/request.ts';
import log from '../../log/index.ts';
import { ACKNOWLEDGED, ERROR, UNACKNOWLEDGED } from './apply_states.ts';

const clientId = crypto.randomUUID();

const DEFAULT_CAPABILITY = 0n;

const kPreUpdate = Symbol('kPreUpdate');

// There MUST NOT exist separate instances of RC clients in a tracer making separate ClientGetConfigsRequest
// with their own separated Client.ClientState.
class RemoteConfigManager extends EventEmitter {
  scheduler: Scheduler;
  requestOptions: { url: any; method: string; path: string };
  state: {
    client: {
      state: { // updated by `parseConfig()`
        root_version: number;
        targets_version: number;
        config_states: any[];
        has_error: boolean;
        error: string;
        backend_client_state: string;
      };
      id: any;
      products: any[]; // updated by `updateProducts()`
      is_tracer: boolean;
      client_tracer: {
        runtime_id: any;
        language: string;
        tracer_version: any;
        service: any;
        env: any;
        app_version: any;
      };
      capabilities: BigInt; // updated by `updateCapabilities()`
    };
    cached_target_files: any[]; // updated by `parseConfig()`
  };
  appliedConfigs: any;
  static get kPreUpdate() {
    return kPreUpdate;
  }

  constructor(
    config: {
      appsec?: { enabled: any };
      remoteConfig?: any;
      url?: any;
      hostname?: any;
      port?: any;
      tags?: any;
      service?: any;
      env?: any;
      version?: any;
    },
  ) {
    super();

    const pollInterval = Math.floor(config.remoteConfig.pollInterval * 1000);
    const url = config.url || new URL(format({
      protocol: 'http:',
      hostname: config.hostname || 'localhost',
      port: config.port,
    }));

    this.scheduler = new Scheduler((cb) => this.poll(cb), pollInterval);

    this.requestOptions = {
      url,
      method: 'POST',
      path: '/v0.7/config',
    };

    this.state = {
      client: {
        state: { // updated by `parseConfig()`
          root_version: 1,
          targets_version: 0,
          config_states: [],
          has_error: false,
          error: '',
          backend_client_state: '',
        },
        id: clientId,
        products: [], // updated by `updateProducts()`
        is_tracer: true,
        client_tracer: {
          runtime_id: config.tags['runtime-id'],
          language: 'node',
          tracer_version: packageJson.version,
          service: config.service,
          env: config.env,
          app_version: config.version,
        },
        capabilities: DEFAULT_CAPABILITY, // updated by `updateCapabilities()`
      },
      cached_target_files: [], // updated by `parseConfig()`
    };

    this.appliedConfigs = new Map();
  }

  updateCapabilities(mask: number, value: boolean) {
    let num = this.state.client.capabilities;

    if (value) {
      num |= mask;
    } else {
      num &= ~mask;
    }

    this.state.client.capabilities = num;
  }

  on(event: string, listener: (action: string, conf: { asm: { enabled: any } }) => void) {
    super.on(event, listener);

    this.updateProducts();

    if (this.state.client.products.length) {
      this.scheduler.start();
    }

    return this;
  }

  off(event, listener) {
    super.off(event, listener);

    this.updateProducts();

    if (!this.state.client.products.length) {
      this.scheduler.stop();
    }

    return this;
  }

  updateProducts() {
    this.state.client.products = this.eventNames().filter((e) => typeof e === 'string');
  }

  poll(cb: () => void) {
    const json = JSON.stringify(this.state, (key, value) => {
      if (value instanceof BigInt) {
        return value.toString(16);
      }
      return key;
    });
    request(json, this.requestOptions, (err, data: string, statusCode: number) => {
      // 404 means RC is disabled, ignore it
      if (statusCode === 404) return cb();

      if (err) {
        log.error(err);
        return cb();
      }

      // if error was just sent, reset the state
      if (this.state.client.state.has_error) {
        this.state.client.state.has_error = false;
        this.state.client.state.error = '';
      }

      if (data && data !== '{}') { // '{}' means the tracer is up to date
        try {
          this.parseConfig(JSON.parse(data));
        } catch (err) {
          log.error(`Could not parse remote config response: ${err}`);

          this.state.client.state.has_error = true;
          this.state.client.state.error = err.toString();
        }
      }

      cb();
    });
  }

  // `client_configs` is the list of config paths to have applied
  // `targets` is the signed index with metadata for config files
  // `target_files` is the list of config files containing the actual config data
  parseConfig({
    client_configs: clientConfigs = [],
    targets,
    target_files: targetFiles = [],
  }) {
    const toUnapply: any[] = [];
    const toApply: {}[] = [];
    const toModify: {}[] = [];

    for (const appliedConfig of this.appliedConfigs.values()) {
      if (!clientConfigs.includes(appliedConfig.path)) {
        toUnapply.push(appliedConfig);
      }
    }

    targets = fromBase64JSON(targets);

    if (targets) {
      for (const path of clientConfigs) {
        const meta = targets.signed.targets[path];
        if (!meta) throw new Error(`Unable to find target for path ${path}`);

        const current = this.appliedConfigs.get(path);

        const newConf = {};

        if (current) {
          if (current.hashes.sha256 === meta.hashes.sha256) continue;

          toModify.push(newConf);
        } else {
          toApply.push(newConf);
        }

        const file = targetFiles.find((file: { path: any }) => file.path === path);
        if (!file) throw new Error(`Unable to find file for path ${path}`);

        // TODO: verify signatures
        //       verify length
        //       verify hash
        //       verify _type
        // TODO: new Date(meta.signed.expires) ignore the Targets data if it has expired ?

        const { product, id } = parseConfigPath(path);

        Object.assign(newConf, {
          path,
          product,
          id,
          version: meta.custom.v,
          apply_state: UNACKNOWLEDGED,
          apply_error: '',
          length: meta.length,
          hashes: meta.hashes,
          file: fromBase64JSON(file.raw),
        });
      }

      this.state.client.state.targets_version = targets.signed.version;
      this.state.client.state.backend_client_state = targets.signed.custom.opaque_backend_state;
    }

    if (toUnapply.length || toApply.length || toModify.length) {
      this.emit(RemoteConfigManager.kPreUpdate, { toUnapply, toApply, toModify });

      this.dispatch(toUnapply, 'unapply');
      this.dispatch(toApply, 'apply');
      this.dispatch(toModify, 'modify');

      this.state.client.state.config_states = [];
      this.state.cached_target_files = [];

      for (const conf of this.appliedConfigs.values()) {
        this.state.client.state.config_states.push({
          id: conf.id,
          version: conf.version,
          product: conf.product,
          apply_state: conf.apply_state,
          apply_error: conf.apply_error,
        });

        this.state.cached_target_files.push({
          path: conf.path,
          length: conf.length,
          hashes: Object.entries(conf.hashes).map((entry: any[]) => ({ algorithm: entry[0], hash: entry[1] })),
        });
      }
    }
  }

  dispatch(list: any[], action: string) {
    for (const item of list) {
      // TODO: we need a way to tell if unapply configs were handled by kPreUpdate or not, because they're always
      // emitted unlike the apply and modify configs

      // in case the item was already handled by kPreUpdate
      if (item.apply_state === UNACKNOWLEDGED || action === 'unapply') {
        try {
          // TODO: do we want to pass old and new config ?
          const hadListeners = this.emit(item.product, action, item.file, item.id);

          if (hadListeners) {
            item.apply_state = ACKNOWLEDGED;
          }
        } catch (err) {
          item.apply_state = ERROR;
          item.apply_error = err.toString();
        }
      }

      if (action === 'unapply') {
        this.appliedConfigs.delete(item.path);
      } else {
        this.appliedConfigs.set(item.path, item);
      }
    }
  }
}

function fromBase64JSON(str) {
  if (!str) return null;

  return JSON.parse(new TextEncoder().encode(atob(str)).toString());
}

const configPathRegex = /^(?:datadog\/\d+|employee)\/([^/]+)\/([^/]+)\/[^/]+$/;

function parseConfigPath(configPath: string) {
  const match = configPathRegex.exec(configPath);

  if (!match || !match[1] || !match[2]) {
    throw new Error(`Unable to parse path ${configPath}`);
  }

  return {
    product: match[1],
    id: match[2],
  };
}

export default RemoteConfigManager;
