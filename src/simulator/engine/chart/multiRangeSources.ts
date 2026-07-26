import type {
  NoteBatchInformation,
  NoteInformation,
} from "./types";

export interface MultiRangeSourceIdentity {
  readonly ccNums: readonly number[];
  readonly afterCcNums: readonly number[];
}

const sourceIdentityByNote = new WeakMap<NoteInformation, MultiRangeSourceIdentity>();

export function registerMultiRangeSources(
  batches: readonly NoteBatchInformation[],
  isMultiRange: boolean,
): void {
  for (const batch of batches) {
    for (const note of batch.informationList) {
      const ccNums = isMultiRange && multiRangeLaneFromCc(note.ccNum) !== null
        ? [note.ccNum]
        : [];
      sourceIdentityByNote.set(note, { ccNums, afterCcNums: [] });
    }
  }
}

export function getMultiRangeSourceIdentity(
  note: NoteInformation,
): MultiRangeSourceIdentity {
  return sourceIdentityByNote.get(note) ?? { ccNums: [], afterCcNums: [] };
}

export function mergeMultiRangeSourceIdentity(
  target: NoteInformation,
  source: NoteInformation,
): void {
  const targetIdentity = getMultiRangeSourceIdentity(target);
  const sourceIdentity = getMultiRangeSourceIdentity(source);
  sourceIdentityByNote.set(target, {
    ccNums: sortedUnique([...targetIdentity.ccNums, ...sourceIdentity.ccNums]),
    afterCcNums: sortedUnique([
      ...targetIdentity.afterCcNums,
      ...sourceIdentity.afterCcNums,
    ]),
  });
}

export function setMultiRangeAfterSourceIdentity(
  root: NoteInformation,
  terminal: NoteInformation,
): void {
  const rootIdentity = getMultiRangeSourceIdentity(root);
  const terminalIdentity = getMultiRangeSourceIdentity(terminal);
  sourceIdentityByNote.set(root, {
    ccNums: rootIdentity.ccNums,
    afterCcNums: terminalIdentity.ccNums,
  });
}

export function multiRangeLaneFromCc(ccNum: number): number | null {
  return new Map<number, number>([
    [11, 1],
    [12, 2],
    [13, 3],
    [14, 4],
    [15, 5],
    [16, 0],
    [18, 6],
  ]).get(ccNum % 20) ?? null;
}

function sortedUnique(values: readonly number[]): readonly number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}
