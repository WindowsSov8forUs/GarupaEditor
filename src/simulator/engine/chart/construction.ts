import { evidenceRequired, type SimulatorResult } from "../evidence";
import { NoteDataBMSBuilder } from "./bmsBuilder";
import { ChartConstructionEvidence } from "./evidence";
import {
  MusicScoreBezierConverter,
  MusicScoreHeaderParser,
} from "./musicScoreBezier";
import type {
  ChartConstructionInput,
  ChartConstructionResult,
} from "./types";

export { MusicScoreBezierConverter, MusicScoreHeaderParser } from "./musicScoreBezier";
export { NoteDataBMSBuilder } from "./bmsBuilder";

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
    return evidenceRequired(
      "chart-construction.batch-factory",
      [
        ChartConstructionEvidence.E01,
        ChartConstructionEvidence.E04,
        ChartConstructionEvidence.E09,
        ChartConstructionEvidence.E10,
      ],
      "C05 through C09 must restore ordering, Long and Slide ownership, HABAHIRO combining, command data, and final filtering.",
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
