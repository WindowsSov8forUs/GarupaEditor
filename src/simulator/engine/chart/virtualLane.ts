import { VirtualLaneDirection, type NoteInformation } from "./types";

export type VirtualLaneSource = Pick<NoteInformation, "virtualLaneDirection" | "virtualLaneDistance">;

/** Choose only the base index; the authored coordinate is retained in the offset. */
export function virtualLaneBaseIndex(lane: number, maximumBase = 6): number {
  return Math.min(maximumBase, Math.max(0, Math.floor(lane)));
}

/** Original controller units are one hundredth of adjacent world positions. */
export function virtualLaneUnit(firstX: number, secondX: number): number {
  return Math.fround(Math.fround(secondX - firstX) / 100);
}

/** NoteUtility.GetVirtualLaneNotePosX; coordinate output is not lane-clamped. */
export function virtualLaneNoteX(source: VirtualLaneSource, unit: number, baseX: number): number {
  if (source.virtualLaneDirection === VirtualLaneDirection.None) return baseX;
  const offset = Math.fround(source.virtualLaneDistance * unit);
  return Math.fround(source.virtualLaneDirection === VirtualLaneDirection.Left ? baseX - offset : baseX + offset);
}

/** Garupa may supply fractional distances in the original hundredth-lane units.
 * BMS keeps its integer parser; both inputs use the same coordinate consumers.
 * Garupa distances use the host finite-number range rather than an Int32 limit. */
export function encodeVirtualLanePosition(lane: number, maximumBase = 6): (VirtualLaneSource & { readonly baseLane: number }) | null {
  if (!Number.isFinite(lane)) return null;
  const hundredths = Math.round(lane * 100);
  // Selecting a base does not snap the authored coordinate: the residual is retained.
  const baseLane = virtualLaneBaseIndex(lane, maximumBase);
  // Preserve exactly representable original integer offsets. Otherwise retain
  // the fractional residual instead of quantizing the authored coordinate.
  const distance = Number.isSafeInteger(hundredths) && hundredths / 100 === lane
    ? hundredths - baseLane * 100 : (lane - baseLane) * 100;
  if (!Number.isFinite(distance)) return null;
  return { baseLane,
    virtualLaneDirection: distance < 0 ? VirtualLaneDirection.Left : distance > 0 ? VirtualLaneDirection.Right : VirtualLaneDirection.None,
    virtualLaneDistance: Math.abs(distance) };
}
