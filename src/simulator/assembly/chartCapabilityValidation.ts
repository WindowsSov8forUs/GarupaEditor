import {
  ButtonType,
  FrontNoteType,
  type ChartConstructionResult,
  type NoteInformation,
} from "../engine/chart/types";
import type { SimulatorModuleLaunchRequest } from "../public/contracts";
import { rejected, type SimulatorAssemblyResult } from "../resources/sharedResourceAdapters";

export function validateConstructedChartCapabilities(
  chart: ChartConstructionResult,
  request: SimulatorModuleLaunchRequest,
): SimulatorAssemblyResult<void> {
  const notes = chart.noteBatches.flatMap((batch) => batch.informationList);
  if (notes.some(noteTreeUsesUnsupportedButton07)) {
    return rejected(
      "evidence-required",
      "simulator.composition.unsupported-button-07",
      "The committed 10.1.4 scene contract has no Button_07_BMS_1P_07 mapping; the chart is rejected before static-resource selection or backend construction.",
    );
  }
  if (chart.habahiroChangeAbsolutePos < 0) return accepted(undefined);
  if (!request.config.habahiroPreview.allowExternalDegraded) {
    return rejected(
      "evidence-required",
      "simulator.composition.habahiro-degraded-preview-not-selected",
      "A HABAHIRO chart requires explicit degraded external-preview selection; production never falls back from ordinary or exact rendering.",
    );
  }
  if (notes.some(noteTreeRequiresUnauthorizedHabahiroAnimation)) {
    return rejected(
      "evidence-required",
      "render.habahiro.external-note-animation-evidence-required",
      "The external HABAHIRO atlas has no authorized current Note animation mapping; the chart is rejected before static-resource reads and backend preparation.",
    );
  }
  return accepted(undefined);
}

function noteTreeUsesUnsupportedButton07(note: NoteInformation): boolean {
  return note.buttonType === ButtonType.Button_07_BMS_1P_07 ||
    note.buttonTypes.includes(ButtonType.Button_07_BMS_1P_07) ||
    note.buttonTypesArray.includes(ButtonType.Button_07_BMS_1P_07) ||
    note.slideNoteList.some(noteTreeUsesUnsupportedButton07);
}

function noteTreeRequiresUnauthorizedHabahiroAnimation(note: NoteInformation): boolean {
  const front = note.fireNoteType;
  return front === FrontNoteType.Flick ||
    front === FrontNoteType.DirectionalFlick ||
    front === FrontNoteType.MultipleDirectionalFlick ||
    front === FrontNoteType.LongMultipleDirectionalFlickAdd ||
    front === FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
    front === FrontNoteType.SlideBMultipleDirectionalFlickAdd ||
    front === FrontNoteType.Long ||
    front === FrontNoteType.SlideA ||
    front === FrontNoteType.SlideB ||
    note.slideNoteList.some(noteTreeRequiresUnauthorizedHabahiroAnimation);
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
