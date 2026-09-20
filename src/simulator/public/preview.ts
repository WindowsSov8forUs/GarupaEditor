import { sampleOrdinaryVisibleClip } from "../backends/ordinaryVisibleAnimation";
import { parseCurrentOrdinaryVisibleProfile, type OrdinaryVisibleProfile } from "../backends/resources/currentOrdinaryVisibleProfile";
import { buildNoteMeshStrip } from "../engine/rendering/ordinaryNoteGeometry";
import { isOriginalLongNoteLineBrightness } from "../engine/data/originalLiveSettings";
import { ok } from "../engine/result";
import { createRenderFloat32 } from "../backends/renderingValidation";
import { getOrdinaryNoteArrivalSeconds } from "../engine/rendering/ordinaryNoteGeometry";
export { createNguiTransparentColoredFilter as createOriginalPreviewFieldFilter } from "../backends/pixi/hud/nguiPanelClip";
export { installPixiLinearOutput as installOriginalPreviewLinearOutput } from "../backends/pixi/pixiLinearColorPipeline";
export { applyTextureSettings as configureOriginalPreviewTexture } from "../backends/pixi/pixiParticleRendererBackend";

/** SkinPreview and live notes call the same original arrival-time calculation. */
export function originalPreviewArrivalSeconds(speed: number): number {
  const value = createRenderFloat32(Math.fround(speed));
  if (value.status !== "ok") throw new Error("Preview speed must be finite.");
  const arrival = getOrdinaryNoteArrivalSeconds(value.value);
  if (arrival.status !== "ok") throw new Error("Preview speed has no positive original arrival time.");
  return arrival.value.value;
}


export interface OriginalPreviewMeshEndpoint {
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
}
export interface OriginalPreviewConnectionMesh {
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly alpha: number;
}

/** PreviewNoteMesh.OnUpdate: width is localScale.x; absent tail uses the launcher with zero width. */
export function originalPreviewConnectionMesh(front: OriginalPreviewMeshEndpoint,
  after: OriginalPreviewMeshEndpoint, brightness: number): OriginalPreviewConnectionMesh {
  if (!isOriginalLongNoteLineBrightness(brightness) || [front, after].some(point =>
    !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.halfWidth) || point.halfWidth < 0)) {
    throw new Error("Preview connection requires finite endpoints and original line concentration.");
  }
  const scalar = (value: number) => {
    const result = createRenderFloat32(Math.fround(value));
    if (result.status !== "ok") throw new Error("Preview mesh coordinate is not representable.");
    return result.value;
  };
  const one = scalar(1);
  const geometry = buildNoteMeshStrip(10, rate => {
    const y = scalar(front.y + (after.y - front.y) * rate);
    const edge = (side: number) => {
      const near = front.x + side * front.halfWidth, far = after.x + side * after.halfWidth;
      return { x: scalar(near + (far - near) * rate), y };
    };
    return ok([edge(-1), edge(1)] as const);
  }, { red: one, green: one, blue: one, alpha: scalar(brightness / 100) });
  if (geometry.status !== "ok") throw new Error(geometry.boundary);
  return {
    positions: Float32Array.from(geometry.value.vertices.flatMap(vertex => [vertex.x.value, -vertex.y.value])),
    uvs: Float32Array.from(geometry.value.uv.flatMap(uv => [uv.x.value, uv.y.value])),
    indices: Uint32Array.from(geometry.value.indices),
    alpha: geometry.value.colors[0]!.alpha.value,
  };
}

export type OriginalPreviewFlickDirection = "up" | "left" | "right";
export type OriginalPreviewFlickAnimations = OrdinaryVisibleProfile["noteAnimations"];

/** PreviewNote assigns the same FlickNoteIcon controller used by live notes. */
export function parseOriginalPreviewFlickAnimations(value: unknown): OriginalPreviewFlickAnimations {
  const profile = parseCurrentOrdinaryVisibleProfile(value);
  if (profile === null) throw new Error("Preview requires the original validated note animation profile.");
  return profile.noteAnimations;
}

export function sampleOriginalPreviewFlickAnimation(profile: OriginalPreviewFlickAnimations,
  direction: OriginalPreviewFlickDirection, elapsedSeconds: number) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0)
    throw new Error("Preview animation time must be finite and non-negative.");
  const clip = profile.clips.find(candidate => candidate.clipId === `note-flick-${direction}`);
  if (!clip) throw new Error(`Original preview animation is missing: ${direction}.`);
  const values = sampleOrdinaryVisibleClip(clip, elapsedSeconds);
  return { x: values[0]!, y: values[1]!, z: values[2]!, rotationDegrees: values[5]! };
}
