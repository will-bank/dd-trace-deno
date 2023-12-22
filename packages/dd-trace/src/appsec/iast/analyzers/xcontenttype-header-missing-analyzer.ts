import { XCONTENTTYPE_HEADER_MISSING } from '../vulnerabilities.ts';
import { MissingHeaderAnalyzer } from './missing-header-analyzer.ts';

const XCONTENTTYPEOPTIONS_HEADER_NAME = 'X-Content-Type-Options';

class XcontenttypeHeaderMissingAnalyzer extends MissingHeaderAnalyzer {
  constructor() {
    super(XCONTENTTYPE_HEADER_MISSING, XCONTENTTYPEOPTIONS_HEADER_NAME);
  }

  _isVulnerableFromRequestAndResponse(req, res: { getHeader: (arg0: string) => any }) {
    const headerToCheck = res.getHeader(XCONTENTTYPEOPTIONS_HEADER_NAME);
    return !headerToCheck || headerToCheck.trim().toLowerCase() !== 'nosniff';
  }
}

export default new XcontenttypeHeaderMissingAnalyzer();
