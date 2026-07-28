export type SimulatorPlayMode =
  | { readonly kind: "manual" }
  | {
      readonly kind: "auto-live";
      readonly resultTransform: "identity-no-active-situation-skill";
    };

export interface InGameCalculatedDataSnapshot {
  readonly playMode: "manual" | "auto-live";
  readonly isAutoPlay: boolean;
  readonly resultTransform: "none" | "identity-no-active-situation-skill";
}

export class InGameCalculatedData {
  constructor(private readonly playModeValue: SimulatorPlayMode) {}

  get isAutoPlay(): boolean {
    return this.playModeValue.kind === "auto-live";
  }

  get playMode(): SimulatorPlayMode {
    return this.playModeValue;
  }

  snapshot(): InGameCalculatedDataSnapshot {
    return {
      playMode: this.playModeValue.kind,
      isAutoPlay: this.isAutoPlay,
      resultTransform:
        this.playModeValue.kind === "auto-live"
          ? this.playModeValue.resultTransform
          : "none",
    };
  }
}
