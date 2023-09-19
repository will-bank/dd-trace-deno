import AgentWriter from '../../../exporters/agent/writer.ts';
import AgentlessWriter from '../agentless/writer.ts';
import CoverageWriter from '../agentless/coverage-writer.ts';
import CiVisibilityExporter from '../ci-visibility-exporter.ts';

const AGENT_EVP_PROXY_PATH = '/evp_proxy/v2';

function getIsEvpCompatible(err, agentInfo: { endpoints: any[] }) {
  return !err &&
    agentInfo.endpoints.some((url: { includes: (arg0: string) => any }) => url.includes(AGENT_EVP_PROXY_PATH));
}

class AgentProxyCiVisibilityExporter extends CiVisibilityExporter {
  private _isInitialized: boolean;
  private _isUsingEvpProxy: boolean;
  private _writer: any;
  private _coverageWriter: any;
  private _coverageBuffer: any[];
  constructor(config: { tags: any; prioritySampler: any; lookup: any; protocolVersion: any; headers: any }) {
    super(config);

    const {
      tags,
      prioritySampler,
      lookup,
      protocolVersion,
      headers,
    } = config;

    this.getAgentInfo((err, agentInfo) => {
      this._isInitialized = true;
      const isEvpCompatible = getIsEvpCompatible(err, agentInfo);
      if (isEvpCompatible) {
        this._isUsingEvpProxy = true;
        this._writer = new AgentlessWriter({
          url: this.url,
          tags,
          evpProxyPrefix: AGENT_EVP_PROXY_PATH,
        });
        this._coverageWriter = new CoverageWriter({
          url: this.url,
          evpProxyPrefix: AGENT_EVP_PROXY_PATH,
        });
      } else {
        this._writer = new AgentWriter({
          url: this.url,
          prioritySampler,
          lookup,
          protocolVersion,
          headers,
        });
        // coverages will never be used, so we discard them
        this._coverageBuffer = [];
      }

      this._resolveCanUseCiVisProtocol(isEvpCompatible);
      this.exportUncodedTraces();
      this.exportUncodedCoverages();
    });
  }

  setUrl(url: string | URL, coverageUrl: string | URL) {
    this._setUrl(url, coverageUrl);
  }
}

export default AgentProxyCiVisibilityExporter;
