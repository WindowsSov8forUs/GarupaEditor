import type {
  StartupDirectionSceneBackend,
  StartupDirectionSceneState,
} from "../scene/startupDirectionScene";
import type { OneFrameJudgementBatch } from "../engine/data/oneFrameData";

export class RecordingStartupDirectionBackend implements StartupDirectionSceneBackend {
  private readonly states: StartupDirectionSceneState[] = [];
  private disposed = false;
  private stageEffectsElapsed = 0;
  private stageJudgementCount = 0;

  reflectStageJudgements(batch: OneFrameJudgementBatch): void {
    if (this.disposed) throw new Error("recording startup direction backend disposed");
    this.stageJudgementCount += batch.entryCount;
  }

  advanceStageEffects(deltaSeconds: number): void {
    if (this.disposed) throw new Error("recording startup direction backend disposed");
    this.stageEffectsElapsed += deltaSeconds;
  }

  publish(state: StartupDirectionSceneState): void {
    if (this.disposed) throw new Error("recording startup direction backend disposed");
    this.states.push(Object.freeze({ ...state }));
  }

  snapshot(): Readonly<{
    disposed: boolean;
    stageEffectsElapsed: number;
    stageJudgementCount: number;
    states: readonly StartupDirectionSceneState[];
  }> {
    return Object.freeze({ disposed: this.disposed, stageEffectsElapsed: this.stageEffectsElapsed,
      stageJudgementCount: this.stageJudgementCount, states: Object.freeze([...this.states]) });
  }

  dispose(): void { this.disposed = true; }
}
