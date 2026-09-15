import type { NoteInformation } from "../chart/types";
import type { OneFrameDataPayload } from "../data/oneFrameData";
import type { SimulatorModeIdentity } from "../data/inGameCalculatedData";
import { NoteResultType } from "../data/manualJudgement";
import { integrityFailure, ok, type SimulatorResult } from "../result";
import { FrameMutationPlan } from "../managers/frameMutationPlan";
import type { InGameMusicScoreController } from "../managers/inGameMusicScoreController";
import type { NoteBase } from "../notes/noteBase";
import type { GarupaProductChartProfile, GarupaProductNode } from "./productChartProfile";
import type { GarupaRenderInputAdapter } from "./garupaRenderInputAdapter";

export interface GarupaProductTimelineSnapshot {
  readonly kind: "note-extensions";
  readonly visibleNodeCount: number;
  readonly judgedNodeCount: number;
  readonly missedNodeCount: number;
  readonly render: ReturnType<GarupaRenderInputAdapter["snapshot"]> | null;
}

/** Publishes coordinate/SV presentation of judgements owned by NoteManager.
 * It does not select inputs, advance chart nodes or submit judgements. */
export class GarupaProductTimelineManager {
  private readonly sharedNodesByIndex = new Map<string, GarupaProductNode>();
  private readonly sharedJudgements: GarupaProductNode[] = [];
  private readonly judgedSources = new Set<string>();
  private readonly missedSources = new Set<string>();
  private initialized = false;
  private disposed = false;

  constructor(
    private readonly chart: GarupaProductChartProfile,
    private readonly mode: SimulatorModeIdentity,
    private readonly music: InGameMusicScoreController,
    private readonly render: GarupaRenderInputAdapter | null,
    private readonly judgementAdjustValueB: number,
    private readonly isMoveTime: () => boolean,
    private readonly sharedNote: (source: NoteInformation) => NoteBase | null,
  ) {
    for (const node of chart.visibleNodes) {
      const sources = node.chainIdentity === null ? node.runtimeMembers ?? [node.scoringSource!] : [node.scoringSource!];
      for (const source of sources) this.sharedNodesByIndex.set(`${source.index}:${node.scoringPhase ?? "head"}`, node);
    }
  }

  observeSharedJudgement(entry: OneFrameDataPayload): void {
    const node = this.sharedNodesByIndex.get(`${entry.noteIndex}:${entry.phase}`);
    if (node === undefined || this.judgedSources.has(node.identity) || this.missedSources.has(node.identity)) return;
    (entry.rawResult === NoteResultType.Miss ? this.missedSources : this.judgedSources).add(node.identity);
    this.sharedJudgements.push(node);
  }

  private frameInput() {
    return {
      currentBpm: this.music.currentBpm,
      launcherMusicPosition: this.music.launcherMusicPosition,
      adjustedMusicPosition: this.music.getAdjustedMusicPosition(this.judgementAdjustValueB),
      adjustment: this.judgementAdjustValueB,
      forcePerfect: this.mode.inputMode === "auto" || this.isMoveTime(),
      missed: this.missedSources,
    };
  }

  connectSharedProjection() {
    return this.render?.connectSharedRuntime(this.sharedNote, () => ({
      ...this.frameInput(), absolutePosition: this.music.musicPosition, deltaTimeSeconds: 0,
      judged: new Set(this.sharedJudgements.map(node => node.identity)),
    }));
  }

  getSlidePresentation(identity: string) { return this.render?.getSlidePresentation(identity) ?? null; }

  initialize(): SimulatorResult<void> {
    const validation = this.render?.validate() ?? ok(undefined);
    if (validation.status !== "ok") return validation;
    this.initialized = true;
    return ok(undefined);
  }

  update(deltaTimeSeconds: number): SimulatorResult<void> {
    if (!this.initialized || this.disposed) return integrityFailure(
      "simulator.garupa-extension.update-outside-lifecycle",
      "Note projection requires an initialized, non-disposed rendering owner.");
    const prepared = this.render?.preflightFrame(this.music.musicPosition,
      this.sharedJudgements, deltaTimeSeconds, this.frameInput()) ?? ok(null);
    if (prepared.status !== "ok") return prepared;
    const frame = prepared.value;
    if (frame !== null) {
      const plan = FrameMutationPlan.create([{
        identity: "product-render", commitExternal: () => frame.commitBackend(),
        publishOwner: () => frame.publishOwner(), discard: () => frame.discard(),
      }], ["product-render"], ["product-render"]);
      if (plan.status !== "ok") { frame.discard(); return plan; }
      const committed = plan.value.commit();
      if (committed.status !== "ok") return committed;
    }
    this.sharedJudgements.length = 0;
    return ok(undefined);
  }

  commitDispose(): void {
    this.render?.releaseInputs();
    this.sharedNodesByIndex.clear();
    this.sharedJudgements.length = 0;
    this.judgedSources.clear();
    this.missedSources.clear();
    this.initialized = false;
    this.disposed = true;
  }

  snapshot(): GarupaProductTimelineSnapshot {
    return Object.freeze({ kind: "note-extensions", visibleNodeCount: this.chart.visibleNodes.length,
      judgedNodeCount: this.judgedSources.size, missedNodeCount: this.missedSources.size,
      render: this.render?.snapshot() ?? null });
  }
}
