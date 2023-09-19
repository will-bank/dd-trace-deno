function addMetricsToSpan(rootSpan: { addTags: (arg0: { [x: string]: any }) => void }, metrics: any[], tagPrefix) {
  if (!rootSpan || !rootSpan.addTags || !metrics) return;


  const flattenMap = new Map();
  metrics
    .filter((data: { metric: any }) => data && data.metric)
    .forEach((data) => {
      const name = taggedMetricName(data);
      let total = flattenMap.get(name);
      const value = flatten(data);
      if (!total) {
        total = value;
      } else {
        total += value;
      }
      flattenMap.set(name, total);
    });

  for (const [key, value] of flattenMap) {
    const tagName = `${tagPrefix}.${key}`;
    rootSpan.addTags({
      [tagName]: value,
    });
  }
}

function flatten(metricData: { points: any[] }) {
  return metricData.points &&
    metricData.points.map((point: any[]) => point[1]).reduce((total, value) => total + value, 0);
}

function taggedMetricName(data: { metric: any; tags: any }) {
  const metric = data.metric;
  const tags = data.tags && filterTags(data.tags);
  return !tags || !tags.length ? metric : `${metric}.${processTagValue(tags)}`;
}

function filterTags(tags: any[]) {
  return tags.filter((tag: { startsWith: (arg0: string) => any }) =>
    !tag.startsWith('lib_language') && !tag.startsWith('version')
  );
}

function processTagValue(tags: any[]) {
  return tags.map((tag: { includes: (arg0: string) => any; split: (arg0: string) => any[] }) =>
    tag.includes(':') ? tag.split(':')[1] : tag
  )
    .join('_').replace(/\./g, '_');
}

export { addMetricsToSpan, filterTags };
