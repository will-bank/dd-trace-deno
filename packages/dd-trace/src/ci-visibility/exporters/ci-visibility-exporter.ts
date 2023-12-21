import { sendGitMetadata as sendGitMetadataRequest } from './git/git_metadata.ts';
const { getItrConfiguration: getItrConfigurationRequest } = await import(
  '../intelligent-test-runner/get-itr-configuration.ts'
);
const { getSkippableSuites: getSkippableSuitesRequest } = await import(
  '../intelligent-test-runner/get-skippable-suites.ts'
);
import log from '../../log/index.ts';
import AgentInfoExporter from '../../exporters/common/agent-info-exporter.ts';

function getTestConfigurationTags(tags: object) {
  if (!tags) {
    return {};
  }
  return Object.keys(tags).reduce((acc, key) => {

    if (key.startsWith('test.configuration.')) {
      const [, configKey] = key.split('test.configuration.');

      acc[configKey] = tags[key];
    }
    return acc;
  }, {});
}

function getIsTestSessionTrace(trace: any[]) {
  return trace.some((span: { type: string }) =>
    span.type === 'test_session_end' || span.type === 'test_suite_end' || span.type === 'test_module_end'
  );
}

const GIT_UPLOAD_TIMEOUT = 60000; // 60 seconds
const CAN_USE_CI_VIS_PROTOCOL_TIMEOUT = GIT_UPLOAD_TIMEOUT;

class CiVisibilityExporter extends AgentInfoExporter {
  private _timer: any;
  private _coverageTimer: any;
  private _coverageBuffer: any[];
  private _canUseCiVisProtocol: boolean;
  private _gitUploadPromise: any;
  private _resolveGit: (err: any) => void;
  private _canUseCiVisProtocolPromise: any;
  private _resolveCanUseCiVisProtocol: (canUseCiVisProtocol: any) => void;
  private _itrConfig: any;
  private _coverageUrl: any;

  constructor(config) {
    super(config);
    this._timer = undefined;
    this._coverageTimer = undefined;
    this._coverageBuffer = [];
    // The library can use new features like ITR and test suite level visibility
    // AKA CI Vis Protocol
    this._canUseCiVisProtocol = false;

    const gitUploadTimeoutId = setTimeout(() => {
      this._resolveGit(new Error('Timeout while uploading git metadata'));
    }, GIT_UPLOAD_TIMEOUT)

    Deno.unrefTimer(gitUploadTimeoutId);

    const canUseCiVisProtocolTimeoutId = setTimeout(() => {
      this._resolveCanUseCiVisProtocol(false);
    }, CAN_USE_CI_VIS_PROTOCOL_TIMEOUT);

    Deno.unrefTimer(canUseCiVisProtocolTimeoutId);

    this._gitUploadPromise = new Promise((resolve: (arg0: any) => void) => {
      this._resolveGit = (err) => {
        clearTimeout(gitUploadTimeoutId);
        resolve(err);
      };
    });


    this._canUseCiVisProtocolPromise = new Promise((resolve: (arg0: any) => void) => {
      this._resolveCanUseCiVisProtocol = (canUseCiVisProtocol) => {
        clearTimeout(canUseCiVisProtocolTimeoutId);
        this._canUseCiVisProtocol = canUseCiVisProtocol;
        resolve(canUseCiVisProtocol);
      };
    });

    addEventListener('beforeunload', () => {
      if (this._writer) {
        this._writer.flush();
      }

      if (this._coverageWriter) {
        this._coverageWriter.flush();
      }
    });
  }

  shouldRequestSkippableSuites() {

    return !!(this._config.isIntelligentTestRunnerEnabled &&
      this._canUseCiVisProtocol &&
      this._itrConfig &&
      this._itrConfig.isSuitesSkippingEnabled);
  }

  shouldRequestItrConfiguration() {

    return this._config.isIntelligentTestRunnerEnabled;
  }

  canReportSessionTraces() {
    return this._canUseCiVisProtocol;
  }

  canReportCodeCoverage() {
    return this._canUseCiVisProtocol;
  }

  // We can't call the skippable endpoint until git upload has finished,
  // hence the this._gitUploadPromise.then

  getSkippableSuites(testConfiguration, callback: (arg0: any, arg1: any[]) => any) {
    if (!this.shouldRequestSkippableSuites()) {
      return callback(null, []);
    }

    this._gitUploadPromise.then((gitUploadError) => {
      if (gitUploadError) {
        return callback(gitUploadError, []);
      }
      const configuration = {
        url: this._getApiUrl(),

        site: this._config.site,

        env: this._config.env,

        service: this._config.service,

        isEvpProxy: !!this._isUsingEvpProxy,

        custom: getTestConfigurationTags(this._config.tags),
        ...testConfiguration,
      };
      getSkippableSuitesRequest(configuration, callback);
    });
  }

  /**
   * We can't request ITR configuration until we know whether we can use the
   * CI Visibility Protocol, hence the this._canUseCiVisProtocol promise.
   */
  getItrConfiguration(testConfiguration: { repositoryUrl: any }, callback: (arg0: any, arg1: {}) => void) {
    const { repositoryUrl } = testConfiguration;
    this.sendGitMetadata(repositoryUrl);
    if (!this.shouldRequestItrConfiguration()) {
      return callback(null, {});
    }

    this._canUseCiVisProtocolPromise.then((canUseCiVisProtocol) => {
      if (!canUseCiVisProtocol) {
        return callback(null, {});
      }
      const configuration = {
        url: this._getApiUrl(),

        env: this._config.env,

        service: this._config.service,

        isEvpProxy: !!this._isUsingEvpProxy,

        custom: getTestConfigurationTags(this._config.tags),
        ...testConfiguration,
      };

      getItrConfigurationRequest(configuration, (err, itrConfig) => {
        /**
         * **Important**: this._itrConfig remains empty in testing frameworks
         * where the tests run in a subprocess, because `getItrConfiguration` is called only once.
         */
        this._itrConfig = itrConfig;
        callback(err, itrConfig);
      });
    });
  }


  sendGitMetadata(repositoryUrl) {

    if (!this._config.isGitUploadEnabled) {
      return;
    }

    this._canUseCiVisProtocolPromise.then((canUseCiVisProtocol) => {
      if (!canUseCiVisProtocol) {
        return;
      }

      sendGitMetadataRequest(this._getApiUrl(), !!this._isUsingEvpProxy, repositoryUrl, (err: { message: any }) => {
        if (err) {
          log.error(`Error uploading git metadata: ${err.message}`);
        } else {
          log.debug('Successfully uploaded git metadata');
        }
        this._resolveGit(err);
      });
    });
  }

  export(trace: any[]) {
    // Until it's initialized, we just store the traces as is

    if (!this._isInitialized) {

      this._traceBuffer.push(trace);
      return;
    }
    if (!this.canReportSessionTraces() && getIsTestSessionTrace(trace)) {
      return;
    }
    this._export(trace);
  }

  exportCoverage(formattedCoverage: any[]) {
    // Until it's initialized, we just store the coverages as is

    if (!this._isInitialized) {
      this._coverageBuffer.push(formattedCoverage);
      return;
    }
    if (!this.canReportCodeCoverage()) {
      return;
    }


    this._export(formattedCoverage, this._coverageWriter, '_coverageTimer');
  }

  flush(done = () => {}) {

    if (!this._isInitialized) {
      return done();
    }

    this._writer.flush(() => {

      if (this._coverageWriter) {

        this._coverageWriter.flush(done);
      } else {
        done();
      }
    });
  }

  exportUncodedCoverages() {
    this._coverageBuffer.forEach((oldCoveragePayload) => {
      this.exportCoverage(oldCoveragePayload);
    });
    this._coverageBuffer = [];
  }

  _setUrl(url: string | URL, coverageUrl = url) {
    try {
      url = new URL(url);
      coverageUrl = new URL(coverageUrl);
      this.url = url;
      this._coverageUrl = coverageUrl;

      this._writer.setUrl(url);

      this._coverageWriter.setUrl(coverageUrl);
    } catch (e) {
      log.error(e);
    }
  }

  _getApiUrl() {
    return this.url;
  }
}

export default CiVisibilityExporter;
