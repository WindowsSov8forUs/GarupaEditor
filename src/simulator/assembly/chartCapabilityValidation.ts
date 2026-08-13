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
      "launch-failed",
      "simulator.composition.impossible-button-07-invariant",
      "Current legal 10.1.4 BMS construction cannot produce enum value 7, and the original scene owns only full ButtonType 0..6. A post-construction value-7 injection is an internal graph invariant violation, not an open eighth-lane capability.",
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
