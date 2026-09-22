import { authoredEndpointPosition } from "../chart/noteGraph";
import { findBatchBpmCommand, isBpmCommand } from "../chart/noteGraph";
import { connectDirectionalMemberBatch, connectionDirection, directionalConnectionEndpoints, directionalConnectionPresentation, reconnectDirectionalSyncConnections, slideDirectionalAnchorEndpoint } from "../rendering/directionalConnectionRules";
import { noteMotionY, noteSpatialY, noteUnclippedSyncTarget } from "../rendering/ordinaryNoteGeometry";
import type { TapLaneEffectInputEvent } from "./tapLaneEffectOwner";
import { SyncLineConnectionRules } from "../rendering/syncLineConnectionRules";
import { virtualLaneUnit } from "../chart/virtualLane";
import type { HoldSoundEvent } from "../audio/audioCommandProducer";
import type { ManualInputPosition } from "../data/manualInput";

import {
  AfterNoteType,
  FrontNoteType,
  GameNoteType,
  type ButtonTypeValue,
  type NoteBatchInformation,
  type NoteInformation,
} from "../chart/types";
import {
  groupMultipleDirectionalInformationList,
  isNonPlayableCommand,
  directionalEndpointButton,
  directionalEndpointLane,
  frontEndpointLane,
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
} from "../result";
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
  usesIndependentVisualAxis(batch: NoteBatchInformation): boolean;
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
  readonly laneSpan?: import("../chart/types").NoteLaneSpan;
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

/** false: head, true: terminal, positive number: authored Slide connection index. */
export type NoteConnectionEndpoint = boolean | number;

interface ActiveOrdinarySyncLine {
  readonly poolIndex: number;
  readonly targetA: NoteBase;
  readonly targetB: NoteBase;
  readonly afterA: NoteConnectionEndpoint;
  readonly afterB: NoteConnectionEndpoint;
  readonly connectionSequence: number;
}

interface ActiveMultipleDirectionalLine {
  readonly poolIndex: number;
  readonly targetA: NoteBase;
  readonly targetB: NoteBase;
  readonly afterA: NoteConnectionEndpoint;
  readonly afterB: NoteConnectionEndpoint;
  readonly materialDirection: "left" | "right";
}

interface DirectionalVisualTailOwner {
  readonly note: NoteBase;
  readonly information: NoteInformation;
}

export interface ProjectedNoteGeometry {
  connectionBatchActivated(sources: readonly NoteInformation[]): void;
  candidateY(source: NoteInformation): ReturnType<typeof noteSpatialY> | undefined;
  advance(note: NoteBase, delta: number, placement: "perspective" | "target-button" | "preserve" | null, children: boolean,
    controlledRealMoveSecond?: OrdinaryNoteMotionState["realMoveSecond"]): SimulatorResult<void>;
  hasConnectionOwner(source: NoteInformation): boolean;
  connectionState(source: NoteInformation, after: NoteConnectionEndpoint): OrdinaryLongNormalChildState | undefined;
  setConnectionPresentation(source: NoteInformation, after: NoteConnectionEndpoint, iconVisible: boolean, state?: OrdinaryRenderedNoteState): void;
  reflectSlideOutput(note: NoteSlide): void;
  childPhase(source: NoteInformation, index: number): SimulatorResult<"wait" | "move" | "stop">;
  progress(source: NoteInformation): SimulatorResult<number>;
  judgeY(source: NoteInformation): SimulatorResult<number>;
  inside(position: ManualInputPosition, source: NoteInformation, isSweetCollision?: boolean): SimulatorResult<boolean>;
}

export class NoteManager {
  private projectedGeometry: ProjectedNoteGeometry | null = null;
  setProjectedGeometry(geometry: ProjectedNoteGeometry): void { this.projectedGeometry = geometry; }
  private readonly activeBySource = new Map<NoteInformation, NoteBase>();
  private readonly slidePresentationRoots = new Map<number, NoteInformation>();
  private readonly completedSlidePresentationRoots = new Set<NoteInformation>();
  private readonly projectedNotes = new WeakSet<NoteBase>();
  getActiveNote(source: NoteInformation): NoteBase | null { return this.activeBySource.get(source) ?? null; }

  private readonly activeNotesValue: NoteBase[] = [];
  private readonly activeBpmChangesValue: NoteBpmChange[] = [];
  private readonly bpmPoolValue = Array.from(
    { length: BPM_POOL_LENGTH },
    (_, index) => new NoteBpmChange(index),
  );
  private readonly notePoolsValue = new Map<NoteFamily, NotePool>();
  private readonly pendingTapLaneEffects: TapLaneEffectInputEvent[] = [];
  enqueueTapLaneEffect(event: TapLaneEffectInputEvent): void {
    if (event.kind !== "on" || !this.isMoveTime()) this.pendingTapLaneEffects.push(event);
  }
  takeTapLaneEffects(): readonly TapLaneEffectInputEvent[] { return this.pendingTapLaneEffects.splice(0); }

  private readonly pendingHoldSounds: HoldSoundEvent[] = [];

  takeHoldSounds(): readonly HoldSoundEvent[] { return this.pendingHoldSounds.splice(0); }
  private readonly performanceLevelCountersValue: PerformanceLevelCounters = [
    0, 0, 0, 0,
  ];
  private nextBatchIndexValue = 0;
  private catchingStartup = false;
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

  private readonly syncRules = new SyncLineConnectionRules<NoteBase, ActiveOrdinarySyncLine, NoteConnectionEndpoint>({
    pendingTails: this.pendingSyncTailNotes,
    pendingDirectionalTails: this.pendingDirectionalSyncTailNotes,
    position: () => this.musicScoreController.musicPosition,
    hasTail: note => this.syncTailState(note) !== undefined &&
      note.noteInformation?.slideNoteList[note.noteInformation.slideNoteList.length - 1]?.isInvisible !== true,
    lineFor: (note, after) => this.syncLineForEndpoint(note, after),
    connect: (a, afterA, b, afterB, existing) => this.connectSyncEndpoints(a, afterA, b, afterB, existing),
  });
  getCommittedNotePresentation(source: NoteInformation, longAfter = false) {
    for (const note of this.activeNotesValue) {
      const root = note.noteInformation;
      if (root === null) continue;
      const index = root.slideNoteList.indexOf(source);
      if (root !== source && index < 0) continue;
      const child = index < 0 ? undefined : this.ordinarySlideRenderStates.get(note)?.[index];
      const state = longAfter ? this.ordinaryLongRenderStates.get(note)
        : child?.lifecycle ?? this.ordinaryRenderMotionStates.get(note);
      if (state === undefined) return null;
      return {
        position: state.renderedTransform.position,
        unclipped: noteUnclippedSyncTarget(state.renderedTransform, state.motionState.noteParentScale),
        localScaleX: state.renderedTransform.localScale.x,
        slideEffectActive: note instanceof NoteSlide && note.flashAnimationRevision !== null,
        lossyScaleX: createRenderFloat32(calculateOrdinaryNoteWorldScaleAxis(
          state.renderedTransform.localScale.x.value, state.motionState.noteParentScale.value,
        )),
        visible: longAfter ? this.syncEndpointMoving(note, true)
          : child === undefined ? this.syncEndpointMoving(note, false) : child.visible && child.lifecycle.phase === "move",
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
            laneSpan: slideGestureSpan(noteInformation),
            sourceIndex: -1,
            phase: "head",
            allowedNoteTypes: Object.freeze([noteInformation.slideGesture?.noteType ?? 8]),
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
              : [source.slideGesture?.noteType ?? 8];
            this.manualSlideSources.set(source, Object.freeze({
              laneSpan: terminal && slideAfterGroup !== undefined ? directionalGroupSpan(slideAfterGroup) : slideGestureSpan(source) ?? source.laneSpan,
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

    const requiresMeshChildren = this.renderProducer !== null &&
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
        "A chart with ordinary Long or R4 Slide notes requires explicit safe-area ratio and base-mesh color before pool creation.",
      );
    }
    const requiresSyncLinePool = this.renderProducer !== null &&
      this.inGameCalculatedData.isSyncLineEnabled &&
      this.batches.reduce((count, batch) => count + batch.informationList.filter(information =>
        !isNonPlayableCommand(information) && this.hasConnectionOwner(information)).length, 0) > 1;
    if (
      requiresSyncLinePool &&
      (this.ordinaryNoteScene === null ||
        this.ordinaryNoteScene.syncLineEdgeMargin === undefined)
    ) {
      return integrityFailure(
        "render.note.sync-line-scene-unavailable",
        "A chart with simultaneous ordinary Normal notes requires the explicit typed sync-line edge margin.",
      );
    }
    const requiresMultipleDirectionalLinePool = this.renderProducer !== null &&
      this.batches.some((batch) => {
        const unprojected = batch.informationList.filter(source => this.hasConnectionOwner(source));
        return unprojected.some(information =>
          information.fireNoteType === FrontNoteType.LongMultipleDirectionalFlickAdd ||
          information.fireNoteType === FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
          information.fireNoteType === FrontNoteType.SlideBMultipleDirectionalFlickAdd) ||
          groupMultipleDirectionalInformationList(unprojected).some(group => group.length > 1);
      });
    const renderSetup = this.renderProducer?.preflightPoolSetup(
      [...familyNotes].flatMap(([family, notes]) =>
        notes.flatMap((information, index) => information.laneSpan !== undefined ? [] : [Object.freeze({
          family,
          poolObjectId: `${family}:${index}`,
          ...(family === "slide"
            ? { slideChildCount: information.slideNoteList.length }
            : {}),
        })])),
      requiresSyncLinePool ? SYNC_LINE_POOL_LENGTH : 0,
      requiresMultipleDirectionalLinePool
        ? MULTIPLE_DIRECTIONAL_LINE_POOL_LENGTH
        : 0,
    ) ?? null;
    if (renderSetup?.status === "integrity-failure") return renderSetup;

    for (const [family, notes] of familyNotes) {
      const objects = notes.map((source, index) => {
        const note = this.createPoolObject(family, `${family}:${index}`);
        if (source.laneSpan !== undefined) this.projectedNotes.add(note);
        note.onTapLaneEffect = event => this.enqueueTapLaneEffect(event);
        if (note instanceof NoteSlide || note instanceof NoteLong) note.onTouchKeepSound = (index, action) => {
          if (action === "start" && this.isMoveTime()) return;
          this.pendingHoldSounds.push({ ownerKey: `${note instanceof NoteSlide ? "slide" : "long"}:${index}`, action });
        };
        note.setLifecycleCallbacks({
          onActivate: (activeNote) => this.appendActiveNote(activeNote),
          onDeactivate: (inactiveNote) => {
            if (inactiveNote instanceof NoteSlide && inactiveNote.noteInformation !== null &&
                this.slidePresentationRoots.has(inactiveNote.noteInformation.index))
              this.completedSlidePresentationRoots.add(inactiveNote.noteInformation);
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
          isAutoPlay: this.inGameCalculatedData.isAutoPlay,
          shouldForcePerfect: () => this.inGameCalculatedData.isAutoPlay || this.isMoveTime(),
          getAdjustedMusicPosition: () => this.getAdjustedMusicPosition(),
          submitJudgement: this.submitAutoLiveJudgement,
        });
        note.registerManualRuntime({
          usesFoldedTime: this.musicScoreController.signedTempo?.folded === true,
          isStartupExpired: position => this.musicScoreController.signedTempo?.folded === true && position < this.musicScoreController.signedTempo.positionAtSeconds(0),
          getExecuteFrame: () => this.musicScoreController.executeFrame,
          getSlideChildPhase: (index) => {
            if (note.noteInformation?.laneSpan !== undefined && this.projectedGeometry !== null)
              return this.projectedGeometry.childPhase(note.noteInformation, index);
            const phase = this.ordinarySlideRenderStates.get(note)?.[index]?.lifecycle.phase;
            return phase === undefined
              ? integrityFailure("manual.slide-child-phase-unavailable",
                  "Slide timeout requires the committed child motion phase.")
              : ok(phase);
          },
          getAdjustedMusicPosition: () => this.getAdjustedMusicPosition(),
          getCurrentBpm: () => this.musicScoreController.currentBpm,
          getJudgementAdjustValueB: () => this.judgementAdjustValueB,
          hasCrossedMotionLine: () => {
            if (note.noteInformation?.laneSpan !== undefined && this.projectedGeometry !== null) {
              const progress = this.projectedGeometry.progress(note.noteInformation);
              return progress.status === "ok" ? ok(progress.value > 1) : progress;
            }
            const progress = this.ordinaryRenderMotionStates.get(note)?.motionState.progressRate.value;
            return progress === undefined
              ? integrityFailure("manual.note-motion-progress-unavailable",
                  "Long Move requires its committed motion progress.")
              : ok(progress > 1);
          },
          stopSlideHeadAtJudgeLine: () => {
            if (note.noteInformation?.laneSpan !== undefined && this.projectedGeometry !== null) {
              const progress = this.projectedGeometry.progress(note.noteInformation);
              const y = this.projectedGeometry.judgeY(note.noteInformation);
              const line = this.slideNoteManager.getVirtualPerfectLine(note.noteInformation);
              if (progress.status !== "ok") return progress;
              if (y.status !== "ok") return y;
              if (line.status !== "ok") return line;
              if (progress.value <= 1 || y.value > line.value) return ok(false);
              const placed = this.projectedGeometry.advance(note, 0, "target-button", false);
              return placed.status === "ok" ? ok(true) : placed;
            }
            const current = this.ordinaryRenderMotionStates.get(note);
            if (current === undefined || note.noteInformation === null) {
              return integrityFailure("manual.slide-head-motion-unavailable",
                "Slide Move requires its committed head motion.");
            }
            const line = this.slideNoteManager.getVirtualPerfectLine(note.noteInformation);
            if (line.status !== "ok") return line;
            if (current.motionState.progressRate.value <= 1 || noteMotionY(current.renderedTransform) > line.value) {
              return ok(false);
            }
            const snapped = this.advanceOrdinaryRenderMotion(note, 0, "target-button");
            return snapped.status === "ok" ? ok(true) : snapped;
          },
          judgeSlide: (source) => {
            const tempo = this.musicScoreController.signedTempo;
            if (tempo?.folded && !source.isInvisible && !this.inGameCalculatedData.isAutoPlay && !this.isMoveTime() &&
              source.absolutePos < tempo.positionAtSeconds(0))
              return ok({ result: -1 as const, correction: 0, hasReachedPerfectLine: false });
            if (note.noteInformation?.laneSpan !== undefined && this.projectedGeometry !== null) {
              const y = this.projectedGeometry.judgeY(source);
              return y.status === "ok" ? this.slideNoteManager.judge(source, y.value) : y;
            }
            const index = this.manualSlideSources.get(source)?.sourceIndex;
            const y = index === -1 ? this.ordinaryRenderMotionStates.get(note)?.slideJudgeY
              : index === undefined ? undefined : this.ordinarySlideRenderStates.get(note)?.[index]?.judgeY;
            return y === undefined
              ? integrityFailure("manual.slide-judge-motion-unavailable",
                  "Slide judgement requires the committed motion of its chart-owned node.")
              : this.slideNoteManager.judge(source, y);
          },
          isInsideSource: (position, source, buttons, isSweetCollision = false) => source.laneSpan !== undefined && this.projectedGeometry !== null
            ? this.projectedGeometry.inside(position, source, isSweetCollision) : this.manualInputGeometry.isInsideTargetButtons(position, buttons, isSweetCollision),
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
              note.noteInformation?.laneSpan === undefined,
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
        "SetupNotes must establish pools and active-list callbacks before ExecUpdate.",
      );
    }
    if (!Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0) {
      return integrityFailure(
        "note-manager.invalid-delta-time",
        "ExecUpdate requires a finite non-negative frame delta.",
      );
    }

    const frameDelta = Math.fround(deltaTimeSeconds);
    if (!Number.isFinite(frameDelta)) {
      return integrityFailure(
        "note-manager.delta-outside-float32",
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
    const firstFrame = this.outerFrameIndexValue === 0;
    this.outerFrameIndexValue += 1;

    for (let substepIndex = 0; substepIndex < substepCount; substepIndex += 1) {
      const renderSubstep = this.renderProducer?.beginSubstep(substepIndex);
      if (renderSubstep?.status === "integrity-failure") return renderSubstep;
      if (firstFrame && substepIndex === 0) {
        this.catchingStartup = true;
        try {
          const caughtUp = this.catchUpStartup(substepIndex);
          if (caughtUp.status !== "ok") return caughtUp;
        } finally { this.catchingStartup = false; }
      }
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
      const activeUpdate = this.updateActiveNotes(substepDelta);
      if (activeUpdate.status !== "ok") return activeUpdate;

      const activationResult = this.activateDueBatches(substepIndex);
      if (activationResult.status !== "ok") {
        return activationResult;
      }
    }

    return ok(undefined);
  }

  private updateActiveNotes(deltaTimeSeconds: number, selected?: ReadonlySet<NoteBase>): SimulatorResult<void> {
      let activeIndex = this.activeNotesValue.length - 1;
      while (activeIndex >= 0) {
        const note = this.activeNotesValue[activeIndex];
        if (note === undefined) {
          return integrityFailure(
            "note-manager.unrepresented-cross-note-mutation",
            "No recovered Update caller removes a different lower-index active Note in this stage.",
          );
        }
        if (selected !== undefined && !selected.has(note)) { activeIndex -= 1; continue; }
        if (this.renderProducer !== null && note instanceof NoteSlide && note.pendingBeganPlacement) {
          const placed = this.advanceOrdinaryRenderMotion(note, Math.fround(0), "preserve", true);
          if (placed.status !== "ok") return placed;
          note.commitBeganPlacement();
        }
        const stateBefore = note.state;
        const updateResult = note.executeUpdate(deltaTimeSeconds);
        if (updateResult.status !== "ok") {
          return updateResult;
        }
        if (this.renderProducer !== null && stateBefore === NoteState.Move && note.state === NoteState.Stop &&
          (note instanceof NoteLong || note instanceof NoteSlide) &&
          (this.inGameCalculatedData.isAutoPlay || this.isMoveTime())) {
          const repositioned = this.advanceOrdinaryRenderMotion(note, Math.fround(0), "perspective");
          if (repositioned.status !== "ok") return repositioned;
        }
        if (note.state !== NoteState.Deactive) {
          if (note instanceof NoteSlide && note.noteInformation?.laneSpan !== undefined) {
            const projected = this.advanceProjectedChildren(note, deltaTimeSeconds);
            if (projected?.status === "integrity-failure") return projected;
          }
          const children = this.updateOrdinarySlideChildren(deltaTimeSeconds, true, note);
          if (children.status !== "ok") return children;
          if (note instanceof NoteSlide) {
            const afterChildren = note.executeAfterChildrenUpdate();
            if (afterChildren.status !== "ok") return afterChildren;
            if (note.noteInformation?.laneSpan !== undefined) {
              this.projectedGeometry?.reflectSlideOutput(note);
            } else if (note.pendingRenderHides.size > 0 && (note.state as NoteState) !== NoteState.Deactive) {
              const reflected = this.reflectOrdinarySlideHides(note);
              if (reflected.status !== "ok") return reflected;
            }
          }
        }
        activeIndex -= 1;
      }

      for (const note of this.activeNotesValue) {
        if (note instanceof NoteSlide || note.noteInformation?.laneSpan === undefined) continue;
        const projected = this.advanceProjectedChildren(note, deltaTimeSeconds);
        if (projected?.status === "integrity-failure") return projected;
      }
      const longChildUpdate = this.updateOrdinaryLongChildren(deltaTimeSeconds);
      if (longChildUpdate.status !== "ok") {
        return longChildUpdate;
      }

      for (const visual of this.activeNotesValue.filter((note): note is NoteMultipleDirectionalVisual => note instanceof NoteMultipleDirectionalVisual)) {
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

    return ok(undefined);
  }

  private catchUpStartup(substepIndex: number): SimulatorResult<void> {
    const tempo = this.musicScoreController.signedTempo;
    if (!tempo?.folded) return ok(undefined);
    const cutoff = tempo.positionAtSeconds(0);
    while ((this.batches[this.nextBatchIndexValue]?.absolutePos ?? Infinity) < cutoff) {
      const batch = this.batches[this.nextBatchIndexValue]!;
      const activated = this.activateCurrentBatch(substepIndex);
      if (activated.status !== "ok") return activated;
      // Drain the shared state machines at the same clock instant, in connection order.
      // A graph-derived bound allows Move -> Wait -> Stop and each child exactly once.
      const owners = new Set(batch.informationList.flatMap(source => {
        const note = this.getActiveNote(source); return note === null ? [] : [note];
      }));
      const progress = () => [...owners].map(note => `${note.state}:${note instanceof NoteSlide ?
        `${note.headJudged}:${note.afterNotes.filter(child => child.judged).length}` : ""}`).join(";");
      const steps = batch.informationList.reduce((count, source) => count + 2 * source.slideNoteList.length + 4, 0);
      for (let step = 0; step < steps; step++) {
        const before = progress();
        const updated = this.updateActiveNotes(0, owners);
        if (updated.status !== "ok") return updated;
        if (progress() === before) break;
      }
    }
    return ok(undefined);
  }

  advanceNoteAnimations(deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.renderProducer !== null) {
      const animation = this.renderProducer.preflightNoteAnimationFrame(Math.fround(deltaTimeSeconds),
        this.activeNotesValue.flatMap((note) => note.noteInformation?.laneSpan === undefined && (note instanceof NoteLong || note instanceof NoteSlide)
          ? [{ poolObjectId: note.poolObjectId, revision: note.flashAnimationRevision }]
          : []));
      if (animation.status !== "ok") return animation;
      const committed = animation.value.commit();
      if (committed.status !== "ok") return committed;
    }
    return ok(undefined);
  }

  get hasPendingNotes(): boolean { return this.nextBatchIndexValue < this.batches.length || this.activeNotesValue.length > 0; }

  getAdjustedMusicPosition(): number {
    if (this.catchingStartup && this.musicScoreController.signedTempo?.folded) return this.musicScoreController.signedTempo.positionAtSeconds(0);
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
      judgementLaneSpan: slideSource?.laneSpan ?? directionalGroupSpan(this.multipleDirectionalGroups.get(noteInformation)),
      multipleDirectionalMembers: this.multipleDirectionalGroups.get(noteInformation)?.members,
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
  ): SimulatorResult<NoteBase | null> {
    let ordinaryCandidate: NoteBase | null = null;
    let ordinaryDistance = Number.POSITIVE_INFINITY;
    let slideCandidate: NoteSlide | null = null;
    const musicPosition = this.musicScoreController.musicPosition;

    for (const note of this.activeNotesValue) {
      if (note.noteInformation?.laneSpan !== undefined) {
        if (position === undefined || this.projectedGeometry === null || note instanceof NoteMultipleDirectionalVisual) continue;
        const source = note instanceof NoteSlide ? note.manualCandidateSource : note.noteInformation;
        if (source === null || this.projectedGeometry.candidateY(source) === undefined) continue;
        const inside = this.projectedGeometry.inside(position, source);
        if (inside.status !== "ok") return inside;
        if (!inside.value) continue;
      } else if (buttonType === null || !note.isContainsButton(buttonType)) continue;
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
          "Every active candidate in the owner scan must retain its activated NoteInformation.",
        );
      }
      const distance = Math.abs(information.absolutePos - musicPosition);
      if (distance < ordinaryDistance) {
        ordinaryCandidate = note;
        ordinaryDistance = distance;
      }
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
      ? integrityFailure("manual.candidate-button-owner-unavailable",
          "Near-line arbitration requires both candidates' committed local positions.")
      : this.slideNoteManager.selectNearJudgeLineSource(firstY, secondY);
  }


  getManualCandidatePresentation(note: NoteBase): { source: NoteInformation; y: ReturnType<typeof noteSpatialY> | undefined } | null {
    const source = note instanceof NoteSlide ? note.manualCandidateSource : note.noteInformation;
    if (source === null) return null;
    if (source.laneSpan !== undefined) return { source, y: this.projectedGeometry?.candidateY(source) };
    const index = this.manualSlideSources.get(source)?.sourceIndex;
    const motion = note instanceof NoteSlide && index !== undefined && index >= 0
      ? this.ordinarySlideRenderStates.get(note)?.[index]?.lifecycle.renderedTransform
      : this.ordinaryRenderMotionStates.get(note)?.renderedTransform;
    const y = motion === undefined ? undefined : noteSpatialY(motion);
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
    this.pendingTapLaneEffects.length = 0;
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
    this.activeBySource.clear();
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
    this.completedSlidePresentationRoots.clear();
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
          authoredEndpointPosition(candidate, true) === authoredEndpointPosition(root, true) &&
          isSameDirectionalGroup(root, candidate)),
      ];
      if (members.length < 2) {
        return integrityFailure(
          "manual.long-multiple-after-group-missing",
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
    const boundRoots = new Set(allInformation.flatMap(source => source.directionalSlideConnection === undefined
      ? [] : [source.directionalSlideConnection.rootIndex]));
    for (const source of allInformation) if (boundRoots.has(source.index)) this.slidePresentationRoots.set(source.index, source);
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
          authoredEndpointPosition(candidate, true) === authoredEndpointPosition(root, true) &&
          isSameDirectionalGroup(root, candidate)),
      ];
      if (members.length < 2) {
        return integrityFailure(
          "manual.slide-multiple-after-group-missing",
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
        this.multipleDirectionalGroups.get(information)?.count ??
        this.longAfterMultipleGroups.get(information)?.count ?? null,
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
    if (note.noteInformation?.laneSpan !== undefined) {
      const advanced = this.projectedGeometry?.advance(note, deltaTimeSeconds, placement, false, controlledRealMoveSecond) ?? ok(undefined);
      if (advanced.status !== "ok") return advanced;
      if (placement === null && note instanceof NoteSlide && this.slidePresentationRoots.has(note.noteInformation.index) &&
          note.noteInformation.slideGesture?.direction != null && !note.headJudged) {
        const head = this.projectedGeometry?.connectionState(note.noteInformation, false);
        if (head !== undefined) return this.advanceDirectionalVisualsForEndpoint(note, deltaTimeSeconds, head.motionState.realMoveSecond, false);
      }
      return ok(undefined);
    }
    if (this.renderProducer === null || this.ordinaryNoteScene === null) {
      return integrityFailure(
        "render.note.ordinary-scene-unavailable",
        "A rendered ordinary Note Move requires its producer and explicit typed fixed-scene input.",
      );
    }
    const current = this.ordinaryRenderMotionStates.get(note);
    if (current === undefined) {
      return integrityFailure(
        "render.note.motion-state-unavailable",
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
      note instanceof NoteSlide && placement !== null && note.state === NoteState.Stop ? note.noteInformation : null,
    );
    if (prepared.status !== "ok") return prepared;
    const committed = prepared.value.transaction.commit();
    if (committed.status !== "ok") return committed;
    this.ordinaryRenderMotionStates.set(note, Object.freeze({
      ...(note instanceof NoteSlide ? {
        slideJudgeY: placement !== null ? current.slideJudgeY! : noteMotionY(prepared.value.motion),
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

  private advanceDirectionalVisualsForEndpoint(
    tail: NoteBase,
    deltaTimeSeconds: number,
    realMoveSecond: OrdinaryNoteMotionState["realMoveSecond"],
    endpoint: NoteConnectionEndpoint = true,
  ): SimulatorResult<void> {
    const afterType = tail.noteInformation?.afterNoteType;
    if (endpoint === true && (this.directionalVisualTailOwners.size === 0 ||
      (afterType !== AfterNoteType.MultipleDirectionalFlickLeft &&
        afterType !== AfterNoteType.MultipleDirectionalFlickRight &&
        afterType !== AfterNoteType.SlideMultipleDirectionalFlickLeft &&
        afterType !== AfterNoteType.SlideMultipleDirectionalFlickRight))) return ok(undefined);
    const adjacentVisuals = (note: NoteBase, after: NoteConnectionEndpoint): NoteMultipleDirectionalVisual[] =>
      this.activeMultipleDirectionalLines.flatMap((line) => {
        if (line === null) return [];
        const other = line.targetA === note && line.afterA === after && !line.afterB ? line.targetB
          : line.targetB === note && line.afterB === after && !line.afterA ? line.targetA : null;
        return other instanceof NoteMultipleDirectionalVisual ? [other] : [];
      }).sort((a, b) => frontEndpointLane(b.noteInformation!) - frontEndpointLane(a.noteInformation!));
    const moveNeighbor = (neighbor: NoteMultipleDirectionalVisual): SimulatorResult<void> => {
      const current = this.syncEndpointTransform(neighbor, false);
      if (current === undefined) return integrityFailure(
        "render.note.directional-neighbor-motion-unavailable",
        "A connected Add visual requires its activated motion state.",
      );
      return this.advanceOrdinaryRenderMotion(neighbor, deltaTimeSeconds, null, false,
        current.motionState.realMoveSecond);
    };
    const affiliation = tail.noteInformation?.directionalMemberRootIndex;
    const movedMembers = affiliation === undefined && endpoint === true ? null : new Set<NoteMultipleDirectionalVisual>();
    for (const visual of adjacentVisuals(tail, endpoint)) {
      const moved = this.advanceOrdinaryRenderMotion(visual, deltaTimeSeconds, null, false, realMoveSecond);
      if (moved.status !== "ok") return moved;
      movedMembers?.add(visual);
      // Original Add.Move forwards NoteBase.Move only to immediate Add neighbors.
      for (const neighbor of adjacentVisuals(visual, false)) {
        const advanced = moveNeighbor(neighbor);
        if (advanced.status !== "ok") return advanced;
        movedMembers?.add(neighbor);
      }
    }
    if (movedMembers !== null) {
      // Approved expanded-member extension: continue the same graph's base Move calls,
      // once per farther member, retaining each member's ExecuteUpdate clock.
      for (const member of movedMembers) {
        for (const neighbor of adjacentVisuals(member, false)) {
          const binding = neighbor.noteInformation?.directionalSlideConnection;
          const sameGroup = endpoint === true ? neighbor.noteInformation?.directionalMemberRootIndex === affiliation
            : binding?.rootIndex === tail.noteInformation!.index && binding.connectionIndex === (endpoint || 0);
          if (!sameGroup || movedMembers.has(neighbor)) continue;
          const advanced = moveNeighbor(neighbor);
          if (advanced.status !== "ok") return advanced;
          movedMembers.add(neighbor);
        }
      }
    }
    return ok(undefined);
  }

  private advanceProjectedChildren(note: NoteBase, delta: number): SimulatorResult<void> {
    const source = note.noteInformation!;
    const endpoints: NoteConnectionEndpoint[] = [true];
    if (this.slidePresentationRoots.has(source.index) && this.hasConnectionOwner(source)) for (let index = 1; index < source.slideNoteList.length; index += 1) {
      const node = source.slideNoteList[index - 1]!;
      if (node.slideGesture?.direction != null && node.slideGesture.width > 1) endpoints.push(index || false);
    }
    const previous = endpoints.map(endpoint => this.projectedGeometry?.connectionState(source, endpoint));
    const advanced = this.projectedGeometry?.advance(note, delta, null, true) ?? ok(undefined);
    if (advanced.status !== "ok") return advanced;
    if (!this.hasConnectionOwner(source)) return ok(undefined);
    for (let index = 0; index < endpoints.length; index += 1) {
      const endpoint = endpoints[index]!;
      const next = this.projectedGeometry?.connectionState(source, endpoint);
      if (previous[index]?.phase !== "move" || next === undefined) continue;
      const moved = this.advanceDirectionalVisualsForEndpoint(note, delta, next.motionState.realMoveSecond, endpoint);
      if (moved.status !== "ok") return moved;
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
          "Active rendered Long children require their producer and typed ordinary scene.",
        );
    }
    const deltaTime = createRenderFloat32(Math.fround(deltaTimeSeconds));
    const launcherMusicPosition = this.musicScoreController.launcherMusicPosition;
    const adjustedMusicPosition = this.getAdjustedMusicPosition();
    if (deltaTime.status !== "ok") return deltaTime;
    for (const [note, childState] of this.ordinaryLongRenderStates) {
      const front = this.ordinaryRenderMotionStates.get(note);
      if (front === undefined) {
        return integrityFailure(
          "render.note.long-front-state-unavailable",
          "Every active rendered Long child requires its last committed front transform.",
        );
      }
      const prepared = this.renderProducer.preflightOrdinaryLongChildFrame(
        note.poolObjectId,
        childState,
        front.renderedTransform,
        Object.freeze({
          deltaTime: deltaTime.value,
          launcherMusicPosition: launcherMusicPosition,
          adjustedMusicPosition: adjustedMusicPosition,
        }),
        this.ordinaryNoteScene,
      );
      if (prepared.status !== "ok") return prepared;
      const committed = prepared.value.transaction.commit();
      if (committed.status !== "ok") return committed;
      this.ordinaryLongRenderStates.set(note, prepared.value.childState);
      if (childState.phase === "move") {
        const moved = this.advanceDirectionalVisualsForEndpoint(note, deltaTimeSeconds,
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
    onlyNote?: NoteBase,
  ): SimulatorResult<void> {
    if (onlyNote !== undefined && !this.ordinarySlideRenderStates.has(onlyNote)) return ok(undefined);
    if (this.renderProducer === null || this.ordinaryNoteScene === null) {
      return this.ordinarySlideRenderStates.size === 0
        ? ok(undefined)
        : integrityFailure(
          "render.slide.scene-unavailable",
          "Active R4 Slide children require their producer and typed ordinary scene.",
        );
    }
    const deltaTime = createRenderFloat32(Math.fround(deltaTimeSeconds));
    const launcherMusicPosition = this.musicScoreController.launcherMusicPosition;
    const adjustedMusicPosition = this.getAdjustedMusicPosition();
    if (deltaTime.status !== "ok") return deltaTime;
    const selected = onlyNote === undefined ? undefined : this.ordinarySlideRenderStates.get(onlyNote);
    const entries: Iterable<readonly [NoteBase, readonly OrdinarySlideChildState[]]> = onlyNote === undefined
      ? this.ordinarySlideRenderStates : selected === undefined ? [] : [[onlyNote, selected]];
    for (const [note, childStates] of entries) {
      const front = this.ordinaryRenderMotionStates.get(note);
      if (front === undefined) {
        return integrityFailure(
          "render.slide.front-state-unavailable",
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
          launcherMusicPosition: launcherMusicPosition,
          adjustedMusicPosition: adjustedMusicPosition,
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
          virtualLaneDeltaX: virtualLaneUnit(
            this.ordinaryNoteScene.goalPositions[0]!.x.value, this.ordinaryNoteScene.goalPositions[1]!.x.value,
          ),
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
        const moved = this.advanceDirectionalVisualsForEndpoint(note, deltaTimeSeconds,
          currentTail.lifecycle.motionState.realMoveSecond);
        if (moved.status !== "ok") return moved;
      }
      if (note instanceof NoteSlide) note.commitRenderHides();
    }
    return ok(undefined);
  }

  private reflectOrdinarySlideHides(note: NoteSlide): SimulatorResult<void> {
    const children = this.ordinarySlideRenderStates.get(note);
    if (children === undefined || this.renderProducer === null) return ok(undefined);
    const prepared = this.renderProducer.preflightOrdinarySlideHides(note.poolObjectId, children, note.pendingRenderHides);
    if (prepared.status !== "ok") return prepared;
    const committed = prepared.value.transaction.commit();
    if (committed.status !== "ok") return committed;
    this.ordinarySlideRenderStates.set(note, prepared.value.childStates);
    note.commitRenderHides();
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
        unclipped: noteUnclippedSyncTarget(targetA.renderedTransform, targetA.motionState.noteParentScale),
        lossyScaleX: lossyScaleA.value,
        localScaleX: targetA.renderedTransform.localScale.x,
        gameNoteType: line.afterA
          ? informationA.slideNoteList[informationA.slideNoteList.length - 1]?.gameNoteType ?? GameNoteType.None
          : informationA.gameNoteType,
      }),
      targetB: Object.freeze({
        position: targetB.renderedTransform.position,
        unclipped: noteUnclippedSyncTarget(targetB.renderedTransform, targetB.motionState.noteParentScale),
        lossyScaleX: lossyScaleB.value,
        localScaleX: targetB.renderedTransform.localScale.x,
        gameNoteType: line.afterB
          ? informationB.slideNoteList[informationB.slideNoteList.length - 1]?.gameNoteType ?? GameNoteType.None
          : informationB.gameNoteType,
      }),
      edgeMargin: this.ordinaryNoteScene.syncLineEdgeMargin,
    }));
  }

  private hasConnectionOwner(source: NoteInformation): boolean {
    return source.laneSpan === undefined || this.projectedGeometry?.hasConnectionOwner(source) === true;
  }

  private syncTailState(note: NoteBase): OrdinaryLongNormalChildState | undefined {
    if (note.noteInformation?.laneSpan !== undefined)
      return this.projectedGeometry?.connectionState(note.noteInformation, true);
    const children = this.ordinarySlideRenderStates.get(note);
    return this.ordinaryLongRenderStates.get(note)
      ?? children?.[children.length - 1]?.lifecycle;
  }

  private syncEndpointTransform(note: NoteBase, after: NoteConnectionEndpoint): OrdinaryRenderedNoteState | undefined {
    if (typeof after === "number") return note.noteInformation?.laneSpan !== undefined
      ? this.projectedGeometry?.connectionState(note.noteInformation, after)
      : this.ordinarySlideRenderStates.get(note)?.[after - 1]?.lifecycle;
    return after ? this.syncTailState(note) : note.noteInformation?.laneSpan !== undefined
      ? this.projectedGeometry?.connectionState(note.noteInformation, false) : this.ordinaryRenderMotionStates.get(note);
  }

  private syncEndpointMoving(note: NoteBase, after: NoteConnectionEndpoint): boolean {
    if (!after) return note.state === NoteState.Move &&
      (note.noteInformation?.laneSpan === undefined ||
        this.projectedGeometry?.connectionState(note.noteInformation, false)?.phase === "move");
    if (note.state === NoteState.Deactive) return false;
    return typeof after === "number" ? this.projectedGeometry?.connectionState(note.noteInformation!, after)?.phase === "move"
      : this.syncTailState(note)?.phase === "move";
  }

  private syncLineForEndpoint(note: NoteBase, after: NoteConnectionEndpoint): ActiveOrdinarySyncLine | null {
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

  private acquireConnectionPoolSlot<T>(pool: Array<T | null>, kind: "sync" | "directional"): SimulatorResult<number> {
    const inactive = pool.findIndex(line => line === null);
    if (inactive >= 0) return ok(inactive);
    const index = pool.length;
    const sync = kind === "sync";
    const prepared = this.renderProducer!.preflightPoolSetup([], sync ? index + 1 : 0, sync ? 0 : index + 1,
      { syncLine: sync ? index : 0, multipleDirectionalLine: sync ? 0 : index });
    if (prepared.status !== "ok") return prepared;
    const committed = prepared.value.commit();
    if (committed.status !== "ok") return committed;
    pool.push(null);
    return ok(index);
  }

  private connectSyncEndpoints(
    targetA: NoteBase, afterA: NoteConnectionEndpoint, targetB: NoteBase, afterB: NoteConnectionEndpoint,
    existing: ActiveOrdinarySyncLine | null = null,
  ): SimulatorResult<void> {
    if (authoredEndpointPosition(targetA.noteInformation!, afterA) !== authoredEndpointPosition(targetB.noteInformation!, afterB)) return ok(undefined);
    if (!this.inGameCalculatedData.isSyncLineEnabled) {
      this.suppressedOrdinarySyncLinePairCountValue += 1;
      return ok(undefined);
    }
    const acquired = existing === null ? this.acquireConnectionPoolSlot(this.activeOrdinarySyncLines, "sync") : ok(existing.poolIndex);
    if (acquired.status !== "ok") return acquired;
    const poolIndex = acquired.value;
    const line = Object.freeze({
      poolIndex, targetA, targetB, afterA, afterB,
      connectionSequence: this.syncConnectionSequence + 1,
    });
    const ownerState = this.ordinarySyncLineOwnerState(line);
    if (ownerState.status !== "ok") return ownerState;
    // Original Setup resets width to zero; the following OnUpdate publishes visible geometry.
    const prepared = this.renderProducer!.preflightOrdinarySyncLine(poolIndex, ownerState.value, false, this.ordinaryNoteScene!.noteLineClipY);
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
    if (this.renderProducer === null) return ok(undefined);
    return this.syncRules.connectOrdinarySyncLines(activatedNotes);
  }

  private updateOrdinarySyncLines(): SimulatorResult<void> {
    if (this.renderProducer === null) return ok(undefined);
    for (const line of this.activeOrdinarySyncLines) {
      if (line === null) continue;
      const ownerState = this.ordinarySyncLineOwnerState(line);
      if (ownerState.status !== "ok") return ownerState;
      const prepared = this.renderProducer.preflightOrdinarySyncLine(
        line.poolIndex,
        ownerState.value,
        this.syncEndpointMoving(line.targetA, line.afterA) && this.syncEndpointMoving(line.targetB, line.afterB),
        this.ordinaryNoteScene!.noteLineClipY,
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
        "Every active MultipleDirectional back line requires two committed root transforms.",
      );
    }
    return ok(Object.freeze({
      targetA: targetA.renderedTransform,
      targetB: targetB.renderedTransform,
    }));
  }

  private connectDirectionalEndpoints(
    targetA: NoteBase, afterA: NoteConnectionEndpoint, targetB: NoteBase, afterB: NoteConnectionEndpoint,
  ): SimulatorResult<void> {
    const acquired = this.acquireConnectionPoolSlot(this.activeMultipleDirectionalLines, "directional");
    if (acquired.status !== "ok") return acquired;
    const poolIndex = acquired.value;
    const line: ActiveMultipleDirectionalLine = Object.freeze({
      poolIndex, targetA, targetB, afterA, afterB, materialDirection: connectionDirection(targetA, afterA),
    });
    const ownerState = this.multipleDirectionalLineOwnerState(line);
    if (ownerState.status !== "ok") return ownerState;
    const prepared = this.renderProducer!.preflightOrdinaryMultipleDirectionalLine(
      poolIndex, ownerState.value, line.materialDirection, "initialize", this.ordinaryNoteScene!.noteLineClipY);
    if (prepared.status !== "ok") return prepared;
    const committed = prepared.value.commit();
    if (committed.status !== "ok") return committed;
    this.activeMultipleDirectionalLines[poolIndex] = line;
    return this.updateDirectionalConnectionPresentation(line);
  }

  private updateDirectionalConnectionPresentation(line: ActiveMultipleDirectionalLine): SimulatorResult<void> {
    const a = this.syncEndpointTransform(line.targetA, line.afterA)!;
    const b = this.syncEndpointTransform(line.targetB, line.afterB)!;
    const resolved = directionalConnectionPresentation(line, this.activeMultipleDirectionalLines, a.renderedTransform, b.renderedTransform);
    if (resolved.status !== "ok") return resolved;
    const motion = resolved.value.motion;
    const plan = (note: NoteBase, after: NoteConnectionEndpoint, iconVisible: boolean, transform: DirectionalNotePresentationPlan["transform"]):
      DirectionalNotePresentationPlan => {
      const children = this.ordinarySlideRenderStates.get(note);
      return { poolObjectId: note.poolObjectId, childIndex: !after ? null
        : children === undefined ? -1 : typeof after === "number" ? after - 1 : children.length - 1,
        iconVisible, transform };
    };
    const endpoints = [
      { note: line.targetA, after: line.afterA, presentation: plan(line.targetA, line.afterA, resolved.value.iconA, { motion, parentScale: a.motionState.noteParentScale }) },
      { note: line.targetB, after: line.afterB, presentation: plan(line.targetB, line.afterB, resolved.value.iconB, null) },
    ];
    const prepared = this.renderProducer!.preflightDirectionalConnectionPresentation(
      endpoints.filter(endpoint => endpoint.note.noteInformation!.laneSpan === undefined).map(endpoint => endpoint.presentation),
      this.ordinaryNoteScene!);
    if (prepared.status !== "ok") return prepared;
    const committed = prepared.value.commit();
    if (committed.status !== "ok") return committed;
    const updated = Object.freeze({ ...a,
      motionState: Object.freeze({ ...a.motionState, currentPositionZ: motion.position.z }), renderedTransform: motion,
    });
    for (const endpoint of endpoints) {
      if (endpoint.note.noteInformation!.laneSpan !== undefined)
        this.projectedGeometry!.setConnectionPresentation(endpoint.note.noteInformation!, endpoint.after,
          endpoint.presentation.iconVisible, endpoint === endpoints[0] ? updated : undefined);
    }
    if (line.targetA.noteInformation!.laneSpan !== undefined) return ok(undefined);
    if (!line.afterA) this.ordinaryRenderMotionStates.set(line.targetA, updated);
    else if (this.ordinaryLongRenderStates.has(line.targetA)) {
      this.ordinaryLongRenderStates.set(line.targetA, { ...this.ordinaryLongRenderStates.get(line.targetA)!, ...updated });
    } else {
      const children = this.ordinarySlideRenderStates.get(line.targetA)!;
      this.ordinarySlideRenderStates.set(line.targetA, children.map((child, index) => index + 1 === (typeof line.afterA === "number" ? line.afterA : children.length)
        ? Object.freeze({ ...child, lifecycle: Object.freeze({ ...child.lifecycle, ...updated }) }) : child));
    }
    return ok(undefined);
  }

  private connectMultipleDirectionalLines(activatedNotes: readonly NoteBase[]): SimulatorResult<void> {
    if (this.renderProducer === null) return ok(undefined);
    const connectedBatch = connectDirectionalMemberBatch(activatedNotes, {
      pendingTails: this.pendingDirectionalSyncTailNotes,
      sameTail: (tail, front, range) => this.isSameFrontTailDirectionalGroup(tail, front, range),
      connect: (a, afterA, b, afterB) => this.connectDirectionalEndpoints(a, afterA, b, afterB),
    });
    if (connectedBatch.status !== "ok") return connectedBatch;
    for (const visual of this.activeNotesValue) {
      const binding = visual.noteInformation?.directionalSlideConnection;
      if (binding === undefined || !(visual instanceof NoteMultipleDirectionalVisual)) continue;
      const root = this.slidePresentationRoots.get(binding.rootIndex)!;
      const owner = this.getActiveNote(root);
      if (!(owner instanceof NoteSlide)) continue;
      if (binding.connectionIndex === 0 ? owner.headJudged : owner.afterNotes[binding.connectionIndex - 1]?.judged) continue;
      const after = slideDirectionalAnchorEndpoint(visual, owner);
      if (after === null) continue;
      if (this.syncEndpointTransform(owner, after) === undefined ||
          this.activeMultipleDirectionalLines.some(line => line !== null &&
            line.targetA === owner && line.afterA === after && line.targetB === visual)) continue;
      const connected = this.connectDirectionalEndpoints(owner, after, visual, false);
      if (connected.status !== "ok") return connected;
    }
    for (const visual of activatedNotes) {
      if (!(visual instanceof NoteMultipleDirectionalVisual) || visual.noteInformation?.directionalSlideConnection !== undefined) continue;
      const button = frontEndpointLane(visual.noteInformation!);
      const tails = this.directionalSyncEndpoints(visual, false)
        .filter((endpoint) => endpoint.after)
        .map((endpoint) => ({ note: endpoint.note, information: endpoint.note.noteInformation! }))
        .sort((a, b) => directionalEndpointLane(a.information) - directionalEndpointLane(b.information));
      this.directionalVisualTailOwners.set(visual, {
        left: tails.filter((owner) => directionalEndpointLane(owner.information) < button).slice(-1)[0] ?? null,
        right: tails.find((owner) => directionalEndpointLane(owner.information) > button) ?? null,
      });
    }
    return ok(undefined);
  }

  private directionalVisualState(visual: NoteMultipleDirectionalVisual): NoteState {
    const source = visual.noteInformation;
    const binding = source?.directionalSlideConnection;
    if (binding !== undefined) {
      const root = this.slidePresentationRoots.get(binding.rootIndex)!;
      if (this.completedSlidePresentationRoots.has(root)) return NoteState.Deactive;
      const owner = this.getActiveNote(root);
      if (!(owner instanceof NoteSlide)) return NoteState.Wait;
      if (binding.connectionIndex === 0 ? owner.headJudged : owner.afterNotes[binding.connectionIndex - 1]?.judged)
        return NoteState.Deactive;
      const phase = this.projectedGeometry?.connectionState(root, binding.connectionIndex || false)?.phase;
      return phase === "move" ? NoteState.Move : phase === "stop" ? NoteState.Stop : NoteState.Wait;
    }
    const owners = this.directionalVisualTailOwners.get(visual);
    // NotesCheck gives the left tail precedence, including its Deactive state.
    const owner = owners?.left ?? owners?.right;
    if (owner === undefined || owner === null || owner.note.state === NoteState.Deactive ||
      owner.note.noteInformation !== owner.information) return NoteState.Deactive;
    const phase = this.syncTailState(owner.note)?.phase;
    return phase === "wait" ? NoteState.Wait : phase === "stop" ? NoteState.Stop : NoteState.Move;
  }

  private directionalSyncEndpoints(note: NoteBase, after: NoteConnectionEndpoint) {
    return directionalConnectionEndpoints(note, after, this.activeMultipleDirectionalLines);
  }

  private reconnectDirectionalSyncLines(batchPosition: number): SimulatorResult<void> {
    if (this.renderProducer === null) return ok(undefined);
    return reconnectDirectionalSyncConnections(batchPosition, this.activeOrdinarySyncLines, this.activeMultipleDirectionalLines,
      (a, afterA, b, afterB, line) => this.connectSyncEndpoints(a, afterA, b, afterB, line));
  }

  private updateMultipleDirectionalLines(): SimulatorResult<void> {
    if (this.renderProducer === null) return ok(undefined);
    for (const line of this.activeMultipleDirectionalLines) {
      if (line === null) continue;
      const ownerState = this.multipleDirectionalLineOwnerState(line);
      if (ownerState.status !== "ok") return ownerState;
      const prepared = this.renderProducer.preflightOrdinaryMultipleDirectionalLine(
        line.poolIndex,
        ownerState.value,
        line.materialDirection,
        this.syncEndpointMoving(line.targetA, line.afterA) && this.syncEndpointMoving(line.targetB, line.afterB) ? "show" : "hide",
        this.ordinaryNoteScene!.noteLineClipY,
      );
      if (prepared.status !== "ok") return prepared;
      const committed = prepared.value.commit();
      if (committed.status !== "ok") return committed;
    }
    return ok(undefined);
  }

  private activateDueBatches(substepIndex: number): SimulatorResult<void> {
    for (;;) {
      const index = this.nextBatchIndexValue;
      const batch = this.batches[index];
      const activated = this.activateCurrentBatch(substepIndex);
      if (activated.status !== "ok") return activated;
      // SV and folded time can have several due batches in one update.
      // Drain them through the same activation path.
      if (this.nextBatchIndexValue === index || batch === undefined ||
        !this.clock.usesIndependentVisualAxis(batch)) return ok(undefined);
    }
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

    if (this.renderProducer !== null) {
      const structure = validateRenderedBatchStructure(batch.informationList);
      if (structure.status !== "ok") return structure;
    }

    const bpmCommand = findBatchBpmCommand(batch.informationList);
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
      if (this.renderProducer !== null && noteInformation.laneSpan === undefined) {
        if (this.ordinaryNoteScene === null) {
          return integrityFailure(
            "render.note.ordinary-scene-unavailable",
            "A rendered ordinary Note cannot activate without its explicit typed fixed-scene input.",
          );
        }
        const noteBpm = createRenderFloat32(Math.fround(
          this.musicScoreController.nextBpm,
        ));
        if (noteBpm.status !== "ok") return noteBpm;
        const launcherMusicPosition = this.musicScoreController.launcherMusicPosition;
        const prepared = this.renderProducer.preflightOrdinaryNoteActivation(
          noteResult.value.note.poolObjectId,
          noteInformation,
          noteBpm.value,
          launcherMusicPosition,
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
          ...(noteResult.value.note instanceof NoteSlide ? { slideJudgeY: noteMotionY(prepared.value.renderedTransform) } : {}),
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
      }
      if (this.hasConnectionOwner(noteInformation)) {
        if (noteInformation.laneSpan !== undefined && this.projectedGeometry?.connectionState(noteInformation, false) === undefined) {
          const projected = this.projectedGeometry!.advance(noteResult.value.note, 0, null, false);
          if (projected.status !== "ok") return projected;
        }
        activatedRenderedNotes.push(noteResult.value.note);
      }
      if (longChildState !== null) {
        this.ordinaryLongRenderStates.set(noteResult.value.note, longChildState);
      }
      if (slideChildStates !== null) {
        this.ordinarySlideRenderStates.set(noteResult.value.note, slideChildStates);
      }
    }

    const syncLineActivation = this.connectOrdinarySyncLines(activatedRenderedNotes.filter(note => note.noteInformation!.directionalSlideConnection === undefined));
    if (syncLineActivation.status !== "ok") return syncLineActivation;
    const multipleDirectionalLineActivation =
      this.connectMultipleDirectionalLines(activatedRenderedNotes.filter(note => this.hasConnectionOwner(note.noteInformation!)));
    if (multipleDirectionalLineActivation.status !== "ok") {
      return multipleDirectionalLineActivation;
    }
    const firstInformation = batch.informationList[0];
    if (firstInformation !== undefined) {
      const reconnected = this.reconnectDirectionalSyncLines(firstInformation.absolutePos);
      if (reconnected.status !== "ok") return reconnected;
    }
    this.projectedGeometry?.connectionBatchActivated(batch.informationList);
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
        `No ${family} pool exists for note ${noteInformation.index}.`,
      );
    }

    for (let offset = 0; offset < pool.objects.length; offset += 1) {
      const index = (pool.cursor + offset) % pool.objects.length;
      const note = pool.objects[index];
      if (note === undefined || note.state !== NoteState.Deactive ||
        this.projectedNotes.has(note) !== (noteInformation.laneSpan !== undefined)) {
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
      `No deactive ${family} pool object is available for note ${noteInformation.index}.`,
    );
  }

  private appendActiveNote(note: NoteBase): void {
    if (note.noteInformation !== null) this.activeBySource.set(note.noteInformation, note);
    if (!this.activeNotesValue.includes(note)) {
      this.activeNotesValue.push(note);
    }
  }

  private removeActiveNote(note: NoteBase): void {
    if (note.noteInformation !== null) this.activeBySource.delete(note.noteInformation);
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
        `FrontNoteType ${noteInformation.fireNoteType} has no recovered playable-root pool mapping.`,
      );
  }
}

function validateRenderedBatchStructure(
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
          information.slideNoteList.length > 0
        ) {
          continue;
        }
        return integrityFailure(
          "render.note.invalid-slide-child-chain",
          "Current Slide production requires a non-empty chart-owned child chain.",
        );
      default:
        return integrityFailure(
          "render.note.invalid-front-family",
          `FrontNoteType ${information.fireNoteType} is not a playable rendered family.`,
        );
    }
  }
  return ok(undefined);
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
      "CC03/CC08 commands require a nonzero denominator, positive finite BPM and original string before scheduler mutation.",
    );
  }
  return ok(undefined);
}

const unavailableManualInputGeometry: SimulatorManualInputGeometryBackend = {
  resolveButton: () => integrityFailure(
    "manual-input.geometry-resolver-unavailable",
    "A direct NoteManager without a host geometry owner cannot resolve screen input.",
  ),
  screenToWorld: () => integrityFailure(
    "manual-input.screen-to-world-unavailable",
    "A direct NoteManager without a host geometry owner cannot project screen positions.",
  ),
  getDistanceNormalization: () => integrityFailure(
    "manual-input.distance-normalization-unavailable",
    "A direct NoteManager without a host geometry owner cannot provide native distance scales.",
  ),
  isInsideTargetButtons: () => integrityFailure(
    "manual-input.target-containment-unavailable",
    "A direct NoteManager without a host geometry owner cannot test target containment.",
  ),
};

function createUnavailableManualJudgementTransaction(): ManualJudgementTransaction {
  return {
    preflight: () => integrityFailure(
      "one-frame.manual-transaction-owner-unregistered",
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
  readonly members: readonly NoteInformation[];
  readonly count: number;
  readonly buttonTypes: readonly ButtonTypeValue[];

  constructor(
    group: readonly NoteInformation[],
    getButtonType: (information: NoteInformation) => ButtonTypeValue =
      (information) => information.buttonType,
  ) {
    this.members = Object.freeze([...group]);
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
        "A connected Multiple Directional group produces one judgement before its side owner is consumed.",
      );
    }
    this.usedValue = true;
    return ok(undefined);
  }
}

function directionalGroupSpan(group: MultipleDirectionalRuntimeGroup | undefined) {
  if (group === undefined || !group.members.some(source => source.laneSpan !== undefined)) return undefined;
  let start = Infinity, end = -Infinity;
  for (const source of group.members) {
    const lane = source.slideNoteList.length === 0 ? source.laneSpan?.start ?? source.buttonType : directionalEndpointLane(source);
    start = Math.min(start, lane);
    end = Math.max(end, lane);
  }
  return Object.freeze({ start, end, width: group.count });
}

/** Preserve the authored full target while Directional's Slide mesh uses its incoming member. */
function slideGestureSpan(source: NoteInformation) {
  const gesture = source.slideGesture;
  if (gesture?.direction == null) return source.laneSpan;
  const incoming = source.laneSpan?.start ?? source.buttonType;
  const exit = incoming + (source.slideExitOffset ?? 0);
  return { start: Math.min(incoming, exit), end: Math.max(incoming, exit), width: gesture.width };
}
