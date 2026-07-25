import {
  evidenceRequired,
  type SimulatorResult,
} from "../evidence";
import { ChartConstructionEvidence } from "./evidence";
import type {
  ChartConstructionInput,
  ChartConstructionResult,
} from "./types";

export class MusicScoreHeaderParser {
  private readonly wavFileNamesValue = new Map<string, string>();
  private readonly additiveWavFileNamesValue = new Map<string, string>();
  private isMultiRangeValue = false;

  get wavFileNames(): ReadonlyMap<string, string> {
    return this.wavFileNamesValue;
  }

  get additiveWavFileNames(): ReadonlyMap<string, string> {
    return this.additiveWavFileNamesValue;
  }

  get isMultiRange(): boolean {
    return this.isMultiRangeValue;
  }

  parse(_musicScoreData: string): SimulatorResult<void> {
    return evidenceRequired(
      "chart-construction.header-parse",
      [
        ChartConstructionEvidence.E05,
        ChartConstructionEvidence.E06,
        ChartConstructionEvidence.E08,
      ],
      "C03 must restore MusicScoreHeaderParser.Parse before raw BMS construction can continue.",
    );
  }

  reParse(_musicScoreData: string): SimulatorResult<void> {
    return evidenceRequired(
      "chart-construction.header-reparse",
      [
        ChartConstructionEvidence.E05,
        ChartConstructionEvidence.E06,
        ChartConstructionEvidence.E08,
      ],
      "C03 must restore MusicScoreHeaderParser.ReParse before converted score text can continue.",
    );
  }
}

export class MusicScoreBezierConverter {
  constructor(readonly headerParser: MusicScoreHeaderParser) {}

  convert(musicScoreData: string): SimulatorResult<string> {
    const parseResult = this.headerParser.parse(musicScoreData);
    if (parseResult.status !== "ok") {
      return parseResult;
    }
    return evidenceRequired(
      "chart-construction.bezier-conversion",
      [
        ChartConstructionEvidence.E05,
        ChartConstructionEvidence.E06,
        ChartConstructionEvidence.E07,
        ChartConstructionEvidence.E08,
      ],
      "C03 must restore the exact 200-sample conversion, quantization, reduction, and text reconstruction pipeline.",
    );
  }
}

export class NoteDataBMSBuilder {
  private readonly resultDictionaryValue = new Map<number, unknown>();
  private readonly bpmChangeRealValueListValue: number[] = [];
  private readonly bpmChangeStringRealValueListValue: string[] = [];

  get resultDictionary(): ReadonlyMap<number, unknown> {
    return this.resultDictionaryValue;
  }

  get bpmChangeRealValueList(): readonly number[] {
    return this.bpmChangeRealValueListValue;
  }

  get bpmChangeStringRealValueList(): readonly string[] {
    return this.bpmChangeStringRealValueListValue;
  }

  initialize(
    _musicScoreData: string,
    _isCommand: boolean,
  ): SimulatorResult<void> {
    return evidenceRequired(
      "chart-construction.bms-builder",
      [
        ChartConstructionEvidence.E01,
        ChartConstructionEvidence.E02,
        ChartConstructionEvidence.E03,
        ChartConstructionEvidence.E04,
        ChartConstructionEvidence.E13,
        ChartConstructionEvidence.E16,
        ChartConstructionEvidence.E17,
        ChartConstructionEvidence.E18,
      ],
      "C04 must restore NoteDataBMSBuilder initialization and line parsing before batch construction can continue.",
    );
  }
}

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
      convertedScore.value,
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
