import type { SimulatorResult } from "../engine/evidence";

export const RenderFidelityLabel = "Approximate HABAHIRO" as const;

export type RenderBackendState =
  | "unprepared"
  | "preparing"
  | "ready"
  | "faulted"
  | "disposed";

export type RenderResourceRole =
  | "note-atlas"
  | "directional-atlas"
  | "judge-atlas"
  | "field-atlas"
  | "hud-atlas"
  | "font"
  | "material-texture"
  | "animation-clip";

export type RenderMaterialRole =
  | "none"
  | "sprite"
  | "long-note"
  | "curve-note"
  | "sync-line"
  | "multiple-directional-line"
  | "mask"
  | "hud";

export type RenderAnimationRole =
  | "none"
  | "note-flick"
  | "note-directional-flick"
  | "note-long-flash"
  | "combo"
  | "all-perfect"
  | "add-score"
  | "result"
  | "life-heal"
  | "damage-guard"
  | "never-die"
  | "score-skill"
  | "judge-skill"
  | "fever"
  | "habahiro-lane-change";

export type RenderTextureScaleMode = "nearest" | "linear";
export type RenderTextureWrapMode = "clamp" | "repeat";
export type RenderTextureMipmapMode = "off" | "on";
export type RenderBlendMode = "normal" | "add" | "multiply";

export interface RenderSampleIdentity {
  readonly package: "jp.co.craftegg.band";
  readonly versionName: "10.1.4";
  readonly versionCode: 230;
  readonly abi: "arm64-v8a";
}

export type RenderFidelitySelection =
  | {
      readonly mode: "ordinary";
      readonly fidelity: "exact-current";
    }
  | {
      readonly mode: "habahiro";
      readonly fidelity: "exact-current-unityfs";
    }
  | {
      readonly mode: "habahiro";
      readonly fidelity: "degraded";
      readonly profile:
        | "current-external-portable-atlas"
        | "historical-atlas-proxy"
        | "current-ordinary-stretch-proxy";
      readonly visibleLabel: typeof RenderFidelityLabel;
    };

export interface RenderTextureSettings {
  readonly scaleMode: RenderTextureScaleMode;
  readonly wrapModeU: RenderTextureWrapMode;
  readonly wrapModeV: RenderTextureWrapMode;
  readonly mipmap: RenderTextureMipmapMode;
  readonly premultiplyAlpha: boolean;
  readonly blendMode: RenderBlendMode;
}

export interface RenderAtlasRow {
  readonly exactKey: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pivotX: number;
  readonly pivotY: number;
  readonly pixelsPerUnit: number;
}

export interface RenderResourceAssetProfile {
  readonly logicalAssetId: string;
  readonly role: RenderResourceRole;
  readonly byteLength: number;
  readonly sha256: string;
  readonly mime: "image/png" | "font/ttf" | "application/octet-stream";
  readonly width: number | null;
  readonly height: number | null;
  readonly textureSettings: RenderTextureSettings | null;
  readonly atlasRows: readonly RenderAtlasRow[];
  readonly materialRole: RenderMaterialRole;
  readonly animationRole: RenderAnimationRole;
  readonly provenance:
    | "current-apk"
    | "current-device-cache"
    | "current-external-portable"
    | "historical-proxy"
    | "generated-current-ordinary-proxy";
}

export type RenderPortableComponent =
  | "sprite"
  | "atlas-sprite"
  | "mesh"
  | "line"
  | "mask"
  | "text"
  | "slider"
  | "animation";

export interface RenderComponentMapping {
  readonly component: RenderPortableComponent;
  readonly support: "semantic-exact" | "portable-equivalent";
}

export interface RenderOrderingProfile {
  readonly tuple: readonly [
    "domain-layer",
    "source-depth-or-sorting-order",
    "source-z",
    "creation-sequence",
  ];
  readonly pixiDefaultZIndexAllowed: false;
}

export type RenderProjectionMode =
  | "current-ordinary-rhythmgame-orthographic"
  | "degraded-habahiro-ordinary-projection-proxy";

export interface RenderOrthographicProjectionProfile {
  readonly mode: RenderProjectionMode;
  readonly viewportWidth: 1600;
  readonly viewportHeight: 720;
  readonly pixiOrigin: "top-left";
  readonly worldCenterX: 0;
  readonly worldCenterY: 0;
  readonly cameraPositionZ: -15;
  readonly nearClip: 0;
  readonly farClip: 25;
  readonly pixelsPerWorldUnit: 360;
  readonly clampAllowed: false;
}

export interface RenderSceneProfile {
  readonly profileId: string;
  readonly components: readonly RenderComponentMapping[];
  readonly ordering: RenderOrderingProfile;
  readonly projection: RenderOrthographicProjectionProfile;
  readonly roundPixels: boolean;
  readonly resolution: number;
  readonly antialias: boolean;
}

export interface RenderResourceProfile {
  readonly schemaVersion: 1;
  readonly sample: RenderSampleIdentity;
  readonly packIdentity: string;
  readonly fidelity: RenderFidelitySelection;
  readonly networkAllowed: false;
  readonly automaticFallbackAllowed: false;
  readonly assets: readonly RenderResourceAssetProfile[];
  readonly scene: RenderSceneProfile;
}

export interface SimulatorResourceProvider {
  read(logicalAssetId: string): Promise<SimulatorResult<Uint8Array>>;
}

export interface RenderDecodedResourceMetadata {
  readonly width: number;
  readonly height: number;
}

export interface RenderResourcePreflightAdapter {
  sha256(bytes: Uint8Array): Promise<SimulatorResult<string>>;
  inspect(
    bytes: Uint8Array,
    mime: RenderResourceAssetProfile["mime"],
  ): Promise<SimulatorResult<RenderDecodedResourceMetadata | null>>;
}

export interface RenderFloat32 {
  readonly value: number;
  readonly bits: string;
}

export interface RenderVector2 {
  readonly x: RenderFloat32;
  readonly y: RenderFloat32;
}

export interface RenderVector3 extends RenderVector2 {
  readonly z: RenderFloat32;
}

export interface RenderColor {
  readonly red: RenderFloat32;
  readonly green: RenderFloat32;
  readonly blue: RenderFloat32;
  readonly alpha: RenderFloat32;
}

export interface RenderOrderingKey {
  readonly domainLayer: number;
  readonly sourceDepthOrSortingOrder: number;
  readonly sourceZ: RenderFloat32;
  readonly creationSequence: number;
}

export interface RenderCommandBase {
  readonly sessionId: string;
  readonly sequence: number;
  readonly frame: number;
  readonly substep: number;
}

export interface RenderObjectCommandBase extends RenderCommandBase {
  readonly renderObjectId: string;
}

export type RenderObjectRole =
  | "note-root"
  | "note-head"
  | "note-icon"
  | "note-intermediate"
  | "note-side-visual"
  | "note-mesh"
  | "sync-line"
  | "multiple-directional-line"
  | "field-line"
  | "judge-line"
  | "mask"
  | "hud-score"
  | "hud-combo"
  | "hud-result"
  | "hud-life"
  | "hud-overlay"
  | "fidelity-label";

export type RenderCommand =
  | (RenderObjectCommandBase & {
      readonly kind: "create-object" | "acquire-object";
      readonly poolFamily: string;
      readonly role: RenderObjectRole;
      readonly parentObjectId: string | null;
    })
  | (RenderObjectCommandBase & {
      readonly kind: "activate-object" | "hide-object" | "deactivate-object" | "release-object";
    })
  | (RenderObjectCommandBase & {
      readonly kind: "bind-resource";
      readonly binding: "sprite" | "material" | "animation";
      readonly logicalAssetId: string;
      readonly exactKey: string | null;
    })
  | (RenderObjectCommandBase & {
      readonly kind: "set-transform";
      readonly position: RenderVector3;
      readonly scale: RenderVector2;
      readonly rotationDegrees: RenderFloat32;
      readonly color: RenderColor;
      readonly ordering: RenderOrderingKey;
      readonly maskObjectId: string | null;
    })
  | (RenderObjectCommandBase & {
      readonly kind: "set-mesh";
      readonly vertices: readonly RenderVector3[];
      readonly indices: readonly number[];
      readonly uv: readonly RenderVector2[];
      readonly colors: readonly RenderColor[];
      readonly materialRole: RenderMaterialRole;
    })
  | (RenderObjectCommandBase & {
      readonly kind: "set-line";
      readonly start: RenderVector3;
      readonly end: RenderVector3;
      readonly width: RenderFloat32;
      readonly materialRole: RenderMaterialRole;
    })
  | (RenderObjectCommandBase & {
      readonly kind: "set-threshold";
      readonly threshold: RenderFloat32;
    })
  | (RenderObjectCommandBase & {
      readonly kind: "set-mask";
      readonly mode: "visible-inside";
      readonly polygon: readonly RenderVector2[];
    })
  | (RenderObjectCommandBase & {
      readonly kind: "set-hud";
      readonly hudRole: "score" | "combo" | "result" | "life" | "overlay" | "fidelity-label";
      readonly state: Readonly<Record<string, string | number | boolean | null>>;
    })
  | (RenderObjectCommandBase & {
      readonly kind: "play-animation" | "stop-animation";
      readonly animationRole: RenderAnimationRole;
      readonly restart: boolean;
    })
  | (RenderObjectCommandBase & {
      readonly kind: "sample-animation";
      readonly animationRole: RenderAnimationRole;
      readonly elapsedSeconds: RenderFloat32;
    });

export interface RenderBackendFault {
  readonly capability: string;
  readonly boundary: string;
}

export interface RenderCommandBatch {
  readonly sessionId: string;
  readonly firstSequence: number;
  readonly commandCount: number;
}

export interface RenderBackendSnapshot {
  readonly state: RenderBackendState;
  readonly sessionId: string | null;
  readonly fidelity: RenderFidelitySelection | null;
  readonly nextSequence: number;
  readonly objectCount: number;
  readonly resourceCount: number;
  readonly fault: RenderBackendFault | null;
}

export interface SimulatorRendererBackend {
  readonly id: string;
  prepare(
    sessionId: string,
    profile: RenderResourceProfile,
    provider: SimulatorResourceProvider,
    preflight: RenderResourcePreflightAdapter,
  ): Promise<SimulatorResult<void>>;
  preflight(commands: readonly RenderCommand[]): SimulatorResult<RenderCommandBatch>;
  commit(batch: RenderCommandBatch): SimulatorResult<void>;
  discard(batch: RenderCommandBatch): SimulatorResult<void>;
  execute(command: RenderCommand): SimulatorResult<void>;
  snapshot(): RenderBackendSnapshot;
  dispose(): SimulatorResult<void>;
}
