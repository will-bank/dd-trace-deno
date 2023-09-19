import { SCI_COMMIT_SHA, SCI_REPOSITORY_URL } from './constants.ts';

export default class GitMetadataTagger {
  private _config: any;

  constructor(config) {
    this._config = config;
  }

  tagGitMetadata(spanContext: { _trace: { tags: { [x: string]: any } } }) {
    if (this._config.gitMetadataEnabled) {
      // These tags are added only to the local root span
      spanContext._trace.tags[SCI_COMMIT_SHA] = this._config.commitSHA;
      spanContext._trace.tags[SCI_REPOSITORY_URL] = this._config.repositoryUrl;
    }
  }
}
