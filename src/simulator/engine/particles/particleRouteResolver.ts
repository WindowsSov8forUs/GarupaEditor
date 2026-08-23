import type { ParticleRootId } from "../../backends/particleContracts";
import {
  AfterNoteType,
  GameNoteType,
  type AfterNoteTypeValue,
  type GameNoteTypeValue,
} from "../chart/types";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";
import { NoteResultType, type NoteResultTypeValue } from "../data/manualJudgement";

export interface ParticleJudgementRouteInput {
  readonly result: NoteResultTypeValue;
  readonly judgeNoteType: number;
  readonly gameNoteType: GameNoteTypeValue;
  readonly isSkillNote: boolean;
  readonly multipleDirectionalFlickNoteCount: number;
  readonly rangeLength: number;
}

export interface ParticleDirectionalFingerRouteInput {
  readonly afterNoteType: AfterNoteTypeValue;
  readonly gameNoteType: GameNoteTypeValue;
}

const LEFT_DIRECTIONAL_GAME_NOTE_TYPES: ReadonlySet<number> = new Set([
  GameNoteType.DirectionalFlickLeft,
  GameNoteType.LongDirectionalFlickLeft,
  GameNoteType.SlideADirectionalFlickLeft,
  GameNoteType.SlideBDirectionalFlickLeft,
]);
const RIGHT_DIRECTIONAL_GAME_NOTE_TYPES: ReadonlySet<number> = new Set([
  GameNoteType.DirectionalFlickRight,
  GameNoteType.LongDirectionalFlickRight,
  GameNoteType.SlideADirectionalFlickRight,
  GameNoteType.SlideBDirectionalFlickRight,
]);
const LEFT_DIRECTIONAL_AFTER_NOTE_TYPES: ReadonlySet<number> = new Set([
  AfterNoteType.DirectionalFlickLeft,
  AfterNoteType.MultipleDirectionalFlickLeft,
  AfterNoteType.SlideDirectionalFlickEndLeft,
  AfterNoteType.SlideMultipleDirectionalFlickLeft,
]);
const RIGHT_DIRECTIONAL_AFTER_NOTE_TYPES: ReadonlySet<number> = new Set([
  AfterNoteType.DirectionalFlickRight,
  AfterNoteType.MultipleDirectionalFlickRight,
  AfterNoteType.SlideDirectionalFlickEndRight,
  AfterNoteType.SlideMultipleDirectionalFlickRight,
]);
const DIRECTIONAL_JUDGE_NOTE_TYPES: ReadonlySet<number> = new Set([6, 7, 9, 10]);
const FLICK_JUDGE_NOTE_TYPES: ReadonlySet<number> = new Set([3, 5]);

export function resolveParticleJudgementRoot(
  input: ParticleJudgementRouteInput,
): SimulatorResult<ParticleRootId | null> {
  if (!isClosedJudgementRouteInput(input)) {
    return rejected(
      "particle.route.invalid-judgement-input",
      "Particle routing accepts only the closed result, judge-note, game-note, count and range domains.",
    );
  }
  if (input.isSkillNote) return ok(skillRoot(input.result));
  if (DIRECTIONAL_JUDGE_NOTE_TYPES.has(input.judgeNoteType)) {
    if (input.result < NoteResultType.Good) return ok(null);
    const side = directionalSideFromGameNote(input.gameNoteType);
    if (side === null) {
      return rejected(
        "particle.route.unknown-directional-game-note-type",
        "Portable directional routing fails closed rather than reproduce current logging followed by a null particle.",
      );
    }
    const suffix = input.multipleDirectionalFlickNoteCount <= 1
      ? "" : input.multipleDirectionalFlickNoteCount === 2 ? "_2" : "_3";
    return ok(`directional:effect_tap_directional_flick_${side}${suffix}` as ParticleRootId);
  }
  if (FLICK_JUDGE_NOTE_TYPES.has(input.judgeNoteType)) {
    return ok(input.result >= NoteResultType.Good
      ? "ordinary:effect_tap_swipe"
      : null);
  }
  return ok(ordinaryRoot(input.result));
}

export function resolveParticleDirectionalFingerRoot(
  input: ParticleDirectionalFingerRouteInput,
): SimulatorResult<ParticleRootId> {
  if (input === null || typeof input !== "object" ||
    !Number.isInteger(input.afterNoteType) || !Number.isInteger(input.gameNoteType)) {
    return rejected(
      "particle.route.invalid-directional-finger-input",
      "Directional finger effects require owner-authored current after-note and game-note enum values.",
    );
  }
  const side = LEFT_DIRECTIONAL_AFTER_NOTE_TYPES.has(input.afterNoteType)
    ? "l"
    : RIGHT_DIRECTIONAL_AFTER_NOTE_TYPES.has(input.afterNoteType)
      ? "r"
      : directionalSideFromGameNote(input.gameNoteType);
  return side === null
    ? rejected(
        "particle.route.unknown-directional-finger-side",
        "An unknown after-note/game-note combination cannot invent a directional finger side.",
      )
    : ok(`directional:effect_tap_directional_flick_${side}_finger` as ParticleRootId);
}

export function isTapKeepStartJudgeNoteType(judgeNoteType: number): boolean {
  return judgeNoteType === 4;
}

export function isTapKeepStopJudgeNoteType(judgeNoteType: number): boolean {
  return judgeNoteType === 1 || judgeNoteType === 2 || judgeNoteType === 5 ||
    judgeNoteType === 6 || judgeNoteType === 7;
}

function ordinaryRoot(result: NoteResultTypeValue): ParticleRootId | null {
  switch (result) {
    case NoteResultType.None:
      return "ordinary:effect_tap";
    case NoteResultType.Good:
      return "ordinary:effect_tap_good";
    case NoteResultType.Great:
      return "ordinary:effect_tap_great";
    case NoteResultType.Perfect:
      return "ordinary:effect_tap_perfect";
    case NoteResultType.Miss:
    case NoteResultType.Bad:
      return null;
  }
}

function skillRoot(result: NoteResultTypeValue): ParticleRootId | null {
  switch (result) {
    case NoteResultType.None:
      return "ordinary:effect_tap";
    case NoteResultType.Good:
      return "ordinary:effect_tap_skill_good";
    case NoteResultType.Great:
      return "ordinary:effect_tap_skill_great";
    case NoteResultType.Perfect:
      return "ordinary:effect_tap_skill_perfect";
    case NoteResultType.Miss:
    case NoteResultType.Bad:
      return null;
  }
}

function directionalSideFromGameNote(gameNoteType: number): "l" | "r" | null {
  if (LEFT_DIRECTIONAL_GAME_NOTE_TYPES.has(gameNoteType)) return "l";
  if (RIGHT_DIRECTIONAL_GAME_NOTE_TYPES.has(gameNoteType)) return "r";
  return null;
}

function isClosedJudgementRouteInput(
  input: ParticleJudgementRouteInput,
): boolean {
  return input !== null && typeof input === "object" &&
    Number.isInteger(input.result) && input.result >= NoteResultType.None && input.result <= NoteResultType.Perfect &&
    Number.isInteger(input.judgeNoteType) && input.judgeNoteType >= 0 && input.judgeNoteType <= 10 &&
    Number.isInteger(input.gameNoteType) && input.gameNoteType >= GameNoteType.None &&
      input.gameNoteType <= GameNoteType.SlideAddDirectionalFlick &&
    typeof input.isSkillNote === "boolean" &&
    Number.isSafeInteger(input.multipleDirectionalFlickNoteCount) &&
      input.multipleDirectionalFlickNoteCount >= 0 && input.multipleDirectionalFlickNoteCount <= 0xffffffff &&
    Number.isInteger(input.rangeLength) && input.rangeLength >= 1 && input.rangeLength <= 7;
}

function rejected<T = never>(capability: string, boundary: string): SimulatorResult<T> {
  return integrityFailure(capability, [], boundary);
}
