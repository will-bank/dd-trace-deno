import sensitiveHandler from './evidence-redaction/sensitive-handler.ts';

class VulnerabilityFormatter {
  private _redactVulnearbilities: boolean;
  constructor() {
    this._redactVulnearbilities = true;
  }

  setRedactVulnerabilities(shouldRedactVulnerabilities: boolean) {
    this._redactVulnearbilities = shouldRedactVulnerabilities;
  }

  extractSourcesFromVulnerability(vulnerability: { evidence: { ranges: any[] } }) {
    if (!vulnerability.evidence.ranges) {
      return [];
    }
    return vulnerability.evidence.ranges.map((
      range: { iinfo: { type: any; parameterName: any; parameterValue: any } },
    ) => (
      {
        origin: range.iinfo.type,
        name: range.iinfo.parameterName,
        value: range.iinfo.parameterValue,
      }
    ));
  }


  getRedactedValueParts(
    type,
    evidence: { ranges: any; value: any },
    sourcesIndexes: { [x: string]: any },
    sources: { [x: string]: { value: any } },
  ) {
    const scrubbingResult = sensitiveHandler.scrubEvidence(type, evidence, sourcesIndexes, sources);
    if (scrubbingResult) {
      const { redactedValueParts, redactedSources } = scrubbingResult;
      redactedSources.forEach((i: string | number) => {
        delete sources[i].value;
      });
      return { valueParts: redactedValueParts };
    }

    return this.getUnredactedValueParts(evidence, sourcesIndexes);
  }

  getUnredactedValueParts(evidence: { ranges: any[]; value: string }, sourcesIndexes: { [x: string]: any }) {
    const valueParts: ({ value: any } | { value: any; source: any })[] = [];
    let fromIndex = 0;
    evidence.ranges.forEach((range: { start: number; end: number }, rangeIndex: string | number) => {
      if (fromIndex < range.start) {
        valueParts.push({ value: evidence.value.substring(fromIndex, range.start) });
      }
      valueParts.push({ value: evidence.value.substring(range.start, range.end), source: sourcesIndexes[rangeIndex] });
      fromIndex = range.end;
    });
    if (fromIndex < evidence.value.length) {
      valueParts.push({ value: evidence.value.substring(fromIndex) });
    }
    return { valueParts };
  }


  formatEvidence(type, evidence: { ranges: any; value: any }, sourcesIndexes: any[], sources: any[]) {
    if (!evidence.ranges) {
      if (typeof evidence.value === 'undefined') {
        return undefined;
      } else {
        return { value: evidence.value };
      }
    }

    return this._redactVulnearbilities

      ? this.getRedactedValueParts(type, evidence, sourcesIndexes, sources)
      : this.getUnredactedValueParts(evidence, sourcesIndexes);
  }

  formatVulnerability(
    vulnerability: { type: any; hash: any; evidence: any; location: { spanId: any; path: any; line: any } },
    sourcesIndexes: any[],
    sources: any[],
  ) {
    const formattedVulnerability = {
      type: vulnerability.type,
      hash: vulnerability.hash,
      evidence: this.formatEvidence(vulnerability.type, vulnerability.evidence, sourcesIndexes, sources),
      location: {
        spanId: vulnerability.location.spanId,
      },
    };
    if (vulnerability.location.path) {

      formattedVulnerability.location.path = vulnerability.location.path;
    }
    if (vulnerability.location.line) {

      formattedVulnerability.location.line = vulnerability.location.line;
    }
    return formattedVulnerability;
  }

  toJson(vulnerabilitiesToFormat: any[]) {
    const sources: any[] = [];

    const vulnerabilities = vulnerabilitiesToFormat.map((vulnerability) => {
      const vulnerabilitySources = this.extractSourcesFromVulnerability(vulnerability);

      const sourcesIndexes = [];
      vulnerabilitySources.forEach((source: { origin: any; name: any; value: any }) => {

        let sourceIndex = sources.findIndex(
          (existingSource: { origin: any; name: any; value: any }) =>
            existingSource.origin === source.origin &&
            existingSource.name === source.name &&
            existingSource.value === source.value,
        );
        if (sourceIndex === -1) {
          sourceIndex = sources.length;
          sources.push(source);
        }
        sourcesIndexes.push(sourceIndex);
      });


      return this.formatVulnerability(vulnerability, sourcesIndexes, sources);
    });

    return {
      sources,
      vulnerabilities,
    };
  }
}

export default new VulnerabilityFormatter();
