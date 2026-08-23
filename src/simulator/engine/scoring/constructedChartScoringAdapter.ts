import {
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  type ChartConstructionResult,
  type NoteInformation,
} from "../chart/types";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";
import {
  NORMALIZED_SCORE_RULESET_ID,
  type SimulatorScoringPhase,
  type SimulatorScoringPlan,
  type SimulatorScoringUnit,
} from "./contracts";
import {
  calculateNormalizedScoreMaximum,
  calculatePerfectQuota,
} from "./normalizedScoreRule";
import { getGarupaProductChartProfile } from "../garupa/productChartProfile";

interface Candidate {
  readonly source: NoteInformation;
  readonly aliases: NoteInformation[];
  readonly phase: SimulatorScoringPhase;
  readonly absolutePosition: number;
  readonly groupIdentity: string | null;
}

export function createConstructedChartScoringPlan(
  chart: ChartConstructionResult,
): SimulatorResult<SimulatorScoringPlan> {
  const candidates: Candidate[] = [];
  const productProfile = getGarupaProductChartProfile(chart);
  const multipleDirectionalIdentities = createMultipleDirectionalIdentityMap(chart);
  const multipleDirectionalGroups = new Map<string, Candidate>();
  if (productProfile?.route === "product-extension") {
    for (const node of productProfile.visibleNodes) {
      const source = node.scoringSource;
      if (source === null) continue;
      candidates.push({
        source,
        aliases: [source],
        phase: "head",
        absolutePosition: node.absolutePosition,
        groupIdentity: null,
      });
    }
  } else for (const batch of chart.noteBatches) {
    for (const source of batch.informationList) {
      if (!isScoringRoot(source)) continue;
      const groupIdentity = multipleDirectionalIdentities.get(source) ?? null;
      if (groupIdentity !== null) {
        const existing = multipleDirectionalGroups.get(groupIdentity);
        if (existing !== undefined) {
          existing.aliases.push(source);
          continue;
        }
      }
      const head: Candidate = {
        source,
        aliases: [source],
        phase: "head" as const,
        absolutePosition: source.absolutePos,
        groupIdentity,
      };
      candidates.push(head);
      if (groupIdentity !== null) multipleDirectionalGroups.set(groupIdentity, head);
      if (source.gameNoteType === GameNoteType.Long) {
        candidates.push({
          source,
          aliases: [source],
          phase: "tail" as const,
          absolutePosition: source.afterNoteAbsolutePos,
          groupIdentity: null,
        });
      }
      if (source.gameNoteType === GameNoteType.SlideA ||
          source.gameNoteType === GameNoteType.SlideB) {
        const visible = source.slideNoteList.filter((child) => !child.isInvisible);
        for (let index = 0; index < visible.length; index += 1) {
          const child = visible[index]!;
          candidates.push({
            source: child,
            aliases: [child],
            phase: index === visible.length - 1 ? "tail" as const : "intermediate" as const,
            absolutePosition: child.absolutePos,
            groupIdentity: null,
          });
        }
      }
    }
  }
  if (candidates.length === 0 || candidates.length > 0x7fffffff) {
    return integrityFailure(
      "score.plan.invalid-scoring-unit-count",
      [],
      "CS-V1 requires a positive Int32 count derived only from chart-owned scoring units.",
    );
  }
  candidates.sort(compareCandidate);
  for (let index = 1; index < candidates.length; index += 1) {
    if (sameOrderingIdentity(candidates[index - 1]!, candidates[index]!)) {
      return integrityFailure(
        "score.plan.ambiguous-unit-order",
        [],
        "CS-V1 refuses chart scoring units whose absolute position, chart-owned note index and judgement phase cannot establish a unique ordinal.",
      );
    }
  }
  const scoreMaximum = calculateNormalizedScoreMaximum(candidates.length);
  if (scoreMaximum === null) {
    return integrityFailure(
      "score.plan.invalid-score-maximum",
      [],
      "CS-V1 scoreMaximum must be the exact UInt32 sum of ten million and the chart-owned scoring-unit count.",
    );
  }
  const bySource = new WeakMap<NoteInformation, Map<SimulatorScoringPhase, SimulatorScoringUnit>>();
  const byId = new Map<string, SimulatorScoringUnit>();
  const units: SimulatorScoringUnit[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const ordinal = index + 1;
    const perfectQuota = calculatePerfectQuota(ordinal, candidates.length);
    if (perfectQuota === null) {
      return integrityFailure(
        "score.plan.invalid-perfect-quota",
        [],
        "Every CS-V1 scoring ordinal must derive one positive exact-integer Perfect quota.",
      );
    }
    const id = scoringUnitId(candidate);
    if (byId.has(id)) {
      return integrityFailure(
        "score.plan.duplicate-unit-identity",
        [],
        "Chart-owned scoring fields must produce one unique stable CS-V1 identity per judgement phase.",
      );
    }
    const unit = Object.freeze({ id, ordinal, perfectQuota });
    for (const alias of candidate.aliases) {
      let phases = bySource.get(alias);
      if (phases === undefined) {
        phases = new Map();
        bySource.set(alias, phases);
      }
      if (phases.has(candidate.phase)) {
        return integrityFailure(
          "score.plan.duplicate-source-phase",
          [],
          "One chart-owned NoteInformation and judgement phase may resolve to exactly one CS-V1 scoring unit.",
        );
      }
      phases.set(candidate.phase, unit);
    }
    byId.set(id, unit);
    units.push(unit);
  }
  const frozenUnits = Object.freeze(units);
  const plan: SimulatorScoringPlan = Object.freeze({
    ruleSetId: NORMALIZED_SCORE_RULESET_ID,
    totalScoringUnitCount: frozenUnits.length,
    scoreMaximum,
    units: frozenUnits,
    resolve: (source: NoteInformation, phase: SimulatorScoringPhase) => {
      const unit = source !== null && typeof source === "object"
        ? bySource.get(source)?.get(phase)
        : undefined;
      return unit === undefined
        ? integrityFailure(
            "score.plan.foreign-source-or-phase",
            [],
            "Only an exact chart-owned source and its registered judgement phase can resolve a CS-V1 scoring unit.",
          )
        : ok(unit);
    },
    getById: (id: string) => byId.get(id),
  });
  return ok(plan);
}

function isScoringRoot(source: NoteInformation): boolean {
  return source.gameNoteType !== GameNoteType.None &&
    source.gameNoteAdditionalType !== GameNoteAdditionalType.LaneChange &&
    !(source.fireNoteType >= FrontNoteType.LongMultipleDirectionalFlickAdd &&
      source.fireNoteType <= FrontNoteType.SlideBMultipleDirectionalFlickAdd);
}

function compareCandidate(left: Candidate, right: Candidate): number {
  const position = left.absolutePosition - right.absolutePosition;
  if (position !== 0) return position;
  const leftIdentity = candidateOrderingIdentity(left);
  const rightIdentity = candidateOrderingIdentity(right);
  const identity = leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0;
  return identity || phaseOrder(left.phase) - phaseOrder(right.phase);
}

function sameOrderingIdentity(left: Candidate, right: Candidate): boolean {
  return left.absolutePosition === right.absolutePosition &&
    candidateOrderingIdentity(left) === candidateOrderingIdentity(right) &&
    left.phase === right.phase;
}

function phaseOrder(phase: SimulatorScoringPhase): number {
  return phase === "head" ? 0 : phase === "intermediate" ? 1 : 2;
}

function scoringUnitId(candidate: Candidate): string {
  return `score-unit:${candidate.absolutePosition}:${candidateOrderingIdentity(candidate)}:${candidate.phase}`;
}

function candidateOrderingIdentity(candidate: Candidate): string {
  if (candidate.groupIdentity !== null) return candidate.groupIdentity;
  const source = candidate.source;
  return `note:${source.index}:${source.buttonType}:${source.halfButtonIndex}:${source.gameNoteType}:${source.fireNoteType}`;
}

function createMultipleDirectionalIdentityMap(
  chart: ChartConstructionResult,
): WeakMap<NoteInformation, string> {
  const identities = new WeakMap<NoteInformation, string>();
  for (const batch of chart.noteBatches) {
    const groups: NoteInformation[][] = [];
    let current: NoteInformation[] = [];
    for (const source of batch.informationList) {
      if (source.gameNoteType === GameNoteType.None ||
          source.gameNoteAdditionalType === GameNoteAdditionalType.LaneChange) continue;
      if (source.fireNoteType !== FrontNoteType.MultipleDirectionalFlick) {
        if (current.length > 0) groups.push(current);
        current = [];
        continue;
      }
      const previous = current[current.length - 1];
      if (previous !== undefined && previous.gameNoteType === source.gameNoteType &&
          Math.abs(previous.buttonType - source.buttonType) === 1) {
        current.push(source);
      } else {
        if (current.length > 0) groups.push(current);
        current = [source];
      }
    }
    if (current.length > 0) groups.push(current);
    for (const group of groups) {
      const first = group[0]!;
      const identity = `multiple-directional:${first.absolutePos}:${first.gameNoteType}:` +
        group.map((source) => `${source.index}.${source.buttonType}`).join("-");
      for (const source of group) identities.set(source, identity);
    }
  }
  return identities;
}
