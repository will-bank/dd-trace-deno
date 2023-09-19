function contains(rangeContainer: { start: number; end: number }, rangeContained: { start: number; end: number }) {
  if (rangeContainer.start > rangeContained.start) {
    return false;
  }
  return rangeContainer.end >= rangeContained.end;
}

function intersects(rangeA: { end: number; start: number }, rangeB: { start: number; end: number }) {
  return rangeB.start < rangeA.end && rangeB.end > rangeA.start;
}

function remove(range: { start: number; end: number }, rangeToRemove: { start: number; end: number }) {
  if (!intersects(range, rangeToRemove)) {
    return [range];
  } else if (contains(rangeToRemove, range)) {
    return [];
  } else {
    const result: ({ start: any; end: any })[] = [];
    if (rangeToRemove.start > range.start) {
      const offset = rangeToRemove.start - range.start;
      result.push({ start: range.start, end: range.start + offset });
    }
    if (rangeToRemove.end < range.end) {
      const offset = range.end - rangeToRemove.end;
      result.push({ start: rangeToRemove.end, end: rangeToRemove.end + offset });
    }
    return result;
  }
}

export { contains, intersects, remove };
