import type { AutoLiveJudgementOwnership } from "../data/autoLiveJudgement";
import type { SimulatorModeIdentity } from "../data/inGameCalculatedData";
import type { NoteInformation } from "../chart/types";
import type { InGameMusicScoreController } from "../managers/inGameMusicScoreController";
import type { InGameOneFrameJudgementController } from "../managers/inGameOneFrameJudgementController";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";
import type { GarupaProductChartProfile, GarupaProductNode } from "./productChartProfile";
import type { GarupaProductRenderProducer } from "./productRenderProducer";

export interface GarupaProductTimelineSnapshot {
  readonly route: "product-extension";
  readonly visibleNodeCount: number;
  readonly judgedNodeCount: number;
  readonly nextAutoIndex: number;
  readonly render: ReturnType<GarupaProductRenderProducer["snapshot"]> | null;
}

export class GarupaProductTimelineManager {
  private readonly orderedVisibleNodes: readonly GarupaProductNode[];
  private readonly judgedSources = new WeakSet<NoteInformation>();
  private judgedNodeCount = 0;
  private nextAutoIndex = 0;
  private initialized = false;
  private disposed = false;

  constructor(
    private readonly chart: GarupaProductChartProfile,
    private readonly mode: SimulatorModeIdentity,
    private readonly music: InGameMusicScoreController,
    private readonly oneFrame: InGameOneFrameJudgementController,
    private readonly render: GarupaProductRenderProducer | null,
  ) {
    this.orderedVisibleNodes = Object.freeze([...chart.visibleNodes].sort((left, right) =>
      left.absolutePosition - right.absolutePosition || left.authoredOrder - right.authoredOrder));
  }

  initialize(): SimulatorResult<void> {
    if (this.disposed) return rejected("simulator.garupa-extension.initialize-after-dispose", "A disposed product timeline is terminal.");
    if (this.initialized) return ok(undefined);
    if (this.chart.route !== "product-extension") {
      return rejected(
        "simulator.garupa-extension.invalid-timeline-route",
        "Only a product-extension profile may create the sibling product timeline owner.",
      );
    }
    const render = this.render?.validate() ?? ok(undefined);
    if (render.status !== "ok") return render;
    this.initialized = true;
    return ok(undefined);
  }

  update(): SimulatorResult<void> {
    if (!this.initialized || this.disposed) {
      return rejected(
        "simulator.garupa-extension.update-outside-lifecycle",
        "Product timeline updates require one initialized non-disposed owner.",
      );
    }
    const currentPosition = this.music.musicPosition;
    if (!Number.isFinite(currentPosition) || currentPosition < 0) {
      return rejected(
        "simulator.garupa-extension.non-finite-current-position",
        "Product visual and judgement sampling requires the finite BPM-clock position.",
      );
    }
    const due: GarupaProductNode[] = [];
    if (this.mode.inputMode === "auto") {
      while (this.nextAutoIndex < this.orderedVisibleNodes.length) {
        const node = this.orderedVisibleNodes[this.nextAutoIndex]!;
        if (currentPosition < node.absolutePosition) break;
        due.push(node);
        this.nextAutoIndex += 1;
      }
    }
    const render = this.render?.preflightFrame(currentPosition, due) ?? ok(null);
    if (render.status !== "ok") return render;
    for (const node of due) {
      const source = node.scoringSource;
      if (source === null || this.judgedSources.has(source)) {
        if (render.value !== null) render.value.discard();
        return rejected(
          "simulator.garupa-extension.invalid-auto-source",
          "Every due non-Hidden product node must own one unconsumed CS-V1 source.",
        );
      }
      const submitted = this.oneFrame.setupAutoLiveJudgement({
        noteInformation: source,
        phase: "head",
        noteType: productJudgeNoteType(node),
        absolutePosition: node.absolutePosition,
        multipleDirectionalFlickNoteCount: 0,
      });
      if (submitted.status !== "ok") {
        if (render.value !== null) render.value.discard();
        return submitted;
      }
      this.judgedSources.add(source);
      this.judgedNodeCount += 1;
    }
    if (render.value !== null) {
      const committed = render.value.commit();
      if (committed.status !== "ok") return committed;
    }
    return ok(undefined);
  }

  getAutoLiveJudgementOwnership(
    source: NoteInformation,
  ): AutoLiveJudgementOwnership | null {
    return this.chart.scoringNodeBySource.has(source)
      ? Object.freeze({
          multipleDirectionalFlickNoteCount: null,
          productExtension: "garupa-visible-node" as const,
        })
      : null;
  }

  ownsScoringSource(source: NoteInformation): boolean {
    return this.chart.scoringNodeBySource.has(source);
  }

  preflightDispose() {
    return this.render?.preflightDispose() ?? ok(null);
  }

  commitDispose(): void {
    this.initialized = false;
    this.disposed = true;
  }

  snapshot(): GarupaProductTimelineSnapshot {
    return Object.freeze({
      route: "product-extension" as const,
      visibleNodeCount: this.orderedVisibleNodes.length,
      judgedNodeCount: this.judgedNodeCount,
      nextAutoIndex: this.nextAutoIndex,
      render: this.render?.snapshot() ?? null,
    });
  }
}

function productJudgeNoteType(node: GarupaProductNode): number {
  if (node.type === "Flick") return 3;
  if (node.type === "Directional") return 9;
  return 0;
}

function rejected<T>(capability: string, boundary: string): SimulatorResult<T> {
  return evidenceRequired(capability, [], boundary);
}
