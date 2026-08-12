const PLAYABLE_GAME_NOTE_TYPES = new Set([0, 1, 2, 4, 5, 10, 11]);

export function projectPlayableSpecs(noteBatches, getSourceIdentity) {
  const specs = [];
  for (const batch of noteBatches) {
    const directionalGroups = directionalGroupsForBatch(
      batch.informationList,
      getSourceIdentity,
    );
    for (const record of batch.informationList) {
      if (
        record.ccNum === 3
        || record.ccNum === 8
        || record.gameNoteAdditionalType === 4
        || !PLAYABLE_GAME_NOTE_TYPES.has(record.gameNoteType)
      ) {
        continue;
      }
      if (
        (record.gameNoteType === 4 || record.gameNoteType === 5)
        && !record.isSlideNoteHead
        && record.slideNoteList.length === 0
      ) {
        continue;
      }
      const directionalGroup = directionalGroups.get(record);
      if (directionalGroup !== undefined && directionalGroup.representative !== record) {
        continue;
      }
      specs.push(projectRecord(record, directionalGroup, getSourceIdentity));
    }
  }
  return specs;
}

export function chartPosition(beat) {
  const position = Math.round(Number(beat) * 48);
  if (Math.abs(Number(beat) * 48 - position) > 1e-6) {
    throw new Error(`chart beat does not map to a 1/48-beat cell: ${beat}`);
  }
  return position;
}

export function compareMultiset(expected, actual, label) {
  const expectedCounts = countSignatures(expected);
  const actualCounts = countSignatures(actual);
  const missing = differenceCount(expectedCounts, actualCounts);
  const extra = differenceCount(actualCounts, expectedCounts);
  if (missing !== 0 || extra !== 0) {
    throw new Error(
      `${label}: missing=${missing}, extra=${extra}, firstMissing=${firstDifference(expectedCounts, actualCounts)}, firstExtra=${firstDifference(actualCounts, expectedCounts)}`,
    );
  }
}

export function assertSlideSubsequences(sourceSpecs, runtimeSpecs, label) {
  const unmatchedRuntime = runtimeSpecs
    .filter((spec) => spec.kind === "slide")
    .map(slideSignature);
  for (const source of sourceSpecs.filter((spec) => spec.kind === "slide")) {
    const sourcePath = slideSignature(source);
    const matchingIndex = unmatchedRuntime.findIndex((runtimePath) => (
      equalSignature(sourcePath[0], runtimePath[0])
      && equalSignature(sourcePath.at(-1), runtimePath.at(-1))
      && isSubsequence(sourcePath, runtimePath)
    ));
    if (matchingIndex < 0) {
      throw new Error(`${label}: source Slide path is missing`);
    }
    unmatchedRuntime.splice(matchingIndex, 1);
  }
  if (unmatchedRuntime.length !== 0) {
    throw new Error(`${label}: unmatched runtime Slide paths=${unmatchedRuntime.length}`);
  }
}

export function assertWideSlideMainPaths(chartSlides, sourceSpecs) {
  const chartMainPaths = chartSlides
    .map(chartWideSlidePath)
    .filter((path) => path.length > 1);
  const unmatchedSource = sourceSpecs
    .filter((spec) => spec.kind === "slide")
    .map((spec) => slideSignature(spec).map(([position, lanes]) => [position, lanes]));
  for (const chartPath of chartMainPaths) {
    const matchingIndex = unmatchedSource.findIndex((sourcePath) => (
      equalSignature(
        chartPath.map(([position]) => position),
        sourcePath.map(([position]) => position),
      )
      && chartPath.every(([, chartLanes], index) => {
        const sourceLanes = sourcePath[index]?.[1] ?? [];
        return chartLanes.every((lane) => sourceLanes.includes(lane));
      })
    ));
    if (matchingIndex < 0) {
      throw new Error("HABAHIRO Slide main path is missing");
    }
    unmatchedSource.splice(matchingIndex, 1);
  }
  if (unmatchedSource.length !== 0) {
    throw new Error(`unmatched HABAHIRO source Slide paths=${unmatchedSource.length}`);
  }
}

export function slideSignature(spec) {
  return spec.slideNodes.map((node) => [
    node.position,
    [...node.lanes].sort((left, right) => left - right),
    node.invisible,
  ]);
}

export function maxNoteCount(specs) {
  let count = 0;
  for (const spec of specs) {
    count += 1;
    if (spec.kind === "long") {
      count += 1;
    } else if (spec.kind === "slide") {
      count += spec.slideNodes
        .slice(1)
        .filter((node) => !node.invisible)
        .length;
    }
  }
  return count;
}

export function countKinds(specs) {
  return Object.fromEntries([...countValues(specs.map((spec) => spec.kind)).entries()]);
}

export function countValues(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export function sourceLanes(record, getSourceIdentity) {
  const identity = getSourceIdentity(record);
  if (identity.ccNums.length > 0) {
    return [...new Set(identity.ccNums.map(laneFromCc))]
      .sort((left, right) => left - right);
  }
  const buttons = record.buttonTypesArray.length > 0
    ? record.buttonTypesArray
    : record.buttonTypes.length > 0
      ? record.buttonTypes
      : [record.buttonType];
  const lanes = [...new Set(buttons)].sort((left, right) => left - right);
  if (lanes.some((lane) => lane < 0 || lane > 6)) {
    throw new Error(`playable button lanes escaped 0..6: ${JSON.stringify(lanes)}`);
  }
  return lanes;
}

export function sourceEndLanes(record, getSourceIdentity) {
  const identity = getSourceIdentity(record);
  if (identity.afterCcNums.length > 0) {
    return [...new Set(identity.afterCcNums.map(laneFromCc))]
      .sort((left, right) => left - right);
  }
  return sourceLanes(record, getSourceIdentity);
}

function projectRecord(record, directionalGroup, getSourceIdentity) {
  const lanes = directionalGroup?.lanes
    ?? sourceLanes(record, getSourceIdentity);
  const common = {
    position: record.absolutePos,
    lanes,
    rootAdditionalType: record.gameNoteAdditionalType,
    endAdditionalType: 0,
    afterNoteType: record.afterNoteType >= 0 ? record.afterNoteType : null,
    slideNodes: [],
  };
  if (record.gameNoteType === 0) {
    return { ...common, kind: "normal" };
  }
  if (record.gameNoteType === 2) {
    return { ...common, kind: "flick" };
  }
  if (record.gameNoteType === 10 || record.gameNoteType === 11) {
    return {
      ...common,
      kind: record.gameNoteType === 10
        ? "directional_flick_left"
        : "directional_flick_right",
      directionalAnchorLane: anchorLane(record, getSourceIdentity),
    };
  }
  if (record.gameNoteType === 1) {
    return {
      ...common,
      kind: "long",
      endPosition: record.afterNoteAbsolutePos,
      endLanes: sourceEndLanes(record, getSourceIdentity),
      endAdditionalType: record.gameNoteAdditionalTypeLongNoteEnd,
    };
  }
  const slideRecords = [record, ...record.slideNoteList];
  const slideNodes = slideRecords.map((node, index) => ({
    position: node.absolutePos,
    lanes: sourceLanes(node, getSourceIdentity),
    invisible: index === 0 ? false : node.isInvisible,
  }));
  const terminal = slideRecords.at(-1);
  return {
    ...common,
    kind: "slide",
    endPosition: terminal.absolutePos,
    endLanes: sourceLanes(terminal, getSourceIdentity),
    endAdditionalType: terminal.gameNoteAdditionalType,
    slideNodes,
  };
}

function directionalGroupsForBatch(records, getSourceIdentity) {
  const groupsByRecord = new Map();
  for (const gameNoteType of [10, 11]) {
    const byLane = new Map();
    for (const record of records) {
      if (record.gameNoteType === gameNoteType) {
        byLane.set(anchorLane(record, getSourceIdentity), record);
      }
    }
    let component = [];
    let previousLane = null;
    for (const [lane, record] of [...byLane.entries()].sort(
      ([left], [right]) => left - right,
    )) {
      if (previousLane !== null && lane !== previousLane + 1) {
        registerDirectionalGroup(component, gameNoteType, groupsByRecord, getSourceIdentity);
        component = [];
      }
      component.push(record);
      previousLane = lane;
    }
    registerDirectionalGroup(component, gameNoteType, groupsByRecord, getSourceIdentity);
  }
  return groupsByRecord;
}

function registerDirectionalGroup(
  component,
  gameNoteType,
  groupsByRecord,
  getSourceIdentity,
) {
  if (component.length === 0) {
    return;
  }
  const representative = gameNoteType === 10
    ? component.at(-1)
    : component[0];
  const lanes = [...new Set(component.flatMap(
    (record) => sourceLanes(record, getSourceIdentity),
  ))].sort((left, right) => left - right);
  const group = { representative, lanes };
  for (const record of component) {
    groupsByRecord.set(record, group);
  }
}

function anchorLane(record, getSourceIdentity) {
  const identity = getSourceIdentity(record);
  return identity.ccNums.length > 0
    ? laneFromCc(record.ccNum)
    : record.buttonType;
}

function laneFromCc(ccNum) {
  const lane = new Map([
    [11, 1],
    [12, 2],
    [13, 3],
    [14, 4],
    [15, 5],
    [16, 0],
    [18, 6],
  ]).get(ccNum % 20);
  if (lane === undefined) {
    throw new Error(`unsupported multi-range CC: ${ccNum}`);
  }
  return lane;
}

function chartWideSlidePath(event) {
  const positions = [];
  for (const connection of event.connections) {
    const position = chartPosition(connection.beat);
    let current = positions.at(-1);
    if (current === undefined || current[0] !== position) {
      current = [position, []];
      positions.push(current);
    }
    if (!current[1].includes(connection.lane)) {
      current[1].push(connection.lane);
      current[1].sort((left, right) => left - right);
    }
  }
  return positions;
}

function countSignatures(values) {
  const counts = new Map();
  for (const value of values) {
    const signature = JSON.stringify(value);
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }
  return counts;
}

function differenceCount(left, right) {
  let count = 0;
  for (const [signature, value] of left) {
    count += Math.max(0, value - (right.get(signature) ?? 0));
  }
  return count;
}

function firstDifference(left, right) {
  for (const [signature, value] of left) {
    if (value > (right.get(signature) ?? 0)) {
      return signature;
    }
  }
  return "none";
}

function isSubsequence(source, expanded) {
  let sourceIndex = 0;
  for (const item of expanded) {
    if (
      sourceIndex < source.length
      && equalSignature(source[sourceIndex], item)
    ) {
      sourceIndex += 1;
    }
  }
  return sourceIndex === source.length;
}

function equalSignature(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
