import type { ChartEvent, RuntimeNoteSemantic } from "./types";

export type SeKind =
  | "normal"
  | "flick"
  | "skill"
  | "directional_fl_1"
  | "directional_fl_2"
  | "directional_fl_3";

function isFlickHitNote(note: RuntimeNoteSemantic): boolean {
  return note.baseType === "flick" && (note.slideRole === "none" || note.slideRole === "end");
}

function isHiddenNote(note: RuntimeNoteSemantic): boolean {
  return note.baseType === "hidden";
}

export function isJudgedNote(note: RuntimeNoteSemantic | null | undefined): boolean {
  return !!note && !isHiddenNote(note);
}

export function isJudgedEvent(event: ChartEvent): boolean {
  return event.eventType === "note" && isJudgedNote(event.note);
}

export function isHiddenNoSeNote(note: RuntimeNoteSemantic): boolean {
  return isHiddenNote(note);
}

export function isGrayEligibleNote(note: RuntimeNoteSemantic): boolean {
  return note.baseType === "single" && note.slideRole === "none";
}

export function resolveSeKind(note: RuntimeNoteSemantic): SeKind | null {
  if (isHiddenNoSeNote(note)) {
    return null;
  }
  if (note.baseType === "skill") {
    return "skill";
  }
  if (note.baseType === "directional_flick_left" || note.baseType === "directional_flick_right") {
    const width = Math.max(1, Math.round(note.directionalWidth));
    if (width <= 1) {
      return "directional_fl_1";
    }
    if (width === 2) {
      return "directional_fl_2";
    }
    return "directional_fl_3";
  }
  if (isFlickHitNote(note)) {
    return "flick";
  }
  if (note.baseType === "single" || note.baseType === "flick") {
    return "normal";
  }
  return null;
}
