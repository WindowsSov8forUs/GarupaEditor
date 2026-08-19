import { sha256UpperHex } from "../backends/resources/sha256";
import type { SimulatorPresentationPackage } from "../public/contracts";
import type { SimulatorAssemblyResult } from "../resources/sharedResourceAdapters";
import {
  inspectStrictRgbaPng,
  STARTUP_JACKET_SIZE,
} from "./startupPresentationContract";

export interface PreparedPresentationImage {
  readonly role: "jacket" | "stage-backdrop";
  readonly slot: number | null;
  readonly logicalId: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  readonly mime: "image/png";
  readonly bytes: Uint8Array;
}

export interface PreparedSessionPresentation {
  readonly song: SimulatorPresentationPackage["song"];
  readonly difficulty: SimulatorPresentationPackage["difficulty"];
  readonly jacket: PreparedPresentationImage;
  readonly stageBackdrop: PreparedPresentationImage;
  readonly sdCharacters: readonly [];
}

export async function deriveSessionPresentation(
  presentation: SimulatorPresentationPackage,
): Promise<SimulatorAssemblyResult<PreparedSessionPresentation>> {
  const jacket = deriveImage("jacket", null, presentation.jacketPng, STARTUP_JACKET_SIZE.width, STARTUP_JACKET_SIZE.height);
  if (jacket.status === "rejected") return jacket;
  const backdrop = deriveImage("stage-backdrop", null, presentation.stage.backdropPng, null, null);
  if (backdrop.status === "rejected") return backdrop;
  const sdCharacters = Object.freeze([]) as readonly [];
  return accepted(Object.freeze({
    song: presentation.song,
    difficulty: presentation.difficulty,
    jacket: jacket.value,
    stageBackdrop: backdrop.value,
    sdCharacters,
  }));
}

export function replacePreparedSessionStageBackdrop(
  presentation: PreparedSessionPresentation,
  selected: { readonly bytes: Uint8Array; readonly width: number; readonly height: number } | null,
): SimulatorAssemblyResult<PreparedSessionPresentation> {
  if (selected === null) return accepted(presentation);
  const backdrop = deriveImage(
    "stage-backdrop",
    null,
    selected.bytes,
    selected.width,
    selected.height,
  );
  return backdrop.status === "rejected"
    ? backdrop
    : accepted(Object.freeze({ ...presentation, stageBackdrop: backdrop.value }));
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
