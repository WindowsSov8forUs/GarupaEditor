import { SyncLineConnectionRules, selectDirectionalSyncEndpoints } from "../rendering/syncLineConnectionRules";
import type { HoldSoundEvent } from "../audio/audioCommandProducer";
import type { ManualInputPosition } from "../data/manualInput";

export interface ManualCandidateExtensionFrame {
  readonly reserved: Set<string>;
  readonly selected: Map<number, string | null>;
}
import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteType,
  type ButtonTypeValue,
  type NoteBatchInformation,
  type NoteInformation,
} from "../chart/types";
import {
  directionalEndpointButton,
  directionalEndpointPosition,
  isSameDirectionalGroup,
} from "../chart/noteGraph";
import type { NoteFamily } from "../data/noteData";
import type { OneFrameDataHandle } from "../data/oneFrameData";
import type {
  ManualJudgementOwnership,
  ManualJudgementTransaction,
} from "../data/manualJudgement";
import type { InGameCalculatedData } from "../data/inGameCalculatedData";
import type {
  AutoLiveJudgementOwnership,
  AutoLiveJudgementRequest,
  MultipleDirectionalRuntimeGroup,
} from "../data/autoLiveJudgement";
import {
  integrityFailure,
  ok,
  type SimulatorResult,
} from "../evidence";
import { NoteBase, NoteState } from "../notes/noteBase";
import { NoteBpmChange } from "../notes/noteBpmChange";
import {
  NoteDirectionalFlick,
  NoteFlick,
  NoteLong,
  NoteMultipleDirectionalFlick,
  NoteMultipleDirectionalVisual,
  NoteNormal,
  NoteSlide,
  validateAutoLiveActivationGraph,
  validateAutoLiveChartOwnership,
} from "../notes/noteTypes";
import { SlideNoteManager } from "./slideNoteManager";
import type { InGameMusicScoreController } from "./inGameMusicScoreController";
import type { SimulatorManualInputGeometryBackend } from "../../backends/contracts";
import type {
  DirectionalNotePresentationPlan,
  OrdinaryFixedNoteSceneInput,
  RenderCommandProducer,
  RenderOwnerTransaction,
} from "../rendering/renderCommandProducer";
import type { OrdinaryLongNormalChildState } from "../rendering/ordinaryLongChildLifecycle";
import type { OrdinarySlideChildState } from "../rendering/ordinarySlideChildLifecycle";
import {
  calculateOrdinaryNoteWorldScaleAxis,
  type OrdinaryNoteMotionResult,
  type OrdinaryNoteMotionState,
  type OrdinarySyncLineOwnerState,
} from "../rendering/ordinaryNoteGeometry";
import { createRenderFloat32 } from "../../backends/renderingValidation";

const BPM_POOL_LENGTH = 30;
const SYNC_LINE_POOL_LENGTH = 80;
const MULTIPLE_DIRECTIONAL_LINE_POOL_LENGTH = 60;

export interface NoteManagerClock {
  validateAdvanceSequence(
    deltaTimeSeconds: number,
    substepCount: number,
  ): SimulatorResult<void>;
  setExecuteFrame(executeFrame: number): void;
  advance(deltaTimeSeconds: number): SimulatorResult<void>;
  canActivateBatch(batch: NoteBatchInformation): SimulatorResult<boolean>;
}

export type NotePoolObjectFactory = (
  family: NoteFamily,
  poolObjectId: string,
) => NoteBase;

export interface NotePoolSnapshot {
  readonly family: NoteFamily;
  readonly cursor: number;
  readonly objects: readonly ReturnType<NoteBase["snapshot"]>[];
}

export interface NoteManagerSnapshot {
  readonly batchCount: number;
  readonly nextBatchIndex: number;
  readonly activeNotePoolObjectIds: readonly string[];
  readonly activeBpmPoolIndices: readonly number[];
  readonly bpmPoolCursor: number;
  readonly bpmPool: readonly ReturnType<NoteBpmChange["snapshot"]>[];
  readonly pools: readonly NotePoolSnapshot[];
  readonly slideNoteManagerInitialized: boolean;
  readonly bpmChangeCount: number;
  readonly performanceLevelCounters: readonly number[];
  readonly activeOrdinarySyncLineCount: number;
  readonly suppressedOrdinarySyncLinePairCount: number;
  readonly calculatedData: ReturnType<InGameCalculatedData["snapshot"]>;
}

export type PerformanceLevelCounters = [number, number, number, number];

interface NotePool {
  readonly family: NoteFamily;
  readonly objects: NoteBase[];
  cursor: number;
}

interface ManualSlideSourceOwnership {
  readonly sourceIndex: number;
  readonly phase: "head" | "intermediate" | "tail";
  readonly allowedNoteTypes: readonly number[];
  readonly absolutePosition: number;
  readonly buttonTypes: readonly ButtonTypeValue[];
}

interface NotePoolAcquisition {
  readonly note: NoteBase;
  readonly pool: NotePool;
  readonly nextCursor: number;
}

interface OrdinaryRenderedNoteState {
  readonly motionState: OrdinaryNoteMotionState;
  readonly renderedTransform: OrdinaryNoteMotionResult;
  readonly slideJudgeY?: number;
}

interface ActiveOrdinarySyncLine {
  readonly poolIndex: number;
  readonly targetA: NoteBase;
  readonly targetB: NoteBase;
  readonly afterA: boolean;
  readonly afterB: boolean;
  readonly connectionSequence: number;
}

interface ActiveMultipleDirectionalLine {
  readonly poolIndex: number;
  readonly targetA: NoteBase;
  readonly targetB: NoteBase;
  readonly afterA: boolean;
  readonly afterB: boolean;
  readonly materialDirection: "left" | "right";
}

interface DirectionalVisualTailOwner {
  readonly note: NoteBase;
  readonly information: NoteInformation;
}

export class NoteManager {
  private readonly activeNotesValue: NoteBase[] = [];
  private readonly activeBpmChangesValue: NoteBpmChange[] = [];
  private readonly bpmPoolValue = Array.from(
    { length: BPM_POOL_LENGTH },
    (_, index) => new NoteBpmChange(index),
  );
  private readonly notePoolsValue = new Map<NoteFamily, NotePool>();
  private readonly pendingHoldSounds: HoldSoundEvent[] = [];

  takeHoldSounds(): readonly HoldSoundEvent[] { return this.pendingHoldSounds.splice(0); }
  private readonly performanceLevelCountersValue: PerformanceLevelCounters = [
    0, 0, 0, 0,
  ];
  private nextBatchIndexValue = 0;
  private bpmPoolCursorValue = 0;
  private outerFrameIndexValue = 0;
  private setupComplete = false;
  private readonly multipleDirectionalGroups = new WeakMap<
    NoteInformation,
    MultipleDirectionalGroupOwner
  >();
  private readonly longAfterMultipleGroups = new WeakMap<
    NoteInformation,
    MultipleDirectionalGroupOwner
  >();
  private readonly slideAfterMultipleGroups = new WeakMap<
    NoteInformation,
    MultipleDirectionalGroupOwner
  >();
  private readonly manualSlideSources = new WeakMap<
    NoteInformation,
    ManualSlideSourceOwnership
  >();
  private readonly autoLiveJudgementSources = new WeakSet<NoteInformation>();
  private manualNoteDeactivatedOwner: ((note: NoteBase) => void) | null = null;
  private manualCandidateExtension: ((ordinary: NoteBase | null, slide: NoteBase | null,
    position: ManualInputPosition, projection: ManualCandidateExtensionFrame, fingerId: number) => SimulatorResult<NoteBase | null>) | null = null;
  private readonly ordinaryRenderMotionStates = new WeakMap<
    NoteBase,
    OrdinaryRenderedNoteState
  >();
  private readonly activeOrdinarySyncLines: Array<ActiveOrdinarySyncLine | null> =
    Array.from({ length: SYNC_LINE_POOL_LENGTH }, () => null);
  private suppressedOrdinarySyncLinePairCountValue = 0;
  private readonly pendingSyncTailNotes: NoteBase[] = [];
  private readonly pendingDirectionalSyncTailNotes: NoteBase[] = [];
  private syncConnectionSequence = 0;
  private readonly activeMultipleDirectionalLines: Array<ActiveMultipleDirectionalLine | null> =
    Array.from({ length: MULTIPLE_DIRECTIONAL_LINE_POOL_LENGTH }, () => null);
  private readonly directionalVisualTailOwners = new Map<NoteMultipleDirectionalVisual, {
    readonly left: DirectionalVisualTailOwner | null;
    readonly right: DirectionalVisualTailOwner | null;
  }>();
  private readonly ordinaryLongRenderStates = new Map<
    NoteBase,
    OrdinaryLongNormalChildState
  >();
  private readonly ordinarySlideRenderStates = new Map<
    NoteBase,
    readonly OrdinarySlideChildState[]
  >();

  private readonly syncRules = new SyncLineConnectionRules<NoteBase, ActiveOrdinarySyncLine>({
    pendingTails: this.pendingSyncTailNotes,
    pendingDirectionalTails: this.pendingDirectionalSyncTailNotes,
    position: () => this.musicScoreController.musicPosition,
    hasTail: note => this.ordinaryLongRenderStates.has(note) || this.ordinarySlideRenderStates.has(note),
    lineFor: (note, after) => this.syncLineForEndpoint(note, after),
    connect: (a, afterA, b, afterB, existing) => this.connectSyncEndpoints(a, afterA, b, afterB, existing),
  });
  private extensionSyncConnection: (first: NoteInformation, second: NoteInformation) => boolean = () => true;

  setExtensionSyncConnection(filter: (first: NoteInformation, second: NoteInformation) => boolean): void {
    this.extensionSyncConnection = filter;
  }

  getCommittedNotePresentation(source: NoteInformation) {
    for (const note of this.activeNotesValue) {
      const root = note.noteInformation;
      if (root === null) continue;
      const index = root.slideNoteList.indexOf(source);
      if (root !== source && index < 0) continue;
      const child = index < 0 ? undefined : this.ordinarySlideRenderStates.get(note)?.[index];
      const state = child?.lifecycle ?? this.ordinaryRenderMotionStates.get(note);
      if (state === undefined) return null;
      return {
        position: state.renderedTransform.position,
        localScaleX: state.renderedTransform.localScale.x,
        slideEffectActive: note instanceof NoteSlide && note.flashAnimationRevision !== null,
        lossyScaleX: createRenderFloat32(calculateOrdinaryNoteWorldScaleAxis(
          state.renderedTransform.localScale.x.value, state.motionState.noteParentScale.value,
        )),
        visible: child === undefined ? this.syncEndpointMoving(note, false) : child.visible && child.lifecycle.phase === "move",
      };
    }
    return null;
  }

  constructor(
    private readonly batches: readonly NoteBatchInformation[],
    readonly slideNoteManager: SlideNoteManager,
    private readonly clock: NoteManagerClock,
    private readonly musicScoreController: InGameMusicScoreController,
    private readonly bpmChangeCount: number,
    private readonly judgementAdjustValueB: number,
    readonly inGameCalculatedData: InGameCalculatedData,
    private readonly getUsableOneFrameData: () => SimulatorResult<OneFrameDataHandle>,
    private readonly submitAutoLiveJudgement: (
      request: AutoLiveJudgementRequest,
    ) => SimulatorResult<void>,
    private readonly createPoolObject: NotePoolObjectFactory = createDefaultPoolObject,
    private readonly createManualJudgementTransaction: () => ManualJudgementTransaction =
      createUnavailableManualJudgementTransaction,
    private readonly manualInputGeometry: SimulatorManualInputGeometryBackend =
      unavailableManualInputGeometry,
    private readonly renderProducer: RenderCommandProducer | null = null,
    private readonly ordinaryNoteScene: OrdinaryFixedNoteSceneInput | null = null,
    private readonly isMoveTime: () => boolean = () => false,
  ) {}

  validateSetup(): SimulatorResult<void> {
    const ownershipValidation = validateAutoLiveChartOwnership(this.batches);
    if (ownershipValidation.status !== "ok") {
      return ownershipValidation;
    }
    for (const batch of this.batches) {
      for (const noteInformation of batch.informationList) {
        if (isNonPlayableCommand(noteInformation)) {
          const commandValidation = validateBpmCommand(noteInformation);
          if (commandValidation.status !== "ok") {
            return commandValidation;
          }
          continue;
        }
        const familyValidation = noteFamily(noteInformation);
        if (familyValidation.status !== "ok") {
          return familyValidation;
        }
        const graphValidation = validateAutoLiveActivationGraph(noteInformation);
        if (graphValidation.status !== "ok") {
          return graphValidation;
        }
      }
    }
    return ok(undefined);
  }

  commitHabahiroLaneChangeGeometry(): void {
    this.manualInputGeometry.setHabahiroLaneChanged?.();
  }

  execAwakeEnd(): SimulatorResult<void> {
    const setupValidation = this.validateSetup();
    if (setupValidation.status !== "ok") {
      return setupValidation;
    }
    const slideInitialization = this.slideNoteManager.initialize(this.manualInputGeometry);
    if (slideInitialization.status !== "ok") {
      return slideInitialization;
    }
    return this.setupNotes();
  }

  setupNotes(): SimulatorResult<void> {
    if (this.setupComplete) {
      return ok(undefined);
    }
    const setupValidation = this.validateSetup();
    if (setupValidation.status !== "ok") {
      return setupValidation;
    }

    this.setupMultipleDirectionalGroups();
    const longAfterGroups = this.setupLongAfterMultipleGroups();
    if (longAfterGroups.status !== "ok") {
      return longAfterGroups;
    }
    const slideAfterGroups = this.setupSlideAfterMultipleGroups();
    if (slideAfterGroups.status !== "ok") {
      return slideAfterGroups;
    }
    const familyNotes = new Map<NoteFamily, NoteInformation[]>();
    for (const batch of this.batches) {
      for (const noteInformation of batch.informationList) {
        if (isNonPlayableCommand(noteInformation)) {
          continue;
        }
        this.autoLiveJudgementSources.add(noteInformation);
        if (
          noteInformation.fireNoteType === FrontNoteType.SlideA ||
          noteInformation.fireNoteType === FrontNoteType.SlideB
        ) {
          const slideAfterGroup = this.slideAfterMultipleGroups.get(noteInformation);
          this.manualSlideSources.set(noteInformation, Object.freeze({
            sourceIndex: -1,
            phase: "head",
            allowedNoteTypes: Object.freeze([8]),
            absolutePosition: noteInformation.absolutePos,
            buttonTypes: Object.freeze([...noteInformation.buttonTypesArray]),
          }));
          for (let slideIndex = 0; slideIndex < noteInformation.slideNoteList.length; slideIndex += 1) {
            const source = noteInformation.slideNoteList[slideIndex];
            if (source === undefined) {
              continue;
            }
            this.autoLiveJudgementSources.add(source);
            const terminal = slideIndex === noteInformation.slideNoteList.length - 1;
            const allowedNoteTypes = terminal
              ? manualSlideTerminalNoteTypes(noteInformation.afterNoteType)
              : [8];
            this.manualSlideSources.set(source, Object.freeze({
              sourceIndex: slideIndex,
              phase: terminal ? "tail" : "intermediate",
              allowedNoteTypes: Object.freeze(allowedNoteTypes),
              absolutePosition: source.absolutePos,
              buttonTypes: Object.freeze([
                ...(terminal && slideAfterGroup !== undefined
                  ? slideAfterGroup.buttonTypes
                  : source.buttonTypesArray),
              ]),
            }));
          }
        }
        const familyResult = noteFamily(noteInformation);
        if (familyResult.status !== "ok") {
          return familyResult;
        }
        const family = familyResult.value;
        const notes = familyNotes.get(family) ?? [];
        notes.push(noteInformation);
        familyNotes.set(family, notes);
      }
    }

    const degradedHabahiro = this.renderProducer?.isDegradedHabahiro() ?? false;
    const requiresMeshChildren = this.renderProducer !== null &&
      !degradedHabahiro &&
      ((familyNotes.get("long")?.length ?? 0) > 0 ||
        (familyNotes.get("slide")?.length ?? 0) > 0);
    if (
      requiresMeshChildren &&
      (this.ordinaryNoteScene === null ||
        this.ordinaryNoteScene.screenToSafeAreaRatio === undefined ||
        this.ordinaryNoteScene.longMeshColor === undefined)
    ) {
      return integrityFailure(
        "render.note.long-scene-unavailable",
        ["RPR-D05", "RPR-D06", "RPR-D13", "PR11", "PR13", "PR15"],
        "A chart with ordinary Long or R4 Slide notes requires explicit safe-area ratio and base-mesh color before pool creation.",
      );
    }
    const requiresSyncLinePool = this.renderProducer !== null && !degradedHabahiro &&
      this.inGameCalculatedData.isSyncLineEnabled &&
      this.batches.reduce((count, batch) => count + batch.informationList.filter(information =>
        !isNonPlayableCommand(information)).length, 0) > 1;
    if (
      requiresSyncLinePool &&
      (this.ordinaryNoteScene === null ||
        this.ordinaryNoteScene.syncLineEdgeMargin === undefined)
    ) {
      return integrityFailure(
        "render.note.sync-line-scene-unavailable",
        ["RPR-D06", "RPR-D13", "PR16", "PR39"],
        "A chart with simultaneous ordinary Normal notes requires the explicit typed sync-line edge margin.",
      );
    }
    const requiresMultipleDirectionalLinePool = this.renderProducer !== null &&
      !degradedHabahiro &&
      this.batches.some((batch) =>
        batch.informationList.some(information =>
          information.fireNoteType === FrontNoteType.LongMultipleDirectionalFlickAdd ||
          information.fireNoteType === FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
          information.fireNoteType === FrontNoteType.SlideBMultipleDirectionalFlickAdd) ||
        groupMultipleDirectionalInformationList(batch.informationList).some(group => group.length > 1)
      );
    const renderSetup = this.renderProducer?.preflightPoolSetup(
      [...familyNotes].flatMap(([family, notes]) =>
        notes.map((information, index) => Object.freeze({
          family,
          poolObjectId: `${family}:${index}`,
          ...(family === "slide" && !degradedHabahiro
            ? { slideChildCount: information.slideNoteList.length }
            : {}),
        }))),
      requiresSyncLinePool ? SYNC_LINE_POOL_LENGTH : 0,
      requiresMultipleDirectionalLinePool
        ? MULTIPLE_DIRECTIONAL_LINE_POOL_LENGTH
        : 0,
    ) ?? null;
    if (renderSetup?.status === "integrity-failure") return renderSetup;

    for (const [family, notes] of familyNotes) {
      const objects = notes.map((_, index) => {
        const note = this.createPoolObject(family, `${family}:${index}`);
        if (note instanceof NoteSlide || note instanceof NoteLong) note.onTouchKeepSound = (index, action) => {
          if (action === "start" && this.isMoveTime()) return;
          this.pendingHoldSounds.push({ ownerKey: `${note instanceof NoteSlide ? "slide" : "long"}:${index}`, action });
        };
        note.setLifecycleCallbacks({
          onActivate: (activeNote) => this.appendActiveNote(activeNote),
          onDeactivate: (inactiveNote) => {
            this.removeActiveNote(inactiveNote);
            this.releaseOrdinarySyncLinesForNote(inactiveNote);
            this.releaseMultipleDirectionalLinesForNote(inactiveNote);
            if (inactiveNote instanceof NoteMultipleDirectionalVisual) {
              this.directionalVisualTailOwners.delete(inactiveNote);
            }
            this.ordinaryLongRenderStates.delete(inactiveNote);
            this.ordinarySlideRenderStates.delete(inactiveNote);
            this.ordinaryRenderMotionStates.delete(inactiveNote);
            this.manualNoteDeactivatedOwner?.(inactiveNote);
          },
        });
        note.registerCallbackGetUsableOneFrameData(this.getUsableOneFrameData);
        note.registerAutoLiveRuntime({
          shouldForcePerfect: () => this.inGameCalculatedData.isAutoPlay || this.isMoveTime(),
          getAdjustedMusicPosition: () => this.getAdjustedMusicPosition(),
          submitJudgement: this.submitAutoLiveJudgement,
        });
        note.registerManualRuntime({
          getExecuteFrame: () => this.musicScoreController.executeFrame,
          getSlideChildPhase: (index) => {
            const phase = this.ordinarySlideRenderStates.get(note)?.[index]?.lifecycle.phase;
            return phase === undefined
              ? integrityFailure("manual.slide-child-phase-unavailable", ["D11", "MJ23"],
                  "Slide timeout requires the committed child motion phase.")
              : ok(phase);
          },
          getAdjustedMusicPosition: () => this.getAdjustedMusicPosition(),
          getCurrentBpm: () => this.musicScoreController.currentBpm,
          getJudgementAdjustValueB: () => this.judgementAdjustValueB,
          hasCrossedMotionLine: () => {
            const progress = this.ordinaryRenderMotionStates.get(note)?.motionState.progressRate.value;
            return progress === undefined
              ? integrityFailure("manual.note-motion-progress-unavailable", ["D11", "MJ23"],
                  "Long Move requires its committed motion progress.")
              : ok(progress > 1);
          },
          stopSlideHeadAtJudgeLine: () => {
            const current = this.ordinaryRenderMotionStates.get(note);
            if (current === undefined || note.noteInformation === null) {
              return integrityFailure("manual.slide-head-motion-unavailable", ["D10", "MJ23"],
                "Slide Move requires its committed head motion.");
            }
            const line = this.slideNoteManager.getVirtualPerfectLine(note.noteInformation);
            if (line.status !== "ok") return line;
            if (current.motionState.progressRate.value <= 1 || current.renderedTransform.position.y.value > line.value) {
              return ok(false);
            }
            const snapped = this.advanceOrdinaryRenderMotion(note, 0, "target-button");
            return snapped.status === "ok" ? ok(true) : snapped;
          },
          judgeSlide: (source) => {
            const index = this.manualSlideSources.get(source)?.sourceIndex;
            const y = index === -1 ? this.ordinaryRenderMotionStates.get(note)?.slideJudgeY
              : index === undefined ? undefined : this.ordinarySlideRenderStates.get(note)?.[index]?.judgeY;
            return y === undefined
              ? integrityFailure("manual.slide-judge-motion-unavailable", ["D10", "MJ20"],
                  "Slide judgement requires the committed motion of its chart-owned node.")
              : this.slideNoteManager.judge(source, y);
          },
          geometry: this.manualInputGeometry,
          beginJudgementTransaction: () => this.createManualJudgementTransaction(),
          submitJudgement: (request) => this.submitManualJudgement(request),
        });
        if (this.renderProducer !== null) {
          note.registerRenderDeactivationOwner(() =>
            this.renderProducer!.preflightNoteDeactivation(
              note.poolObjectId,
              this.ordinarySyncLinePoolIndicesForNote(note),
              this.ordinaryLongRenderStates.has(note),
              this.multipleDirectionalLinePoolIndicesForNote(note),
              this.ordinarySlideRenderStates.get(note)?.length ?? 0,
            ));
          note.registerRenderMotionOwner((deltaTimeSeconds) =>
            this.advanceOrdinaryRenderMotion(note, deltaTimeSeconds));
        }
        if (note instanceof NoteMultipleDirectionalVisual) {
          note.registerPresentationLifecycle(() => this.directionalVisualState(note));
        }
        if (note instanceof NoteMultipleDirectionalFlick) {
          note.registerMultipleDirectionalGroupResolver(
            (information) => this.resolveMultipleDirectionalGroup(information),
          );
        }
        if (note instanceof NoteLong) {
          note.registerLongAfterMultipleGroupResolver(
            (information) => this.resolveLongAfterMultipleGroup(information),
          );
        }
        if (note instanceof NoteSlide) {
          note.registerSlideAfterMultipleGroupResolver(
            (information) => this.resolveSlideAfterMultipleGroup(information),
          );
        }
        return note;
      });
      this.notePoolsValue.set(family, { family, objects, cursor: 0 });
    }

    this.setupComplete = true;
    if (renderSetup?.status === "ok") {
      const committed = renderSetup.value.commit();
      if (committed.status !== "ok") return committed;
    }
    return ok(undefined);
  }

  execUpdate(deltaTimeSeconds: number): SimulatorResult<void> {
    if (!this.setupComplete) {
      return integrityFailure(
        "note-manager.update-before-setup",
        ["E06"],
        "SetupNotes must establish pools and active-list callbacks before ExecUpdate.",
      );
    }
    if (!Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0) {
      return integrityFailure(
        "note-manager.invalid-delta-time",
        ["E03"],
        "ExecUpdate requires a finite non-negative frame delta.",
      );
    }

    const frameDelta = Math.fround(deltaTimeSeconds);
    if (!Number.isFinite(frameDelta)) {
      return integrityFailure(
        "note-manager.delta-outside-float32",
        ["E03"],
        "ExecUpdate delta must remain finite after the original Float32 conversion.",
      );
    }
    const executeFrame = Math.min(Math.fround(frameDelta * 60), 1);
    const prospectiveCounters: PerformanceLevelCounters = [
      this.performanceLevelCountersValue[0],
      this.performanceLevelCountersValue[1],
      this.performanceLevelCountersValue[2],
      this.performanceLevelCountersValue[3],
    ];
    const substepCount = selectSubstepCount(
      frameDelta,
      this.bpmChangeCount,
      prospectiveCounters,
    );
    const substepDelta = Math.fround(frameDelta / substepCount);
    const advanceValidation = this.clock.validateAdvanceSequence(
      substepDelta,
      substepCount,
    );
    if (advanceValidation.status !== "ok") {
      return advanceValidation;
    }
    for (let index = 0; index < prospectiveCounters.length; index += 1) {
      this.performanceLevelCountersValue[index] = prospectiveCounters[index];
    }
    const substepExecuteFrame = Math.fround(executeFrame / substepCount);
    this.clock.setExecuteFrame(substepExecuteFrame);
    const renderFrame = this.renderProducer?.beginOuterFrame(this.outerFrameIndexValue);
    if (renderFrame?.status === "integrity-failure") return renderFrame;
    this.outerFrameIndexValue += 1;

    for (let substepIndex = 0; substepIndex < substepCount; substepIndex += 1) {
      const renderSubstep = this.renderProducer?.beginSubstep(substepIndex);
      if (renderSubstep?.status === "integrity-failure") return renderSubstep;
      const advanceResult = this.clock.advance(substepDelta);
      if (advanceResult.status !== "ok") {
        return advanceResult;
      }

      let bpmIndex = 0;
      while (bpmIndex < this.activeBpmChangesValue.length) {
        const bpmChange = this.activeBpmChangesValue[bpmIndex];
        if (bpmChange === undefined) {
          break;
        }
        const updateResult = bpmChange.execUpdate(this.musicScoreController);
        if (updateResult.status !== "ok") {
          return updateResult;
        }
        if (this.activeBpmChangesValue[bpmIndex] === bpmChange) {
          bpmIndex += 1;
        }
      }
      let activeIndex = this.activeNotesValue.length - 1;
      while (activeIndex >= 0) {
        const note = this.activeNotesValue[activeIndex];
        if (note === undefined) {
          return integrityFailure(
            "note-manager.unrepresented-cross-note-mutation",
            ["E17"],
            "No recovered Update caller removes a different lower-index active Note in this stage.",
          );
        }
        if (this.renderProducer !== null && note instanceof NoteSlide && note.pendingBeganPlacement) {
          const placed = this.advanceOrdinaryRenderMotion(note, Math.fround(0), "preserve", true);
          if (placed.status !== "ok") return placed;
          note.commitBeganPlacement();
        }
        const stateBefore = note.state;
        const updateResult = note.executeUpdate(substepDelta);
        if (updateResult.status !== "ok") {
          return updateResult;
        }
        if (this.renderProducer !== null && stateBefore === NoteState.Move && note.state === NoteState.Stop &&
          (note instanceof NoteLong || note instanceof NoteSlide) &&
          (this.inGameCalculatedData.isAutoPlay || this.isMoveTime())) {
          const repositioned = this.advanceOrdinaryRenderMotion(note, Math.fround(0), "perspective");
          if (repositioned.status !== "ok") return repositioned;
        }
        activeIndex -= 1;
      }

      const longChildUpdate = this.updateOrdinaryLongChildren(substepDelta);
      if (longChildUpdate.status !== "ok") {
        return longChildUpdate;
      }
      const slideChildUpdate = this.updateOrdinarySlideChildren(substepDelta);
      if (slideChildUpdate.status !== "ok") {
        return slideChildUpdate;
      }

      for (const visual of this.directionalVisualTailOwners.keys()) {
        const updated = visual.updatePresentationState();
        if (updated.status !== "ok") return updated;
      }

      const syncLineUpdate = this.updateOrdinarySyncLines();
      if (syncLineUpdate.status !== "ok") {
        return syncLineUpdate;
      }
      const multipleDirectionalLineUpdate = this.updateMultipleDirectionalLines();
      if (multipleDirectionalLineUpdate.status !== "ok") {
        return multipleDirectionalLineUpdate;
      }

      const activationResult = this.activateCurrentBatch(substepIndex);
      if (activationResult.status !== "ok") {
        return activationResult;
      }
    }

    return this.advanceNoteAnimations(frameDelta);
  }

  advanceNoteAnimations(deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.renderProducer !== null) {
      const animation = this.renderProducer.preflightNoteAnimationFrame(Math.fround(deltaTimeSeconds),
        this.activeNotesValue.flatMap((note) => note instanceof NoteLong || note instanceof NoteSlide
          ? [{ poolObjectId: note.poolObjectId, revision: note.flashAnimationRevision }]
          : []));
      if (animation.status !== "ok") return animation;
      const committed = animation.value.commit();
      if (committed.status !== "ok") return committed;
    }
    return ok(undefined);
  }

  getAdjustedMusicPosition(): number {
    return this.musicScoreController.getAdjustedMusicPosition(
      this.judgementAdjustValueB,
    );
  }

  peekAdjustedMusicPosition(): number {
    return this.musicScoreController.peekAdjustedMusicPosition(
      this.judgementAdjustValueB,
    );
  }

  beginManualJudgementTransaction(): ManualJudgementTransaction {
    return this.createManualJudgementTransaction();
  }

  private submitManualJudgement(
    request: Parameters<ManualJudgementTransaction["preflight"]>[0],
  ): SimulatorResult<void> {
    const transaction = this.createManualJudgementTransaction();
    const planned = transaction.preflight(request);
    if (planned.status !== "ok") {
      transaction.abort();
      return planned;
    }
    transaction.commit(planned.value);
    transaction.finish();
    return ok(undefined);
  }

  getManualJudgementOwnership(
    noteInformation: NoteInformation,
  ): ManualJudgementOwnership | null {
    if (!this.autoLiveJudgementSources.has(noteInformation)) {
      return null;
    }
    const longAfterGroup = this.longAfterMultipleGroups.get(noteInformation);
    const slideSource = this.manualSlideSources.get(noteInformation);
    const isLong = noteInformation.fireNoteType === FrontNoteType.Long;
    return Object.freeze({
      multipleDirectionalFlickNoteCount:
        this.multipleDirectionalGroups.get(noteInformation)?.count ?? null,
      multipleDirectionalFlickButtonTypes:
        this.multipleDirectionalGroups.get(noteInformation)?.buttonTypes ?? null,
      longAfterAbsolutePosition: isLong
        ? noteInformation.afterNoteAbsolutePos
        : null,
      longAfterNoteType: isLong
        ? manualLongAfterNoteType(noteInformation.afterNoteType)
        : null,
      longAfterButtonTypes: isLong
        ? longAfterGroup?.buttonTypes ?? noteInformation.buttonTypesArray
        : null,
      longAfterMultipleCount: isLong
        ? longAfterGroup?.count ?? null
        : null,
      slidePhase: slideSource?.phase ?? null,
      slideAllowedNoteTypes: slideSource?.allowedNoteTypes ?? null,
      slideAbsolutePosition: slideSource?.absolutePosition ?? null,
      slideButtonTypes: slideSource?.buttonTypes ?? null,
    });
  }

  ownsManualJudgementSource(noteInformation: NoteInformation): boolean {
    return this.getManualJudgementOwnership(noteInformation) !== null;
  }

  registerManualNoteDeactivatedOwner(
    owner: (note: NoteBase) => void,
  ): SimulatorResult<void> {
    if (typeof owner !== "function" || this.manualNoteDeactivatedOwner !== null) {
      return integrityFailure(
        "manual.note-deactivation-owner-invalid-or-duplicate",
        ["D12", "D14", "MJ15", "MJ22", "MJ25"],
        "NoteManager accepts exactly one dispatcher-owned manual finger cleanup callback.",
      );
    }
    this.manualNoteDeactivatedOwner = owner;
    return ok(undefined);
  }

  selectManualCandidateBeforeJudgement(
    buttonType: ButtonTypeValue | null,
    projectedFingerOwners?: ReadonlyMap<NoteBase, number>,
    position?: ManualInputPosition,
    reservedExtensions?: ManualCandidateExtensionFrame,
    fingerId = -1,
  ): SimulatorResult<NoteBase | null> {
    let ordinaryCandidate: NoteBase | null = null;
    let ordinaryDistance = Number.POSITIVE_INFINITY;
    let slideCandidate: NoteSlide | null = null;
    const musicPosition = Math.fround(this.musicScoreController.musicPosition);

    for (const note of this.activeNotesValue) {
      if (buttonType === null || !note.isContainsButton(buttonType)) {
        continue;
      }
      if (note instanceof NoteSlide) {
        const source = note.manualCandidateSource;
        if (source === null) {
          continue;
        }
        if (slideCandidate === null) {
          if ((projectedFingerOwners?.get(note) ?? note.fingerId) < 0) slideCandidate = note;
        } else {
          const selected = this.selectNearestRenderedCandidate(slideCandidate, note);
          if (selected.status !== "ok") return selected;
          if (selected.value === "second") slideCandidate = note;
        }
        continue;
      }
      const information = note.noteInformation;
      if (information === null) {
        return integrityFailure(
          "manual.active-candidate-without-information",
          ["D04", "MJ03"],
          "Every active candidate in the owner scan must retain its activated NoteInformation.",
        );
      }
      const distance = Math.fround(Math.abs(
        Math.fround(information.absolutePos) - musicPosition,
      ));
      if (distance < ordinaryDistance) {
        ordinaryCandidate = note;
        ordinaryDistance = distance;
      }
    }
    if (this.manualCandidateExtension !== null && position !== undefined && reservedExtensions !== undefined) {
      return this.manualCandidateExtension(ordinaryCandidate, slideCandidate, position, reservedExtensions, fingerId);
    }
    if (ordinaryCandidate === null) {
      return ok(slideCandidate);
    }
    if (slideCandidate === null) {
      return ok(ordinaryCandidate);
    }
    const near = this.selectNearestRenderedCandidate(ordinaryCandidate, slideCandidate);
    if (near.status !== "ok") {
      return near;
    }
    return ok(near.value === "first" ? ordinaryCandidate : slideCandidate);
  }

  private selectNearestRenderedCandidate(first: NoteBase, second: NoteBase): SimulatorResult<"first" | "second"> {
    const firstY = this.getManualCandidatePresentation(first)?.y;
    const secondY = this.getManualCandidatePresentation(second)?.y;
    return firstY === undefined || secondY === undefined
      ? integrityFailure("manual.candidate-button-owner-unavailable", ["D04", "D10", "MJ04"],
          "Near-line arbitration requires both candidates' committed local positions.")
      : this.slideNoteManager.selectNearJudgeLineSource(firstY, secondY);
  }

  setManualCandidateExtension(selector: NonNullable<NoteManager["manualCandidateExtension"]>): void {
    this.manualCandidateExtension = selector;
  }

  getManualCandidatePresentation(note: NoteBase): { source: NoteInformation; y: number | undefined } | null {
    const source = note instanceof NoteSlide ? note.manualCandidateSource : note.noteInformation;
    if (source === null) return null;
    const index = this.manualSlideSources.get(source)?.sourceIndex;
    const y = index !== undefined && index >= 0
      ? this.ordinarySlideRenderStates.get(note)?.[index]?.lifecycle.renderedTransform.position.y.value
      : this.ordinaryRenderMotionStates.get(note)?.renderedTransform.position.y.value;
    return { source, y };
  }

  snapshot(): NoteManagerSnapshot {
    return {
      batchCount: this.batches.length,
      nextBatchIndex: this.nextBatchIndexValue,
      activeNotePoolObjectIds: this.activeNotesValue.map(
        (note) => note.poolObjectId,
      ),
      activeBpmPoolIndices: this.activeBpmChangesValue.map(
        (note) => note.poolIndex,
      ),
      bpmPoolCursor: this.bpmPoolCursorValue,
      bpmPool: this.bpmPoolValue.map((note) => note.snapshot()),
      pools: [...this.notePoolsValue.values()].map((pool) => ({
        family: pool.family,
        cursor: pool.cursor,
        objects: pool.objects.map((note) => note.snapshot()),
      })),
      slideNoteManagerInitialized: this.slideNoteManager.isInitialized,
      bpmChangeCount: this.bpmChangeCount,
      performanceLevelCounters: [...this.performanceLevelCountersValue],
      activeOrdinarySyncLineCount: this.activeOrdinarySyncLines.filter((line) => line !== null).length,
      suppressedOrdinarySyncLinePairCount: this.suppressedOrdinarySyncLinePairCountValue,
      calculatedData: this.inGameCalculatedData.snapshot(),
    };
  }

  dispose(): SimulatorResult<void> {
    this.manualCandidateExtension = null;
    for (const pool of this.notePoolsValue.values()) {
      for (const note of pool.objects) {
        const reset = note.resetForDispose();
        if (reset.status !== "ok") {
          return reset;
        }
      }
      pool.cursor = 0;
    }
    this.clearRuntimeForDispose();
    return ok(undefined);
  }

  disposeAfterTerminalRendererFault(): void {
    for (const pool of this.notePoolsValue.values()) {
      for (const note of pool.objects) note.resetAfterTerminalRendererFault();
      pool.cursor = 0;
    }
    this.clearRuntimeForDispose();
  }

  private clearRuntimeForDispose(): void {
    this.pendingHoldSounds.length = 0;
    for (const bpm of this.bpmPoolValue) {
      bpm.resetForDispose();
    }
    this.activeNotesValue.length = 0;
    this.activeBpmChangesValue.length = 0;
    this.activeOrdinarySyncLines.fill(null);
    this.pendingSyncTailNotes.length = 0;
    this.pendingDirectionalSyncTailNotes.length = 0;
    this.syncConnectionSequence = 0;
    this.suppressedOrdinarySyncLinePairCountValue = 0;
    this.activeMultipleDirectionalLines.fill(null);
    this.directionalVisualTailOwners.clear();
    this.ordinaryLongRenderStates.clear();
    this.ordinarySlideRenderStates.clear();
    this.bpmPoolCursorValue = 0;
    this.outerFrameIndexValue = 0;
    this.slideNoteManager.dispose();
  }

  private setupMultipleDirectionalGroups(): void {
    for (const batch of this.batches) {
      for (const group of groupMultipleDirectionalInformationList(batch.informationList)) {
        const owner = new MultipleDirectionalGroupOwner(group);
        for (const information of group) {
          this.multipleDirectionalGroups.set(information, owner);
        }
      }
    }
  }

  private setupLongAfterMultipleGroups(): SimulatorResult<void> {
    const allInformation = this.batches.flatMap((batch) => batch.informationList);
    for (const root of allInformation) {
      if (
        root.fireNoteType !== FrontNoteType.Long ||
        (root.afterNoteType !== AfterNoteType.MultipleDirectionalFlickLeft &&
          root.afterNoteType !== AfterNoteType.MultipleDirectionalFlickRight)
      ) {
        continue;
      }
      const members = [
        root,
        ...allInformation.filter((candidate) =>
          candidate !== root &&
          candidate.fireNoteType === FrontNoteType.LongMultipleDirectionalFlickAdd &&
          directionalEndpointPosition(candidate) === root.afterNoteAbsolutePos &&
          isSameDirectionalGroup(root, candidate)),
      ];
      if (members.length < 2) {
        return integrityFailure(
          "manual.long-multiple-after-group-missing",
          ["R16.D17", "D08", "D12", "MJ13"],
          `Long root ${root.index} has a Multiple after type without its chart-owned side group.`,
        );
      }
      this.longAfterMultipleGroups.set(
        root,
        new MultipleDirectionalGroupOwner(members, directionalEndpointButton),
      );
    }
    return ok(undefined);
  }

  private setupSlideAfterMultipleGroups(): SimulatorResult<void> {
    const allInformation = this.batches.flatMap((batch) => batch.informationList);
    for (const root of allInformation) {
      if (
        (root.fireNoteType !== FrontNoteType.SlideA && root.fireNoteType !== FrontNoteType.SlideB) ||
        (root.afterNoteType !== AfterNoteType.SlideMultipleDirectionalFlickLeft &&
          root.afterNoteType !== AfterNoteType.SlideMultipleDirectionalFlickRight)
      ) {
        continue;
      }
      const visualType = root.fireNoteType === FrontNoteType.SlideA
        ? FrontNoteType.SlideAMultipleDirectionalFlickAdd
        : FrontNoteType.SlideBMultipleDirectionalFlickAdd;
      const members = [
        root,
        ...allInformation.filter((candidate) =>
          candidate !== root &&
          candidate.fireNoteType === visualType &&
          directionalEndpointPosition(candidate) === directionalEndpointPosition(root) &&
          isSameDirectionalGroup(root, candidate)),
      ];
      if (members.length < 2) {
        return integrityFailure(
          "manual.slide-multiple-after-group-missing",
          ["R16.D17", "D08", "D12", "MJ21"],
          `Slide root ${root.index} has a Multiple terminal without its chart-owned side group.`,
        );
      }
      this.slideAfterMultipleGroups.set(
        root,
        new MultipleDirectionalGroupOwner(members, directionalEndpointButton),
      );
    }
    return ok(undefined);
  }

  getAutoLiveJudgementOwnership(
    information: NoteInformation,
  ): AutoLiveJudgementOwnership | null {
    if (!this.autoLiveJudgementSources.has(information)) {
      return null;
    }
    return {
      multipleDirectionalFlickNoteCount:
        this.multipleDirectionalGroups.get(information)?.count ?? null,
    };
  }

  private resolveLongAfterMultipleGroup(
    information: NoteInformation,
  ): SimulatorResult<MultipleDirectionalRuntimeGroup | null> {
    return ok(this.longAfterMultipleGroups.get(information) ?? null);
  }

  private resolveSlideAfterMultipleGroup(
    information: NoteInformation,
  ): SimulatorResult<MultipleDirectionalRuntimeGroup | null> {
    return ok(this.slideAfterMultipleGroups.get(information) ?? null);
  }

  private resolveMultipleDirectionalGroup(
    information: NoteInformation,
  ): SimulatorResult<MultipleDirectionalRuntimeGroup> {
    const group = this.multipleDirectionalGroups.get(information);
    if (group === undefined) {
      return integrityFailure(
        "auto-live.multiple-directional-group-missing",
        ["R10", "R13", "R16"],
        `Multiple Directional note ${information.index} has no confirmed adjacent-button runtime group.`,
      );
    }
    return ok(group);
  }

  private advanceOrdinaryRenderMotion(
    note: NoteBase,
    deltaTimeSeconds: number,
    placement: "perspective" | "target-button" | "preserve" | null = null,
    useGoalDepth = false,
    controlledRealMoveSecond?: OrdinaryNoteMotionState["realMoveSecond"],
  ): SimulatorResult<void> {
    if (this.renderProducer === null || this.ordinaryNoteScene === null) {
      return integrityFailure(
        "render.note.ordinary-scene-unavailable",
        ["RPR-D05", "RPR-D13", "PR10", "PR39"],
        "A rendered ordinary Note Move requires its producer and explicit typed fixed-scene input.",
      );
    }
    const current = this.ordinaryRenderMotionStates.get(note);
    if (current === undefined) {
      return integrityFailure(
        "render.note.motion-state-unavailable",
        ["RPR-D05", "RPR-D13", "PR10", "PR39"],
        "Every active rendered Note must retain the motion state committed by its activation owner.",
      );
    }
    const deltaTime = createRenderFloat32(Math.fround(deltaTimeSeconds));
    if (deltaTime.status !== "ok") return deltaTime;
    const realMoveSecond = controlledRealMoveSecond !== undefined ? ok(controlledRealMoveSecond) : placement === null
      ? createRenderFloat32(Math.fround(current.motionState.realMoveSecond.value + deltaTime.value.value))
      : ok(current.motionState.realMoveSecond);
    if (realMoveSecond.status !== "ok") return realMoveSecond;
    if (note instanceof NoteMultipleDirectionalVisual && controlledRealMoveSecond === undefined && placement === null) {
      // ExecuteUpdate advances the clock; the connected tail owns Add.Move.
      this.ordinaryRenderMotionStates.set(note, Object.freeze({ ...current,
        motionState: Object.freeze({ ...current.motionState, deltaTime: deltaTime.value,
          realMoveSecond: realMoveSecond.value }),
      }));
      return ok(undefined);
    }
    const prepared = this.renderProducer.preflightOrdinaryNoteSceneMotion(
      note.poolObjectId,
      Object.freeze({
        ...current.motionState,
        deltaTime: deltaTime.value,
        realMoveSecond: realMoveSecond.value,
        ...(useGoalDepth ? {
          currentPositionZ: this.ordinaryNoteScene.goalPositions[note.noteInformation!.buttonType]!.z,
        } : {}),
      }),
      this.ordinaryNoteScene,
      placement === "preserve" ? current.renderedTransform.localScale : placement,
    );
    if (prepared.status !== "ok") return prepared;
    const committed = prepared.value.transaction.commit();
    if (committed.status !== "ok") return committed;
    this.ordinaryRenderMotionStates.set(note, Object.freeze({
      ...(note instanceof NoteSlide ? {
        slideJudgeY: placement !== null ? current.slideJudgeY! : prepared.value.motion.position.y.value,
      } : {}),
      motionState: Object.freeze({
        ...current.motionState,
        deltaTime: deltaTime.value,
        realMoveSecond: realMoveSecond.value,
        progressRate: prepared.value.motion.progressRate,
        currentPositionZ: prepared.value.motion.position.z,
      }),
      renderedTransform: prepared.value.motion,
    }));
    return ok(undefined);
  }

  private advanceDirectionalVisualsForTail(
    tail: NoteBase,
    deltaTimeSeconds: number,
    realMoveSecond: OrdinaryNoteMotionState["realMoveSecond"],
  ): SimulatorResult<void> {
    const afterType = tail.noteInformation?.afterNoteType;
    if (this.directionalVisualTailOwners.size === 0 ||
      (afterType !== AfterNoteType.MultipleDirectionalFlickLeft &&
        afterType !== AfterNoteType.MultipleDirectionalFlickRight &&
        afterType !== AfterNoteType.SlideMultipleDirectionalFlickLeft &&
        afterType !== AfterNoteType.SlideMultipleDirectionalFlickRight)) return ok(undefined);
    const adjacentVisuals = (note: NoteBase, after: boolean): NoteMultipleDirectionalVisual[] =>
      this.activeMultipleDirectionalLines.flatMap((line) => {
        if (line === null) return [];
        const other = line.targetA === note && line.afterA === after && !line.afterB ? line.targetB
          : line.targetB === note && line.afterB === after && !line.afterA ? line.targetA : null;
        return other instanceof NoteMultipleDirectionalVisual ? [other] : [];
      }).sort((a, b) => b.noteInformation!.buttonType - a.noteInformation!.buttonType);
    for (const visual of adjacentVisuals(tail, true)) {
      const moved = this.advanceOrdinaryRenderMotion(visual, deltaTimeSeconds, null, false, realMoveSecond);
      if (moved.status !== "ok") return moved;
      // Add.Move forwards plain NoteBase.Move only to immediate Add neighbors.
      // Their existing clocks are retained; there is no recursive group motion.
      for (const neighbor of adjacentVisuals(visual, false)) {
        const current = this.ordinaryRenderMotionStates.get(neighbor);
        if (current === undefined) return integrityFailure(
          "render.note.directional-neighbor-motion-unavailable", ["R16.D01", "R16.D03"],
          "A connected Add visual requires its activated motion state.",
        );
        const advanced = this.advanceOrdinaryRenderMotion(neighbor, deltaTimeSeconds, null, false,
          current.motionState.realMoveSecond);
        if (advanced.status !== "ok") return advanced;
      }
    }
    return ok(undefined);
  }

  private updateOrdinaryLongChildren(
    deltaTimeSeconds: number,
  ): SimulatorResult<void> {
    if (this.renderProducer === null || this.ordinaryNoteScene === null) {
      return this.ordinaryLongRenderStates.size === 0
        ? ok(undefined)
        : integrityFailure(
          "render.note.long-scene-unavailable",
          ["RPR-D05", "RPR-D06", "RPR-D13", "PR11", "PR13", "PR15"],
          "Active rendered Long children require their producer and typed ordinary scene.",
        );
    }
    const deltaTime = createRenderFloat32(Math.fround(deltaTimeSeconds));
    const launcherMusicPosition = createRenderFloat32(Math.fround(
      this.musicScoreController.launcherMusicPosition,
    ));
    const adjustedMusicPosition = createRenderFloat32(Math.fround(
      this.getAdjustedMusicPosition(),
    ));
    if (deltaTime.status !== "ok") return deltaTime;
    if (launcherMusicPosition.status !== "ok") return launcherMusicPosition;
    if (adjustedMusicPosition.status !== "ok") return adjustedMusicPosition;
    for (const [note, childState] of this.ordinaryLongRenderStates) {
      const front = this.ordinaryRenderMotionStates.get(note);
      if (front === undefined) {
        return integrityFailure(
          "render.note.long-front-state-unavailable",
          ["RPR-D05", "RPR-D06", "RPR-D13", "PR11", "PR13", "PR15"],
          "Every active rendered Long child requires its last committed front transform.",
        );
      }
      const prepared = this.renderProducer.preflightOrdinaryLongChildFrame(
        note.poolObjectId,
        childState,
        front.renderedTransform,
        Object.freeze({
          deltaTime: deltaTime.value,
          launcherMusicPosition: launcherMusicPosition.value,
          adjustedMusicPosition: adjustedMusicPosition.value,
        }),
        this.ordinaryNoteScene,
      );
      if (prepared.status !== "ok") return prepared;
      const committed = prepared.value.transaction.commit();
      if (committed.status !== "ok") return committed;
      this.ordinaryLongRenderStates.set(note, prepared.value.childState);
      if (childState.phase === "move") {
        const moved = this.advanceDirectionalVisualsForTail(note, deltaTimeSeconds,
          prepared.value.childState.motionState.realMoveSecond);
        if (moved.status !== "ok") return moved;
      }
    }
    return ok(undefined);
  }

  refreshAfterMoveTime(): SimulatorResult<void> {
    for (const note of this.activeNotesValue) {
      if (note instanceof NoteSlide) note.refreshAfterMoveTime();
    }
    const updated = this.updateOrdinarySlideChildren(Math.fround(0), false);
    return updated.status === "ok" ? this.advanceNoteAnimations(0) : updated;
  }

  private updateOrdinarySlideChildren(
    deltaTimeSeconds: number,
    advanceMotion = true,
  ): SimulatorResult<void> {
    if (this.renderProducer === null || this.ordinaryNoteScene === null) {
      return this.ordinarySlideRenderStates.size === 0
        ? ok(undefined)
        : integrityFailure(
          "render.slide.scene-unavailable",
          ["RPR-R4-004", "RPR-R4-010", "RPR-R4-014", "PR07", "PR12", "PR15"],
          "Active R4 Slide children require their producer and typed ordinary scene.",
        );
    }
    const deltaTime = createRenderFloat32(Math.fround(deltaTimeSeconds));
    const launcherMusicPosition = createRenderFloat32(Math.fround(
      this.musicScoreController.launcherMusicPosition,
    ));
    const adjustedMusicPosition = createRenderFloat32(Math.fround(
      this.getAdjustedMusicPosition(),
    ));
    if (deltaTime.status !== "ok") return deltaTime;
    if (launcherMusicPosition.status !== "ok") return launcherMusicPosition;
    if (adjustedMusicPosition.status !== "ok") return adjustedMusicPosition;
    for (const [note, childStates] of this.ordinarySlideRenderStates) {
      const front = this.ordinaryRenderMotionStates.get(note);
      if (front === undefined) {
        return integrityFailure(
          "render.slide.front-state-unavailable",
          ["RPR-R4-004", "RPR-R4-010", "RPR-R4-014", "PR07", "PR12"],
          "Every active R4 Slide chain requires its last committed front transform.",
        );
      }
      const virtualLine = this.slideNoteManager.getVirtualPerfectLine(note.noteInformation!);
      if (virtualLine.status !== "ok") return virtualLine;
      const prepared = this.renderProducer.preflightOrdinarySlideChildFrame(
        note.poolObjectId,
        childStates,
        front.renderedTransform,
        front.motionState.buttonCount,
        Object.freeze({
          deltaTime: deltaTime.value,
          launcherMusicPosition: launcherMusicPosition.value,
          adjustedMusicPosition: adjustedMusicPosition.value,
        }),
        this.ordinaryNoteScene,
        {
          advanceMotion,
          rootWaiting: note.state === NoteState.Wait || note.state === NoteState.Stop,
          judgementAdjustValueB: this.judgementAdjustValueB,
          virtualPerfectLine: virtualLine.value,
          rootSource: note.noteInformation!,
          rootMotionState: front.motionState,
          currentBpm: this.musicScoreController.currentBpm,
          virtualLaneDeltaX: Math.fround(Math.fround(
            this.ordinaryNoteScene.goalPositions[1]!.x.value - this.ordinaryNoteScene.goalPositions[0]!.x.value,
          ) / 100),
          stoppedChildWaited: note instanceof NoteSlide
            ? note.afterNotes.map((after) => after.stopAdjustmentWaited) : [],
        },
        note instanceof NoteSlide ? note.pendingRenderHides : undefined,
      );
      if (prepared.status !== "ok") return prepared;
      const committed = prepared.value.transaction.commit();
      if (committed.status !== "ok") return committed;
      this.ordinarySlideRenderStates.set(note, prepared.value.childStates);
      this.ordinaryRenderMotionStates.set(note, Object.freeze({ ...front, renderedTransform: prepared.value.frontTransform }));
      const previousTail = childStates[childStates.length - 1];
      const currentTail = prepared.value.childStates[prepared.value.childStates.length - 1];
      if (advanceMotion && previousTail?.lifecycle.phase === "move" && currentTail !== undefined) {
        const moved = this.advanceDirectionalVisualsForTail(note, deltaTimeSeconds,
          currentTail.lifecycle.motionState.realMoveSecond);
        if (moved.status !== "ok") return moved;
      }
      if (note instanceof NoteSlide) note.commitRenderHides();
    }
    return ok(undefined);
  }

  private ordinarySyncLinePoolIndicesForNote(note: NoteBase): readonly number[] {
    return Object.freeze(this.activeOrdinarySyncLines.flatMap((line) =>
      line !== null && (line.targetA === note || line.targetB === note)
        ? [line.poolIndex]
        : []
    ));
  }

  private releaseOrdinarySyncLinesForNote(note: NoteBase): void {
    for (const candidates of [this.pendingSyncTailNotes, this.pendingDirectionalSyncTailNotes]) {
      const candidateIndex = candidates.indexOf(note);
      if (candidateIndex >= 0) candidates.splice(candidateIndex, 1);
    }
    for (let index = 0; index < this.activeOrdinarySyncLines.length; index += 1) {
      const line = this.activeOrdinarySyncLines[index];
      if (line !== null && (line.targetA === note || line.targetB === note)) {
        this.activeOrdinarySyncLines[index] = null;
      }
    }
  }

  private multipleDirectionalLinePoolIndicesForNote(note: NoteBase): readonly number[] {
    return Object.freeze(this.activeMultipleDirectionalLines.flatMap((line) =>
      line !== null && (line.targetA === note || line.targetB === note)
        ? [line.poolIndex]
        : []
    ));
  }

  private releaseMultipleDirectionalLinesForNote(note: NoteBase): void {
    for (let index = 0; index < this.activeMultipleDirectionalLines.length; index += 1) {
      const line = this.activeMultipleDirectionalLines[index];
      if (line !== null && (line.targetA === note || line.targetB === note)) {
        this.activeMultipleDirectionalLines[index] = null;
      }
    }
  }

  private ordinarySyncLineOwnerState(
    line: ActiveOrdinarySyncLine,
  ): SimulatorResult<OrdinarySyncLineOwnerState> {
    if (this.ordinaryNoteScene?.syncLineEdgeMargin === undefined) {
      return integrityFailure(
        "render.note.sync-line-scene-unavailable",
        ["RPR-D06", "RPR-D13", "PR16", "PR39"],
        "Simultaneous-line geometry requires the explicit typed edge margin.",
      );
    }
    const targetA = this.syncEndpointTransform(line.targetA, line.afterA);
    const targetB = this.syncEndpointTransform(line.targetB, line.afterB);
    const informationA = line.targetA.noteInformation;
    const informationB = line.targetB.noteInformation;
    if (
      targetA === undefined ||
      targetB === undefined ||
      informationA === null ||
      informationB === null
    ) {
      return integrityFailure(
        "render.note.sync-line-target-state-unavailable",
        ["RPR-D06", "RPR-D13", "PR16", "PR39"],
        "Every active simultaneous line requires two committed ordinary transforms and their bound NoteInformation owners.",
      );
    }
    const lossyScaleA = createRenderFloat32(calculateOrdinaryNoteWorldScaleAxis(
      targetA.renderedTransform.localScale.x.value, targetA.motionState.noteParentScale.value,
    ));
    const lossyScaleB = createRenderFloat32(calculateOrdinaryNoteWorldScaleAxis(
      targetB.renderedTransform.localScale.x.value, targetB.motionState.noteParentScale.value,
    ));
    if (lossyScaleA.status !== "ok") return lossyScaleA;
    if (lossyScaleB.status !== "ok") return lossyScaleB;
    return ok(Object.freeze({
      targetA: Object.freeze({
        position: targetA.renderedTransform.position,
        lossyScaleX: lossyScaleA.value,
        localScaleX: targetA.renderedTransform.localScale.x,
        gameNoteType: line.afterA
          ? informationA.slideNoteList[informationA.slideNoteList.length - 1]?.gameNoteType ?? GameNoteType.None
          : informationA.gameNoteType,
      }),
      targetB: Object.freeze({
        position: targetB.renderedTransform.position,
        lossyScaleX: lossyScaleB.value,
        localScaleX: targetB.renderedTransform.localScale.x,
        gameNoteType: line.afterB
          ? informationB.slideNoteList[informationB.slideNoteList.length - 1]?.gameNoteType ?? GameNoteType.None
          : informationB.gameNoteType,
      }),
      edgeMargin: this.ordinaryNoteScene.syncLineEdgeMargin,
    }));
  }

  private syncTailState(note: NoteBase): OrdinaryLongNormalChildState | undefined {
    const children = this.ordinarySlideRenderStates.get(note);
    return this.ordinaryLongRenderStates.get(note)
      ?? children?.[children.length - 1]?.lifecycle;
  }

  private syncEndpointTransform(note: NoteBase, after: boolean): OrdinaryRenderedNoteState | undefined {
    return after ? this.syncTailState(note) : this.ordinaryRenderMotionStates.get(note);
  }

  private syncEndpointMoving(note: NoteBase, after: boolean): boolean {
    if (!after) return note.state === NoteState.Move;
    if (note.state === NoteState.Deactive) return false;
    return this.syncTailState(note)?.phase === "move";
  }

  private syncLineForEndpoint(note: NoteBase, after: boolean): ActiveOrdinarySyncLine | null {
    let owned: ActiveOrdinarySyncLine | null = null;
    let incoming: ActiveOrdinarySyncLine | null = null;
    for (const line of this.activeOrdinarySyncLines) {
      if (line === null) continue;
      if (line.targetA === note && line.afterA === after &&
        (owned === null || line.connectionSequence > owned.connectionSequence)) owned = line;
      if (line.targetB === note && line.afterB === after &&
        (incoming === null || line.connectionSequence > incoming.connectionSequence)) incoming = line;
    }
    return owned ?? incoming;
  }

  private connectSyncEndpoints(
    targetA: NoteBase, afterA: boolean, targetB: NoteBase, afterB: boolean,
    existing: ActiveOrdinarySyncLine | null = null,
  ): SimulatorResult<void> {
    const childrenA = targetA.noteInformation?.slideNoteList;
    const childrenB = targetB.noteInformation?.slideNoteList;
    const first = afterA ? childrenA?.[childrenA.length - 1] : targetA.noteInformation;
    const second = afterB ? childrenB?.[childrenB.length - 1] : targetB.noteInformation;
    if (first && second && !this.extensionSyncConnection(first, second)) return ok(undefined);
    if (!this.inGameCalculatedData.isSyncLineEnabled) {
      this.suppressedOrdinarySyncLinePairCountValue += 1;
      return ok(undefined);
    }
    const poolIndex = existing?.poolIndex ?? this.activeOrdinarySyncLines.findIndex((line) => line === null);
    if (poolIndex < 0) {
      return integrityFailure("render.note.sync-line-pool-exhausted", ["RPR-D06", "RPR-D13", "PR16", "PR39"],
        "The recovered 80-slot simultaneous-line pool has no inactive object.");
    }
    const line = Object.freeze({
      poolIndex, targetA, targetB, afterA, afterB,
      connectionSequence: this.syncConnectionSequence + 1,
    });
    const ownerState = this.ordinarySyncLineOwnerState(line);
    if (ownerState.status !== "ok") return ownerState;
    // Original Setup resets width to zero; the following OnUpdate publishes visible geometry.
    const prepared = this.renderProducer!.preflightOrdinarySyncLine(poolIndex, ownerState.value, false);
    if (prepared.status !== "ok") return prepared;
    const committed = prepared.value.commit();
    if (committed.status !== "ok") return committed;
    this.syncConnectionSequence = line.connectionSequence;
    this.activeOrdinarySyncLines[poolIndex] = line;
    return ok(undefined);
  }

  private isSameFrontTailDirectionalGroup(tail: NoteBase, front: NoteBase, maxRange = 2): boolean {
    return this.syncRules.isSameFrontTailDirectionalGroup(tail, front, maxRange);
  }

  private connectOrdinarySyncLines(activatedNotes: readonly NoteBase[]): SimulatorResult<void> {
    if (this.renderProducer === null || this.renderProducer.isDegradedHabahiro()) return ok(undefined);
    return this.syncRules.connectOrdinarySyncLines(activatedNotes);
  }

  private updateOrdinarySyncLines(): SimulatorResult<void> {
    if (this.renderProducer === null || this.renderProducer.isDegradedHabahiro()) return ok(undefined);
    for (const line of this.activeOrdinarySyncLines) {
      if (line === null) continue;
      const ownerState = this.ordinarySyncLineOwnerState(line);
      if (ownerState.status !== "ok") return ownerState;
      const prepared = this.renderProducer.preflightOrdinarySyncLine(
        line.poolIndex,
        ownerState.value,
        this.syncEndpointMoving(line.targetA, line.afterA) && this.syncEndpointMoving(line.targetB, line.afterB),
      );
      if (prepared.status !== "ok") return prepared;
      const committed = prepared.value.commit();
      if (committed.status !== "ok") return committed;
    }
    return ok(undefined);
  }

  private multipleDirectionalLineOwnerState(
    line: ActiveMultipleDirectionalLine,
  ): SimulatorResult<{
    readonly targetA: OrdinaryNoteMotionResult;
    readonly targetB: OrdinaryNoteMotionResult;
  }> {
    const targetA = this.syncEndpointTransform(line.targetA, line.afterA);
    const targetB = this.syncEndpointTransform(line.targetB, line.afterB);
    if (targetA === undefined || targetB === undefined) {
      return integrityFailure(
        "render.note.multiple-directional-line-target-state-unavailable",
        ["RPR-R4-010", "RPR-R4-013", "PR09", "PR17"],
        "Every active MultipleDirectional back line requires two committed root transforms.",
      );
    }
    return ok(Object.freeze({
      targetA: targetA.renderedTransform,
      targetB: targetB.renderedTransform,
    }));
  }

  private connectDirectionalEndpoints(
    targetA: NoteBase, afterA: boolean, targetB: NoteBase, afterB: boolean,
  ): SimulatorResult<void> {
    const poolIndex = this.activeMultipleDirectionalLines.findIndex((line) => line === null);
    if (poolIndex < 0) {
      return integrityFailure("render.note.multiple-directional-line-pool-exhausted",
        ["RPR-R4-010", "RPR-R4-013", "PR09", "PR17"],
        "The recovered 60-slot MultipleDirectional back-line pool has no inactive object.");
    }
    const information = targetA.noteInformation!;
    const gameType = afterA
      ? information.slideNoteList[information.slideNoteList.length - 1]?.gameNoteType
      : information.gameNoteType;
    const left = gameType === undefined
      ? information.afterNoteType === AfterNoteType.MultipleDirectionalFlickLeft ||
        information.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft
      : [10, 14, 16, 18, 20, 22].includes(gameType);
    const line: ActiveMultipleDirectionalLine = Object.freeze({
      poolIndex, targetA, targetB, afterA, afterB, materialDirection: left ? "left" : "right",
    });
    const ownerState = this.multipleDirectionalLineOwnerState(line);
    if (ownerState.status !== "ok") return ownerState;
    const prepared = this.renderProducer!.preflightOrdinaryMultipleDirectionalLine(
      poolIndex, ownerState.value, line.materialDirection, "initialize");
    if (prepared.status !== "ok") return prepared;
    const committed = prepared.value.commit();
    if (committed.status !== "ok") return committed;
    this.activeMultipleDirectionalLines[poolIndex] = line;
    return this.updateDirectionalConnectionPresentation(line);
  }

  private updateDirectionalConnectionPresentation(line: ActiveMultipleDirectionalLine): SimulatorResult<void> {
    const a = this.syncEndpointTransform(line.targetA, line.afterA)!;
    const b = this.syncEndpointTransform(line.targetB, line.afterB)!;
    const button = (note: NoteBase, after: boolean) => after
      ? directionalEndpointButton(note.noteInformation!) : note.noteInformation!.buttonType;
    const toRight = button(line.targetA, line.afterA) > button(line.targetB, line.afterB);
    // B connects to A first; reciprocal setup restores B. Keep the source's
    // application depth offset, without reproducing instruction rounding.
    const z = createRenderFloat32(Math.fround(b.renderedTransform.position.z.value +
      (toRight === (line.materialDirection === "left") ? 0.00001 : -0.00001)));
    if (z.status !== "ok") return z;
    const motion = Object.freeze({ ...a.renderedTransform, position: Object.freeze({
      x: b.renderedTransform.position.x, y: b.renderedTransform.position.y, z: z.value,
    }) });
    const plan = (note: NoteBase, after: boolean, transform: DirectionalNotePresentationPlan["transform"]):
      DirectionalNotePresentationPlan => {
      const children = this.ordinarySlideRenderStates.get(note);
      const ownButton = button(note, after);
      const hasDirectionalNeighbor = this.activeMultipleDirectionalLines.some((edge) => {
        if (edge === null) return false;
        const other = edge.targetA === note && edge.afterA === after ? { note: edge.targetB, after: edge.afterB }
          : edge.targetB === note && edge.afterB === after ? { note: edge.targetA, after: edge.afterA } : null;
        // Add's icon selector uses its Add neighbor, not its separate tail link.
        if (other === null || (!after && note instanceof NoteMultipleDirectionalVisual && other.after)) return false;
        const difference = button(other.note, other.after) - ownButton;
        return line.materialDirection === "left" ? difference < 0 : difference > 0;
      });
      return { poolObjectId: note.poolObjectId, childIndex: !after ? null
        : children === undefined ? -1 : children.length - 1,
        iconVisible: !hasDirectionalNeighbor, transform };
    };
    const prepared = this.renderProducer!.preflightDirectionalConnectionPresentation([
      plan(line.targetA, line.afterA, { motion, parentScale: a.motionState.noteParentScale }),
      plan(line.targetB, line.afterB, null),
    ], this.ordinaryNoteScene!);
    if (prepared.status !== "ok") return prepared;
    const committed = prepared.value.commit();
    if (committed.status !== "ok") return committed;
    const updated = Object.freeze({ ...a,
      motionState: Object.freeze({ ...a.motionState, currentPositionZ: z.value }), renderedTransform: motion,
    });
    if (!line.afterA) this.ordinaryRenderMotionStates.set(line.targetA, updated);
    else if (this.ordinaryLongRenderStates.has(line.targetA)) {
      this.ordinaryLongRenderStates.set(line.targetA, { ...this.ordinaryLongRenderStates.get(line.targetA)!, ...updated });
    } else {
      const children = this.ordinarySlideRenderStates.get(line.targetA)!;
      this.ordinarySlideRenderStates.set(line.targetA, children.map((child, index) => index + 1 === children.length
        ? Object.freeze({ ...child, lifecycle: Object.freeze({ ...child.lifecycle, ...updated }) }) : child));
    }
    return ok(undefined);
  }

  private connectMultipleDirectionalLines(activatedNotes: readonly NoteBase[]): SimulatorResult<void> {
    if (this.renderProducer === null || this.renderProducer.isDegradedHabahiro()) return ok(undefined);
    let previous: NoteBase | null = null;
    for (const current of activatedNotes) {
      const information = current.noteInformation!;
      if (information.isInvisible) continue;
      if (information.gameNoteType >= GameNoteType.LongDirectionalFlickLeftAdd &&
        information.gameNoteType <= GameNoteType.SlideBDirectionalFlickRightAdd) {
        const candidateIndex = this.pendingDirectionalSyncTailNotes.findIndex((tail) =>
          tail.noteInformation !== null &&
          directionalEndpointPosition(tail.noteInformation) === information.absolutePos &&
          this.isSameFrontTailDirectionalGroup(tail, current, 1));
        const tail = this.pendingDirectionalSyncTailNotes[candidateIndex];
        if (tail !== undefined) {
          const connected = this.connectDirectionalEndpoints(tail, true, current, false);
          if (connected.status !== "ok") return connected;
          this.pendingDirectionalSyncTailNotes.splice(candidateIndex, 1);
        }
      }
      if (previous !== null) {
        const before = previous.noteInformation!;
        const frontGroup = before.fireNoteType === FrontNoteType.MultipleDirectionalFlick &&
          information.fireNoteType === FrontNoteType.MultipleDirectionalFlick &&
          before.gameNoteType === information.gameNoteType &&
          Math.abs(before.buttonType - information.buttonType) === 1;
        const addLong = before.fireNoteType === FrontNoteType.LongMultipleDirectionalFlickAdd &&
          information.fireNoteType === FrontNoteType.LongMultipleDirectionalFlickAdd;
        const addSlide = (before.fireNoteType === FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
          before.fireNoteType === FrontNoteType.SlideBMultipleDirectionalFlickAdd) &&
          (information.fireNoteType === FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
            information.fireNoteType === FrontNoteType.SlideBMultipleDirectionalFlickAdd);
        if (frontGroup || ((addLong || addSlide) && isSameDirectionalGroup(before, information))) {
          const connected = this.connectDirectionalEndpoints(current, false, previous, false);
          if (connected.status !== "ok") return connected;
        }
      }
      previous = current;
    }
    for (const visual of activatedNotes) {
      if (!(visual instanceof NoteMultipleDirectionalVisual)) continue;
      const button = visual.noteInformation!.buttonType;
      const tails = this.directionalSyncEndpoints(visual, false)
        .filter((endpoint) => endpoint.after)
        .map((endpoint) => ({ note: endpoint.note, information: endpoint.note.noteInformation! }))
        .sort((a, b) => directionalEndpointButton(a.information) - directionalEndpointButton(b.information));
      this.directionalVisualTailOwners.set(visual, {
        left: tails.filter((owner) => directionalEndpointButton(owner.information) < button).slice(-1)[0] ?? null,
        right: tails.find((owner) => directionalEndpointButton(owner.information) > button) ?? null,
      });
    }
    return ok(undefined);
  }

  private directionalVisualState(visual: NoteMultipleDirectionalVisual): NoteState {
    const owners = this.directionalVisualTailOwners.get(visual);
    // NotesCheck gives the left tail precedence, including its Deactive state.
    const owner = owners?.left ?? owners?.right;
    if (owner === undefined || owner === null || owner.note.state === NoteState.Deactive ||
      owner.note.noteInformation !== owner.information) return NoteState.Deactive;
    const phase = this.syncTailState(owner.note)?.phase;
    return phase === "wait" ? NoteState.Wait : phase === "stop" ? NoteState.Stop : NoteState.Move;
  }

  private directionalSyncEndpoints(note: NoteBase, after: boolean): Array<{ note: NoteBase; after: boolean }> {
    const start = { note, after };
    const fire = note.noteInformation!.fireNoteType;
    // Front MultipleDirectionalFlick inherits the base GetFarLeft/Right self result.
    if (!after && fire !== FrontNoteType.LongMultipleDirectionalFlickAdd &&
      fire !== FrontNoteType.SlideAMultipleDirectionalFlickAdd &&
      fire !== FrontNoteType.SlideBMultipleDirectionalFlickAdd) return [start];
    const endpoints = [start];
    for (let i = 0; i < endpoints.length; i += 1) {
      const endpoint = endpoints[i]!;
      for (const line of this.activeMultipleDirectionalLines) {
        if (line === null) continue;
        let other: { note: NoteBase; after: boolean };
        if (line.targetA === endpoint.note && line.afterA === endpoint.after) {
          other = { note: line.targetB, after: line.afterB };
        } else if (line.targetB === endpoint.note && line.afterB === endpoint.after) {
          other = { note: line.targetA, after: line.afterA };
        } else continue;
        if (!endpoints.some((item) => item.note === other.note && item.after === other.after)) endpoints.push(other);
      }
    }
    return endpoints;
  }

  private directionalSyncExtremes(note: NoteBase, after: boolean): {
    readonly left: { readonly note: NoteBase; readonly after: boolean };
    readonly right: { readonly note: NoteBase; readonly after: boolean };
  } {
    const start = { note, after };
    const endpoints = this.directionalSyncEndpoints(note, after);
    const button = (endpoint: typeof start) => endpoint.after
      ? directionalEndpointButton(endpoint.note.noteInformation!) : endpoint.note.noteInformation!.buttonType;
    let left = start, right = start;
    for (const endpoint of endpoints) {
      if (button(endpoint) < button(left)) left = endpoint;
      if (button(endpoint) > button(right)) right = endpoint;
    }
    return { left, right };
  }

  private reconnectDirectionalSyncLines(batchPosition: number): SimulatorResult<void> {
    if (this.renderProducer === null || this.renderProducer.isDegradedHabahiro()) return ok(undefined);
    for (const line of this.activeOrdinarySyncLines) {
      if (line === null) continue;
      const informationA = line.targetA.noteInformation!;
      const informationB = line.targetB.noteInformation!;
      const position = line.afterA ? directionalEndpointPosition(informationA) : informationA.absolutePos;
      if (position !== batchPosition) continue;
      const a = this.directionalSyncExtremes(line.targetA, line.afterA);
      const b = this.directionalSyncExtremes(line.targetB, line.afterB);
      const buttonA = line.afterA ? directionalEndpointButton(informationA) : informationA.buttonType;
      const buttonB = line.afterB ? directionalEndpointButton(informationB) : informationB.buttonType;
      const [owner, other] = selectDirectionalSyncEndpoints(a, b, buttonA, buttonB);
      const connected = this.connectSyncEndpoints(owner.note, owner.after, other.note, other.after, line);
      if (connected.status !== "ok") return connected;
    }
    return ok(undefined);
  }

  private updateMultipleDirectionalLines(): SimulatorResult<void> {
    if (this.renderProducer === null || this.renderProducer.isDegradedHabahiro()) return ok(undefined);
    for (const line of this.activeMultipleDirectionalLines) {
      if (line === null) continue;
      const ownerState = this.multipleDirectionalLineOwnerState(line);
      if (ownerState.status !== "ok") return ownerState;
      const prepared = this.renderProducer.preflightOrdinaryMultipleDirectionalLine(
        line.poolIndex,
        ownerState.value,
        line.materialDirection,
        this.syncEndpointMoving(line.targetA, line.afterA) && this.syncEndpointMoving(line.targetB, line.afterB) ? "show" : "hide",
      );
      if (prepared.status !== "ok") return prepared;
      const committed = prepared.value.commit();
      if (committed.status !== "ok") return committed;
    }
    return ok(undefined);
  }

  private activateCurrentBatch(substepIndex: number): SimulatorResult<void> {
    const batch = this.batches[this.nextBatchIndexValue];
    if (batch === undefined) {
      return ok(undefined);
    }

    const activationDecision = this.clock.canActivateBatch(batch);
    if (activationDecision.status !== "ok") {
      return activationDecision;
    }
    if (!activationDecision.value) {
      return ok(undefined);
    }

    if (this.renderProducer !== null && !this.renderProducer.isDegradedHabahiro()) {
      const authorization = validateOrdinaryRenderedBatchAuthorization(batch.informationList);
      if (authorization.status !== "ok") return authorization;
    }

    const bpmCommand = batch.informationList.find(isBpmCommand);
    if (bpmCommand !== undefined) {
      const bpmObject = this.acquireBpmObject();
      if (bpmObject.status !== "ok") {
        return bpmObject;
      }
      this.musicScoreController.updateNextBpm(
        bpmCommand.bpm,
        bpmCommand.bpmString,
      );
      bpmObject.value.setup(
        bpmCommand,
        (completed) => this.removeActiveBpmChange(completed),
      );
      this.activeBpmChangesValue.push(bpmObject.value);
    }

    const activatedRenderedNotes: NoteBase[] = [];
    for (const noteInformation of batch.informationList) {
      if (isNonPlayableCommand(noteInformation)) {
        continue;
      }
      const noteResult = this.acquirePoolObject(noteInformation);
      if (noteResult.status !== "ok") {
        return noteResult;
      }
      let renderActivation: RenderOwnerTransaction | null = null;
      let renderedState: OrdinaryRenderedNoteState | null = null;
      let longChildState: OrdinaryLongNormalChildState | null = null;
      let slideChildStates: readonly OrdinarySlideChildState[] | null = null;
      if (this.renderProducer !== null) {
        if (this.ordinaryNoteScene === null) {
          return integrityFailure(
            "render.note.ordinary-scene-unavailable",
            ["RPR-D05", "RPR-D13", "PR10", "PR39"],
            "A rendered ordinary Note cannot activate without its explicit typed fixed-scene input.",
          );
        }
        const noteBpm = createRenderFloat32(Math.fround(
          this.musicScoreController.nextBpm,
        ));
        if (noteBpm.status !== "ok") return noteBpm;
        const launcherMusicPosition = createRenderFloat32(Math.fround(
          this.musicScoreController.launcherMusicPosition,
        ));
        if (launcherMusicPosition.status !== "ok") return launcherMusicPosition;
        const prepared = this.renderProducer.preflightOrdinaryNoteActivation(
          noteResult.value.note.poolObjectId,
          noteInformation,
          noteBpm.value,
          launcherMusicPosition.value,
          this.ordinaryNoteScene,
          this.inGameCalculatedData.noteColor,
          substepIndex,
          (position) => createRenderFloat32(
            this.musicScoreController.getBpmAtNotePosition(position),
          ),
        );
        if (prepared.status !== "ok") return prepared;
        renderActivation = prepared.value.transaction;
        renderedState = Object.freeze({
          motionState: prepared.value.motionState,
          renderedTransform: prepared.value.renderedTransform,
          ...(noteResult.value.note instanceof NoteSlide ? { slideJudgeY: prepared.value.renderedTransform.position.y.value } : {}),
        });
        longChildState = prepared.value.longChildState;
        slideChildStates = prepared.value.slideChildStates;
      }
      const activationResult = noteResult.value.note.activate(noteInformation);
      if (activationResult.status !== "ok") {
        renderActivation?.discard();
        return activationResult;
      }
      noteResult.value.pool.cursor = noteResult.value.nextCursor;
      if (renderActivation !== null) {
        const committed = renderActivation.commit();
        if (committed.status !== "ok") return committed;
      }
      if (renderedState !== null) {
        this.ordinaryRenderMotionStates.set(noteResult.value.note, renderedState);
        activatedRenderedNotes.push(noteResult.value.note);
      }
      if (longChildState !== null) {
        this.ordinaryLongRenderStates.set(noteResult.value.note, longChildState);
      }
      if (slideChildStates !== null) {
        this.ordinarySlideRenderStates.set(noteResult.value.note, slideChildStates);
      }
    }

    const syncLineActivation = this.connectOrdinarySyncLines(activatedRenderedNotes);
    if (syncLineActivation.status !== "ok") return syncLineActivation;
    const multipleDirectionalLineActivation =
      this.connectMultipleDirectionalLines(activatedRenderedNotes);
    if (multipleDirectionalLineActivation.status !== "ok") {
      return multipleDirectionalLineActivation;
    }
    const firstInformation = batch.informationList[0];
    if (firstInformation !== undefined) {
      const reconnected = this.reconnectDirectionalSyncLines(firstInformation.absolutePos);
      if (reconnected.status !== "ok") return reconnected;
    }
    this.nextBatchIndexValue += 1;
    return ok(undefined);
  }

  private acquireBpmObject(): SimulatorResult<NoteBpmChange> {
    for (let offset = 0; offset < this.bpmPoolValue.length; offset += 1) {
      const index = (this.bpmPoolCursorValue + offset) % this.bpmPoolValue.length;
      const object = this.bpmPoolValue[index];
      if (object === undefined || object.isActive) {
        continue;
      }
      this.bpmPoolCursorValue = (index + 1) % this.bpmPoolValue.length;
      return ok(object);
    }
    return integrityFailure(
      "note-manager.bpm-pool-exhausted",
      ["E07", "E10"],
      "The recovered 30-slot BPM pool has no inactive object.",
    );
  }

  private acquirePoolObject(
    noteInformation: NoteInformation,
  ): SimulatorResult<NotePoolAcquisition> {
    const familyResult = noteFamily(noteInformation);
    if (familyResult.status !== "ok") {
      return familyResult;
    }
    const family = familyResult.value;
    const pool = this.notePoolsValue.get(family);
    if (pool === undefined || pool.objects.length === 0) {
      return integrityFailure(
        "note-manager.pool-missing",
        ["E06", "E10"],
        `No ${family} pool exists for note ${noteInformation.index}.`,
      );
    }

    for (let offset = 0; offset < pool.objects.length; offset += 1) {
      const index = (pool.cursor + offset) % pool.objects.length;
      const note = pool.objects[index];
      if (note === undefined || note.state !== NoteState.Deactive) {
        continue;
      }
      return ok({
        note,
        pool,
        nextCursor: (index + 1) % pool.objects.length,
      });
    }

    return integrityFailure(
      "note-manager.pool-exhausted",
      ["E04", "E06"],
      `No deactive ${family} pool object is available for note ${noteInformation.index}.`,
    );
  }

  private appendActiveNote(note: NoteBase): void {
    if (!this.activeNotesValue.includes(note)) {
      this.activeNotesValue.push(note);
    }
  }

  private removeActiveNote(note: NoteBase): void {
    const index = this.activeNotesValue.indexOf(note);
    if (index >= 0) {
      this.activeNotesValue.splice(index, 1);
    }
  }

  private removeActiveBpmChange(note: NoteBpmChange): void {
    const index = this.activeBpmChangesValue.indexOf(note);
    if (index >= 0) {
      this.activeBpmChangesValue.splice(index, 1);
    }
  }
}

export function selectSubstepCount(
  deltaTimeSeconds: number,
  bpmChangeCount: number,
  counters: PerformanceLevelCounters,
): 1 | 2 | 3 | 4 {
  if (bpmChangeCount < 1) {
    return 1;
  }

  const delta = Math.fround(deltaTimeSeconds);
  let bucketIndex: 0 | 1 | 2 | 3;
  let substepCount: 1 | 2 | 3 | 4;
  if (delta < 0.0179999992) {
    bucketIndex = 0;
    substepCount = 1;
  } else if (delta < 0.0329999998) {
    bucketIndex = 1;
    substepCount = 2;
  } else if (delta < 0.0500000007) {
    bucketIndex = 2;
    substepCount = 3;
  } else {
    bucketIndex = 3;
    substepCount = 4;
  }

  counters[bucketIndex] = (counters[bucketIndex] + 1) >>> 0;
  if (counters[1] > 100 || counters[2] > 20 || counters[3] > 5) {
    return 1;
  }
  return substepCount;
}

export function noteFamily(
  noteInformation: NoteInformation,
): SimulatorResult<NoteFamily> {
  switch (noteInformation.fireNoteType) {
    case FrontNoteType.Normal:
      return ok("normal");
    case FrontNoteType.Long:
      return ok("long");
    case FrontNoteType.Flick:
      return ok("flick");
    case FrontNoteType.SlideA:
    case FrontNoteType.SlideB:
      return ok("slide");
    case FrontNoteType.DirectionalFlick:
      return ok("directional-flick");
    case FrontNoteType.MultipleDirectionalFlick:
      return ok("multiple-directional-flick");
    case FrontNoteType.LongMultipleDirectionalFlickAdd:
    case FrontNoteType.SlideAMultipleDirectionalFlickAdd:
    case FrontNoteType.SlideBMultipleDirectionalFlickAdd:
      return ok("multiple-directional-visual");
    default:
      return integrityFailure(
        "note-manager.unrepresented-note-family",
        ["E11", "E13"],
        `FrontNoteType ${noteInformation.fireNoteType} has no recovered playable-root pool mapping.`,
      );
  }
}

export function validateOrdinaryRenderedBatchAuthorization(
  informationList: readonly NoteInformation[],
): SimulatorResult<void> {
  for (const information of informationList) {
    if (isNonPlayableCommand(information) || information.fireNoteType === FrontNoteType.Normal) {
      continue;
    }
    switch (information.fireNoteType) {
      case FrontNoteType.Long:
        if (information.afterNoteAbsolutePos <= information.absolutePos) {
          return integrityFailure(
            "render.note.invalid-long-tail-position",
            ["RPR-R7-001", "PR08", "PR11", "PR15"],
            "Current Long production requires its authored tail position to follow the root.",
          );
        }
        continue;
      case FrontNoteType.Flick:
      case FrontNoteType.DirectionalFlick:
      case FrontNoteType.MultipleDirectionalFlick:
      case FrontNoteType.LongMultipleDirectionalFlickAdd:
      case FrontNoteType.SlideAMultipleDirectionalFlickAdd:
      case FrontNoteType.SlideBMultipleDirectionalFlickAdd:
        continue;
      case FrontNoteType.SlideA:
      case FrontNoteType.SlideB:
        if (
          information.slideNoteList.length > 0 &&
          information.slideNoteList.every((source) =>
            source.absolutePos >= information.absolutePos)
        ) {
          continue;
        }
        return integrityFailure(
          "render.note.invalid-slide-child-chain",
          ["RPR-R7-001", "PR08", "PR09", "PR15", "PR39"],
          "Current Slide production requires a non-empty chart-owned ordered child chain.",
        );
      default:
        return integrityFailure(
          "render.note.ordinary-child-lifecycle-evidence-required",
          ["RPR-R7-001", "PR06", "PR09", "PR39"],
          "Every rendered family must have a current R7 production owner route.",
        );
    }
  }
  return ok(undefined);
}

export function groupMultipleDirectionalInformationList(
  informationList: readonly NoteInformation[],
): readonly (readonly NoteInformation[])[] {
  const groups: NoteInformation[][] = [];
  let currentGroup: NoteInformation[] = [];
  for (const information of informationList) {
    if (isNonPlayableCommand(information)) {
      continue;
    }
    if (information.fireNoteType !== FrontNoteType.MultipleDirectionalFlick) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      continue;
    }
    const previous = currentGroup[currentGroup.length - 1];
    if (
      previous !== undefined &&
      previous.gameNoteType === information.gameNoteType &&
      Math.abs(previous.buttonType - information.buttonType) === 1
    ) {
      currentGroup.push(information);
      continue;
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    currentGroup = [information];
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  return groups;
}

function isBpmCommand(noteInformation: NoteInformation): boolean {
  return noteInformation.ccNum === 3 || noteInformation.ccNum === 8;
}

function validateBpmCommand(
  noteInformation: NoteInformation,
): SimulatorResult<void> {
  if (!isBpmCommand(noteInformation)) {
    return ok(undefined);
  }
  const bpm = Math.fround(noteInformation.bpm);
  if (
    noteInformation.denominator === 0 ||
    !Number.isFinite(noteInformation.bpm) ||
    !Number.isFinite(bpm) ||
    bpm <= 0 ||
    noteInformation.bpmString.length === 0
  ) {
    return integrityFailure(
      "runtime.invalid-bpm-command",
      ["E07", "E10", "U03"],
      "CC03/CC08 commands require a nonzero denominator, positive finite BPM and original string before scheduler mutation.",
    );
  }
  return ok(undefined);
}

function isNonPlayableCommand(noteInformation: NoteInformation): boolean {
  return noteInformation.buttonType === ButtonType.None;
}

const unavailableManualInputGeometry: SimulatorManualInputGeometryBackend = {
  resolveButton: () => integrityFailure(
    "manual-input.geometry-resolver-unavailable",
    ["D03", "D04", "D15", "MJ03", "MJ26"],
    "A direct NoteManager without a host geometry owner cannot resolve screen input.",
  ),
  screenToWorld: () => integrityFailure(
    "manual-input.screen-to-world-unavailable",
    ["D07", "MJ08", "MJ09"],
    "A direct NoteManager without a host geometry owner cannot project screen positions.",
  ),
  getDistanceNormalization: () => integrityFailure(
    "manual-input.distance-normalization-unavailable",
    ["D07", "MJ08", "MJ09"],
    "A direct NoteManager without a host geometry owner cannot provide native distance scales.",
  ),
  isInsideTargetButtons: () => integrityFailure(
    "manual-input.target-containment-unavailable",
    ["D09", "D10", "MJ14", "MJ20"],
    "A direct NoteManager without a host geometry owner cannot test target containment.",
  ),
};

function createUnavailableManualJudgementTransaction(): ManualJudgementTransaction {
  return {
    preflight: () => integrityFailure(
      "one-frame.manual-transaction-owner-unregistered",
      ["D05", "D14", "D15", "MJ26"],
      "Production manual judgement requires the engine OneFrame controller transaction owner.",
    ),
    commit: () => {
      throw new Error("Unavailable manual judgement transaction cannot commit");
    },
    abort: () => {},
    finish: () => {},
  };
}

function createDefaultPoolObject(
  family: NoteFamily,
  poolObjectId: string,
): NoteBase {
  switch (family) {
    case "normal":
      return new NoteNormal(poolObjectId);
    case "long":
      return new NoteLong(poolObjectId);
    case "slide":
      return new NoteSlide(poolObjectId);
    case "flick":
      return new NoteFlick(poolObjectId);
    case "directional-flick":
      return new NoteDirectionalFlick(poolObjectId);
    case "multiple-directional-flick":
      return new NoteMultipleDirectionalFlick(poolObjectId);
    case "multiple-directional-visual":
      return new NoteMultipleDirectionalVisual(poolObjectId);
  }
}

function manualSlideTerminalNoteTypes(afterNoteType: number): readonly number[] {
  const finalType = afterNoteType === AfterNoteType.SlideFlickEnd ? 5
    : afterNoteType === AfterNoteType.SlideDirectionalFlickEndLeft ||
      afterNoteType === AfterNoteType.SlideDirectionalFlickEndRight ? 6
    : afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft ||
      afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight ? 7 : 8;
  // Timeout/onMiss uses 8 independently of the successful terminal family.
  return finalType === 8 ? [8] : [8, finalType];
}

function manualLongAfterNoteType(afterNoteType: number): 2 | 5 | 6 | 7 | null {
  switch (afterNoteType) {
    case AfterNoteType.Normal:
      return 2;
    case AfterNoteType.Flick:
      return 5;
    case AfterNoteType.DirectionalFlickLeft:
    case AfterNoteType.DirectionalFlickRight:
      return 6;
    case AfterNoteType.MultipleDirectionalFlickLeft:
    case AfterNoteType.MultipleDirectionalFlickRight:
      return 7;
    default:
      return null;
  }
}

class MultipleDirectionalGroupOwner implements MultipleDirectionalRuntimeGroup {
  private usedValue = false;
  private activeManualFingerId = -1;
  private readonly projectedManualFingers = new WeakMap<object, number>();
  readonly count: number;
  readonly buttonTypes: readonly ButtonTypeValue[];

  constructor(
    group: readonly NoteInformation[],
    getButtonType: (information: NoteInformation) => ButtonTypeValue =
      (information) => information.buttonType,
  ) {
    this.count = group.length;
    this.buttonTypes = Object.freeze(group.map(getButtonType));
  }

  get isUsed(): boolean {
    return this.usedValue;
  }

  preflightManualFinger(transaction: object, fingerId: number): SimulatorResult<void> {
    const projectedFinger = this.projectedManualFingers.get(transaction) ?? -1;
    if (
      this.usedValue ||
      (this.activeManualFingerId >= 0 && this.activeManualFingerId !== fingerId) ||
      (projectedFinger >= 0 && projectedFinger !== fingerId)
    ) {
      return integrityFailure(
        "manual.multiple-directional-finger-owner-conflict",
        ["D06", "D08", "D15", "MJ06", "MJ10", "MJ26"],
        "A Multiple Directional group accepts one owner finger before side consumption.",
      );
    }
    this.projectedManualFingers.set(transaction, fingerId);
    return ok(undefined);
  }

  commitManualFinger(transaction: object, fingerId: number): void {
    if (
      this.projectedManualFingers.get(transaction) !== fingerId ||
      (this.activeManualFingerId >= 0 && this.activeManualFingerId !== fingerId) ||
      this.usedValue
    ) {
      throw new Error("Multiple Directional manual finger owner changed after preflight");
    }
    this.activeManualFingerId = fingerId;
    this.projectedManualFingers.delete(transaction);
  }

  clearManualFinger(fingerId: number): void {
    if (this.activeManualFingerId === fingerId) {
      this.activeManualFingerId = -1;
    }
  }

  markUsed(): SimulatorResult<void> {
    if (this.usedValue) {
      return integrityFailure(
        "multiple-directional.group-already-used",
        ["R10", "R12", "R16", "D08", "MJ10"],
        "A connected Multiple Directional group produces one judgement before its side owner is consumed.",
      );
    }
    this.usedValue = true;
    return ok(undefined);
  }
}
