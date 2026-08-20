export type OriginalSkinSpecialState = "on" | "off";

export interface OriginalSkinSpecialComponentStates {
  readonly laneAndLine: OriginalSkinSpecialState;
  readonly tapEffect: OriginalSkinSpecialState;
  readonly rhythmIcon: OriginalSkinSpecialState;
  readonly background: OriginalSkinSpecialState;
  readonly soundEffect: OriginalSkinSpecialState;
  readonly judge: OriginalSkinSpecialState;
  readonly directionalFlickIcon: OriginalSkinSpecialState;
}

export type OriginalSkinSpecialSelection =
  | { readonly kind: "none" }
  | {
      readonly kind: "collabo";
      readonly seasonSpecialId: number;
      readonly components: OriginalSkinSpecialComponentStates;
    }
  | {
      readonly kind: "limited";
      readonly limitedSkinId: number;
      readonly components: OriginalSkinSpecialComponentStates;
    };

export interface OriginalSkinSettings {
  readonly noteSkin: number;
  readonly fieldSkin: number;
  readonly tapEffect: number;
  readonly judgeSE: number;
  readonly directionalFlick: number;
  readonly directionalFlickEffect: number;
  readonly isFixedBG: boolean;
  readonly special: OriginalSkinSpecialSelection;
}

export type OriginalSkinChartMode = "ordinary" | "habahiro";
export type OriginalSkinBackgroundMode = "standard" | "mv";
export type OriginalSkinFidelity =
  | "default-current"
  | "normal-current-static-portable"
  | "special-current-static-portable";
export type OriginalSkinComponentRoute =
  | "normal"
  | "default"
  | "special"
  | "habahiro"
  | "presentation-background"
  | "practice-background"
  | "mv-video"
  | "mode-stage";

export interface ResolvedSkinComponent {
  readonly route: OriginalSkinComponentRoute;
  readonly bundleName: string | null;
  readonly logicalResource: string | null;
}

export interface ResolvedNoteSkinComponent extends ResolvedSkinComponent {
  readonly noteSyncEdgeMargin: number;
}

export interface ResolvedDirectionalSkinComponent extends ResolvedSkinComponent {
  readonly effectSetting: 0 | 1;
  readonly effectVariant: "normal" | "light";
  readonly noteLogicalResource: string;
  readonly effectLogicalResource: string;
  readonly seLogicalResource: "sound/tapseskin/directionalflickskin00";
}

export interface ResolvedOriginalSkinRecipe {
  readonly identity: string;
  readonly fidelity: OriginalSkinFidelity;
  readonly chartMode: OriginalSkinChartMode;
  readonly backgroundMode: OriginalSkinBackgroundMode;
  readonly selectedSpecial: { readonly kind: "none" } | {
    readonly kind: "collabo" | "limited";
    readonly selectionId: number;
  };
  readonly note: ResolvedNoteSkinComponent;
  readonly field: ResolvedSkinComponent;
  readonly tapEffect: ResolvedSkinComponent;
  readonly background: ResolvedSkinComponent;
  readonly tapSE: ResolvedSkinComponent;
  readonly directional: ResolvedDirectionalSkinComponent;
  readonly judge: ResolvedSkinComponent;
}
