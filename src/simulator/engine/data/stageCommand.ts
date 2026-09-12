import profile from "../skin/stagePsyllium.json";

export type StagePsylliumCommand = keyof typeof profile.commandMotions | keyof typeof profile.commandColors;

/** Presentation input after chart construction; one beat is 48 original units. */
export interface StageCommandNote {
  readonly absolutePosition: number;
  readonly soundValue: StagePsylliumCommand;
}

export function isStagePsylliumCommand(value: unknown): value is StagePsylliumCommand {
  return typeof value === "string" && (Object.prototype.hasOwnProperty.call(profile.commandMotions, value) || Object.prototype.hasOwnProperty.call(profile.commandColors, value));
}
