import Writer from './writer.ts';
import CoverageWriter from './coverage-writer.ts';
import CiVisibilityExporter from '../ci-visibility-exporter.ts';
import log from '../../../log/index.ts';

class AgentlessCiVisibilityExporter extends CiVisibilityExporter {
  private _isInitialized: boolean;
  private url: any;
  private _writer: Writer;
  private _coverageUrl: any;
  private _coverageWriter: any;
  private _apiUrl: any;
  constructor(config: { tags: any; site: any; url: any }) {
    super(config);
    const { tags, site, url } = config;
    // we don't need to request /info because we are using agentless by configuration
    this._isInitialized = true;

    this._resolveCanUseCiVisProtocol(true);

    this.url = url || new URL(`https://citestcycle-intake.${site}`);

    this._writer = new Writer({ url: this.url, tags });

    this._coverageUrl = url || new URL(`https://citestcov-intake.${site}`);
    this._coverageWriter = new CoverageWriter({ url: this._coverageUrl });

    this._apiUrl = url || new URL(`https://api.${site}`);
  }

  setUrl(url: string | URL, coverageUrl = url, apiUrl = url) {
    this._setUrl(url, coverageUrl);
    try {
      apiUrl = new URL(apiUrl);
      this._apiUrl = apiUrl;
    } catch (e) {
      log.error(e);
    }
  }

  _getApiUrl() {
    return this._apiUrl;
  }
}

export default AgentlessCiVisibilityExporter;
