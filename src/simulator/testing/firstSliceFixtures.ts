import type {
  NoteBatchInformation,
  NoteFamily,
  NoteInformationFixture,
} from "../engine/data/noteData";
import type {
  EvidenceBound,
  EvidenceId,
  EvidenceReference,
} from "../engine/evidence";
import type { SimulatorEngineInput } from "../host/contracts";

export function evidence(
  id: EvidenceId,
  assertion: string,
): EvidenceReference {
  return { id, assertion };
}

export function bound<T>(
  value: T,
  ...references: readonly EvidenceReference[]
): EvidenceBound<T> {
  return { value, evidence: references };
}

export function noteFixture(
  fixtureId: string,
  sourceOrder: number,
  family: NoteFamily = "normal",
): NoteInformationFixture {
  const batchEvidence = evidence("E10", `preconstructed fixture ${fixtureId}`);
  const familyEvidence = evidence("E02", `confirmed Note family ${family}`);
  return {
    fixtureId,
    sourceOrder,
    family: bound(family, familyEvidence),
    gameNoteType: bound(0, batchEvidence),
    frontNoteType: bound(0, batchEvidence),
    afterNoteType: bound(0, batchEvidence),
    barIndex: bound(0, batchEvidence),
    absolutePosition: bound(0, batchEvidence),
  };
}

export function noteBatch(
  fixtureId: string,
  noteIds: readonly string[],
): NoteBatchInformation {
  const batchEvidence = evidence("E10", `preconstructed batch ${fixtureId}`);
  return {
    fixtureId,
    barIndex: bound(0, batchEvidence),
    numerator: bound(0, batchEvidence),
    denominator: bound(1, batchEvidence),
    informationList: noteIds.map((noteId, sourceOrder) =>
      noteFixture(noteId, sourceOrder),
    ),
  };
}

export function engineInput(
  noteBatches: readonly NoteBatchInformation[] = [],
): SimulatorEngineInput {
  const clockEvidence = evidence("E03", "first-slice clock fixture");
  const schedulerClosureEvidence = evidence(
    "E14",
    "closed G01 and G06 scheduler behavior",
  );
  const oneFrameEvidence = evidence("E08", "first-slice OneFrameData fixture");
  return {
    noteBatches,
    clock: {
      currentBpm: bound(120, clockEvidence),
      nextBpm: bound(120, schedulerClosureEvidence),
      initialMusicPosition: bound(
        { bar: 0, beatProgress: 0 },
        clockEvidence,
      ),
      initialLauncherMusicPosition: bound(
        { bar: 0, beatProgress: 96 },
        schedulerClosureEvidence,
      ),
    },
    noteManager: {
      bpmChangeCount: bound(1, schedulerClosureEvidence),
    },
    oneFrameData: {
      capacity: bound(4, oneFrameEvidence),
    },
  };
}
