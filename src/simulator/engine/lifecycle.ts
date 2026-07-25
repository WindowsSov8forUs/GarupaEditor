export type EngineLifecycleState = "created" | "initialized" | "disposed";

export interface EngineLifecycleSnapshot {
  readonly state: EngineLifecycleState;
  readonly paused: boolean;
}
