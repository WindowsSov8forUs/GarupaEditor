import {
  ButtonType,
  type ChartConstructionResult,
  type NoteInformation,
} from "../engine/chart/types";
import type { SimulatorModuleLaunchRequest } from "../public/contracts";
import { rejected, type SimulatorAssemblyResult } from "../resources/sharedResourceAdapters";

export function validateConstructedChartCapabilities(
  chart: ChartConstructionResult,
  request: SimulatorModuleLaunchRequest,
): SimulatorAssemblyResult<void> {
  void request;
  const notes = chart.noteBatches.flatMap((batch) => batch.informationList);
  if (notes.some(noteTreeUsesUnsupportedButton07)) {
    return rejected(
      "evidence-required",
      "simulator.composition.unsupported-button-07",
      "The committed 10.1.4 scene contract has no Button_07_BMS_1P_07 mapping; the chart is rejected before static-resource selection or backend construction.",
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


function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
