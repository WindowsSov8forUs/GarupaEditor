import type {
  NoteInformation,
} from "./types";

export interface MultiRangeSourceIdentity {
  readonly ccNums: readonly number[];
  readonly afterCcNums: readonly number[];
}

const sourceIdentityByNote = new WeakMap<NoteInformation, MultiRangeSourceIdentity>();

export function getMultiRangeSourceIdentity(
  note: NoteInformation,
): MultiRangeSourceIdentity {
  return sourceIdentityByNote.get(note) ?? { ccNums: [], afterCcNums: [] };
}

export function registerMultiRangeSourceIdentity(
  note: NoteInformation,
  identity: MultiRangeSourceIdentity,
): void {
  sourceIdentityByNote.set(note, {
    ccNums: sortedUnique(identity.ccNums),
    afterCcNums: sortedUnique(identity.afterCcNums),
  });
}

function sortedUnique(values: readonly number[]): readonly number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}
