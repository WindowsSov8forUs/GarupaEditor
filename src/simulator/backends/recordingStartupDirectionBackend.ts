import type {
  StartupDirectionSceneBackend,
  StartupDirectionSceneState,
} from "../scene/startupDirectionScene";

export class RecordingStartupDirectionBackend implements StartupDirectionSceneBackend {
  private readonly states: StartupDirectionSceneState[] = [];
  private disposed = false;

  publish(state: StartupDirectionSceneState): void {
    if (this.disposed) throw new Error("recording startup direction backend disposed");
    this.states.push(Object.freeze({ ...state }));
  }

  snapshot(): Readonly<{
    disposed: boolean;
    states: readonly StartupDirectionSceneState[];
  }> {
    return Object.freeze({ disposed: this.disposed, states: Object.freeze([...this.states]) });
  }

  dispose(): void { this.disposed = true; }
}
