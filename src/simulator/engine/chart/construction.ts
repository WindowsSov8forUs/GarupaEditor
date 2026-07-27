import { ok, type SimulatorResult } from "../evidence";
import { convertResultDictionary } from "./batchConversion";
import { NoteDataBMSBuilder } from "./bmsBuilder";
import { finalizeNoteBatches } from "./finalize";
import { freezeChartConstructionResult } from "./immutability";
import {
  MusicScoreBezierConverter,
  MusicScoreHeaderParser,
} from "./musicScoreBezier";
import {
  setupLongAndSlideNoteGraphs,
  setupMultipleDirectionalFlickNotes,
} from "./noteGraph";
import {
  combineMultiRangeBatches,
  findHabahiroChangeAbsolutePos,
} from "./multiRangeCombine";
import { registerMultiRangeSources } from "./multiRangeSources";
import type {
  ChartConstructionInput,
  ChartConstructionResult,
} from "./types";
import { registerConstructedChartRuntimeMetadata } from "../runtime/chartRuntimeMetadata";

export { MusicScoreBezierConverter, MusicScoreHeaderParser } from "./musicScoreBezier";
export { NoteDataBMSBuilder } from "./bmsBuilder";
export { convertResultDictionary } from "./batchConversion";
export {
  setupLongAndSlideNoteGraphs,
  setupMultipleDirectionalFlickNotes,
} from "./noteGraph";
export { finalizeNoteBatches } from "./finalize";
export {
  combineMultiRangeBatches,
  findHabahiroChangeAbsolutePos,
} from "./multiRangeCombine";
export {
  getMultiRangeSourceIdentity,
  multiRangeLaneFromCc,
} from "./multiRangeSources";

export class NoteBatchInformationListFactory {
  private readonly headerParser = new MusicScoreHeaderParser();
  private readonly bezierConverter = new MusicScoreBezierConverter(
    this.headerParser,
  );
  private readonly bmsBuilder = new NoteDataBMSBuilder();
  private habahiroChangeAbsolutePosValue = -1;

  get habahiroChangeAbsolutePos(): number {
    return this.habahiroChangeAbsolutePosValue;
  }

  createNoteBatchInformationList(
    musicScoreData: string,
    isCommand = false,
  ): SimulatorResult<ChartConstructionResult> {
    let constructionScore = musicScoreData;
    if (!isCommand) {
      const convertedScore = this.bezierConverter.convert(musicScoreData);
      if (convertedScore.status !== "ok") {
        return convertedScore;
      }
      constructionScore = convertedScore.value ?? musicScoreData;
    }
    const initializeBuilder = this.bmsBuilder.initialize(
      constructionScore,
      isCommand,
    );
    if (initializeBuilder.status !== "ok") {
      return initializeBuilder;
    }
    const noteBatches = convertResultDictionary(
      this.bmsBuilder.resultDictionary,
      {
        bpmChangeValueList: this.bmsBuilder.bpmChangeValueList,
        isMultiRange: this.bmsBuilder.isMultiRangeNotes,
      },
    );
    registerMultiRangeSources(
      noteBatches,
      this.bmsBuilder.isMultiRangeNotes,
    );
    setupLongAndSlideNoteGraphs(
      noteBatches,
      this.bmsBuilder.isMultiRangeNotes,
    );
    combineMultiRangeBatches(
      noteBatches,
      this.bmsBuilder.isMultiRangeNotes,
      isCommand,
    );
    this.habahiroChangeAbsolutePosValue = findHabahiroChangeAbsolutePos(noteBatches);
    finalizeNoteBatches(noteBatches);
    setupMultipleDirectionalFlickNotes(noteBatches);
    const result = freezeChartConstructionResult({
      noteBatches,
      startBpm: this.bmsBuilder.startBpm,
      startBpmString: this.bmsBuilder.startBpmString,
      bpmChangeRealValueList: [...this.bmsBuilder.bpmChangeRealValueList],
      bpmChangeStringRealValueList: [
        ...this.bmsBuilder.bpmChangeStringRealValueList,
      ],
      isMultiRangeNotes: this.bmsBuilder.isMultiRangeNotes,
      habahiroChangeAbsolutePos: this.habahiroChangeAbsolutePosValue,
    });
    registerConstructedChartRuntimeMetadata(result, isCommand);
    return ok(result);
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
