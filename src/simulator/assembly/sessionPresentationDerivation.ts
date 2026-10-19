import { sha256UpperHex } from "../backends/resources/sha256";
import type { SimulatorPresentationPackage } from "../public/contracts";
import type { SimulatorAssemblyResult } from "./result";
import {
  inspectStrictRgbaPng,
  STARTUP_JACKET_SIZE,
} from "./startupPresentationContract";
import type { PreparedSkinRenderOverlay } from "./skinRenderPreparation";

export interface PreparedPresentationImage {
  readonly role: "jacket" | "stage-backdrop" | "stage-effect" | "display-image";
  readonly slot: number | null;
  readonly logicalId: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  readonly mime: "image/png";
  readonly bytes: Uint8Array;
}

/** A stage-effect widget: its image and its centre and size in the stage TRSRoot space (y up). */
export interface PreparedStageEffectWidget {
  readonly image: PreparedPresentationImage;
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
}

type SkinBackgroundImage = NonNullable<PreparedSkinRenderOverlay["backgroundImage"]>;

export interface PreparedSessionPresentation {
  readonly song: SimulatorPresentationPackage["song"];
  readonly difficulty: SimulatorPresentationPackage["difficulty"];
  readonly jacket: PreparedPresentationImage;
  readonly stageBackdrop: PreparedPresentationImage;
  /** Visible stage-effect widgets of the selected special background. */
  readonly stageEffect: readonly PreparedStageEffectWidget[];
  readonly displayImage: PreparedPresentationImage | null;
  readonly sdCharacters: readonly [];
}

export async function deriveSessionPresentation(
  presentation: SimulatorPresentationPackage,
): Promise<SimulatorAssemblyResult<PreparedSessionPresentation>> {
  const jacket = deriveImage("jacket", null, presentation.jacketPng, STARTUP_JACKET_SIZE.width, STARTUP_JACKET_SIZE.height);
  if (jacket.status === "rejected") return jacket;
  const backdrop = deriveImage("stage-backdrop", null, presentation.stage.backdropPng, null, null);
  if (backdrop.status === "rejected") return backdrop;
  const displayImage = presentation.displayImagePng == null ? null
    : deriveImage("display-image", null, presentation.displayImagePng, null, null);
  if (displayImage?.status === "rejected") return displayImage;
  const sdCharacters = Object.freeze([]) as readonly [];
  return accepted(Object.freeze({
    song: presentation.song,
    difficulty: presentation.difficulty,
    jacket: jacket.value,
    stageBackdrop: backdrop.value,
    stageEffect: Object.freeze([]),
    displayImage: displayImage?.value ?? null,
    sdCharacters,
  }));
}

export function replacePreparedSessionStageBackdrop(
  presentation: PreparedSessionPresentation,
  selected: SkinBackgroundImage | null,
): SimulatorAssemblyResult<PreparedSessionPresentation> {
  if (selected === null) return accepted(presentation);
  const backdrop = deriveImage(
    "stage-backdrop",
    null,
    selected.bytes,
    selected.width,
    selected.height,
  );
  if (backdrop.status === "rejected") return backdrop;
  const stageEffect: PreparedStageEffectWidget[] = [];
  for (const [slot, widget] of selected.stageEffect.entries()) {
    const image = deriveImage("stage-effect", slot, widget.bytes, widget.pixelWidth, widget.pixelHeight);
    if (image.status === "rejected") return image;
    stageEffect.push(Object.freeze({
      image: image.value,
      centerX: widget.centerX,
      centerY: widget.centerY,
      width: widget.width,
      height: widget.height,
      alpha: widget.alpha,
    }));
  }
  return accepted(Object.freeze({ ...presentation, stageBackdrop: backdrop.value, stageEffect: Object.freeze(stageEffect) }));
}

function deriveImage(
  role: PreparedPresentationImage["role"],
  slot: number | null,
  source: Uint8Array,
  width: number | null,
  height: number | null,
): SimulatorAssemblyResult<PreparedPresentationImage> {
  const structure = inspectStrictRgbaPng(source, width, height);
  if (structure.status === "rejected") return structure;
  const bytes = Uint8Array.from(source);
  const sha256 = sha256UpperHex(bytes);
  const suffix = slot === null ? role : `${role}/${slot}`;
  return accepted(Object.freeze({
    role,
    slot,
    logicalId: `startup/session/${suffix}/${sha256}`,
    sha256,
    byteLength: bytes.byteLength,
    width: structure.value.width,
    height: structure.value.height,
    mime: "image/png" as const,
    bytes,
  }));
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> { return Object.freeze({ status: "accepted" as const, value }); }
