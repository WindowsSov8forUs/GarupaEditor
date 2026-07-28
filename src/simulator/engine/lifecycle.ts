export type EngineLifecycleState = "created" | "initialized" | "faulted" | "disposed";

export interface EngineLifecycleSnapshot {
  readonly state: EngineLifecycleState;
  readonly paused: boolean;
}
