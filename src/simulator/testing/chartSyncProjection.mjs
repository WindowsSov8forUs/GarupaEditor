const PLAYABLE_GAME_NOTE_TYPES = new Set([0, 1, 2, 4, 5, 10, 11]);
const MULTIPLE_AFTER_NOTE_TYPES = new Set([4, 5, 11, 12]);

export function projectSyncConnectionCount(noteBatches, getSourceIdentity) {
  const projectedBatches = noteBatches.map((batch) => ({
    absolutePos: batch.absolutePos,
    specs: projectBatch(batch.informationList, getSourceIdentity),
  }));
  const candidates = [];
  let connectionCount = 0;

  for (const batch of projectedBatches) {
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      if (candidates[index].absolutePos < batch.absolutePos) {
        candidates.splice(index, 1);
      }
    }
    let previousFront = null;
    for (const spec of batch.specs) {
      const candidateIndex = candidates.findIndex(
        (candidate) => candidate.absolutePos === batch.absolutePos,
      );
      if (candidateIndex >= 0) {
        candidates.splice(candidateIndex, 1);
        connectionCount += 1;
      } else if (previousFront !== null) {
        connectionCount += 1;
      }
      previousFront = spec;
      if (
        spec.endAbsolutePos !== null
        && spec.afterNoteType !== null
        && spec.endAbsolutePos > batch.absolutePos
      ) {
        candidates.push({
          absolutePos: spec.endAbsolutePos,
          afterNoteType: spec.afterNoteType,
        });
      }
    }

    const arriving = candidates.filter(
      (candidate) => candidate.absolutePos === batch.absolutePos,
    );
    if (arriving.length >= 2) {
      const [first, second] = arriving;
      connectionCount += 1;
      if (
        !MULTIPLE_AFTER_NOTE_TYPES.has(first.afterNoteType)
        && !MULTIPLE_AFTER_NOTE_TYPES.has(second.afterNoteType)
      ) {
        candidates.splice(candidates.indexOf(first), 1);
        candidates.splice(candidates.indexOf(second), 1);
      }
    }
  }

  return connectionCount;
}

function projectBatch(records, getSourceIdentity) {
  const directionalRepresentatives = findDirectionalRepresentatives(
    records,
    getSourceIdentity,
  );
  const specs = [];
  for (const record of records) {
    if (record.ccNum === 3 || record.ccNum === 8) {
      continue;
    }
    if (record.gameNoteAdditionalType === 4) {
      continue;
    }
    if (!PLAYABLE_GAME_NOTE_TYPES.has(record.gameNoteType)) {
      continue;
    }
    if (
      (record.gameNoteType === 4 || record.gameNoteType === 5)
      && !record.isSlideNoteHead
      && record.slideNoteList.length === 0
    ) {
      continue;
    }
    if (
      (record.gameNoteType === 10 || record.gameNoteType === 11)
      && directionalRepresentatives.get(record) !== record
    ) {
      continue;
    }
    const terminal = record.slideNoteList.at(-1);
    specs.push({
      afterNoteType: record.afterNoteType >= 0 ? record.afterNoteType : null,
      endAbsolutePos: record.gameNoteType === 1
        ? record.afterNoteAbsolutePos
        : terminal?.absolutePos ?? null,
    });
  }
  return specs;
}

function findDirectionalRepresentatives(records, getSourceIdentity) {
  const representatives = new Map();
  for (const gameNoteType of [10, 11]) {
    const byLane = new Map();
    for (const record of records) {
      if (record.gameNoteType !== gameNoteType) {
        continue;
      }
      byLane.set(anchorLane(record, getSourceIdentity), record);
    }
    let component = [];
    let previousLane = null;
    for (const [lane, record] of [...byLane.entries()].sort(
      ([left], [right]) => left - right,
    )) {
      if (previousLane !== null && lane !== previousLane + 1) {
        registerDirectionalComponent(component, gameNoteType, representatives);
        component = [];
      }
      component.push(record);
      previousLane = lane;
    }
    registerDirectionalComponent(component, gameNoteType, representatives);
  }
  return representatives;
}

function registerDirectionalComponent(component, gameNoteType, representatives) {
  if (component.length === 0) {
    return;
  }
  const representative = gameNoteType === 10
    ? component.at(-1)
    : component[0];
  for (const record of component) {
    representatives.set(record, representative);
  }
}

function anchorLane(record, getSourceIdentity) {
  const sourceIdentity = getSourceIdentity(record);
  if (sourceIdentity.ccNums.length > 0) {
    return laneFromCc(record.ccNum);
  }
  return record.buttonType;
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
    throw new Error(`unsupported multi-range anchor CC: ${ccNum}`);
  }
  return lane;
}
