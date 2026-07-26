import { evidenceRequired, type SimulatorResult } from "../evidence";
import { convertResultDictionary } from "./batchConversion";
import { NoteDataBMSBuilder } from "./bmsBuilder";
import { ChartConstructionEvidence } from "./evidence";
import {
  MusicScoreBezierConverter,
  MusicScoreHeaderParser,
} from "./musicScoreBezier";
import { setupLongAndSlideNoteGraphs } from "./noteGraph";
import type {
  ChartConstructionInput,
  ChartConstructionResult,
} from "./types";

export { MusicScoreBezierConverter, MusicScoreHeaderParser } from "./musicScoreBezier";
export { NoteDataBMSBuilder } from "./bmsBuilder";
export { convertResultDictionary } from "./batchConversion";
export { setupLongAndSlideNoteGraphs } from "./noteGraph";

export class NoteBatchInformationListFactory {
  private readonly headerParser = new MusicScoreHeaderParser();
  private readonly bezierConverter = new MusicScoreBezierConverter(
    this.headerParser,
  );
  private readonly bmsBuilder = new NoteDataBMSBuilder();

  createNoteBatchInformationList(
    musicScoreData: string,
    isCommand = false,
  ): SimulatorResult<ChartConstructionResult> {
    const convertedScore = this.bezierConverter.convert(musicScoreData);
    if (convertedScore.status !== "ok") {
      return convertedScore;
    }
    const initializeBuilder = this.bmsBuilder.initialize(
      convertedScore.value ?? musicScoreData,
      isCommand,
    );
    if (initializeBuilder.status !== "ok") {
      return initializeBuilder;
    }
    const noteBatches = convertResultDictionary(this.bmsBuilder.resultDictionary);
    setupLongAndSlideNoteGraphs(
      noteBatches,
      this.bmsBuilder.isMultiRangeNotes,
    );
    return evidenceRequired(
      "chart-construction.multi-range-combine",
      [
        ChartConstructionEvidence.E01,
        ChartConstructionEvidence.E04,
        ChartConstructionEvidence.E09,
        ChartConstructionEvidence.E10,
      ],
      "C07 through C09 must restore HABAHIRO combining, command data, and final filtering.",
    );
  }
}

export function createNoteBatchInformationList(
  input: ChartConstructionInput,
): SimulatorResult<ChartConstructionResult> {
  return new NoteBatchInformationListFactory().createNoteBatchInformationList(
    input.musicScoreData,
    input.isCommand ?? false,
  );
}
