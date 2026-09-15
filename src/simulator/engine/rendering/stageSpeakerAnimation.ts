export type StageSpeakerClipName = "idle" | "speaker_normal" | "speaker_continuous" | "speaker_exciting";
export function stageSpeakerClipForJudgement(noteType: number, result: number): StageSpeakerClipName | null {
  if (noteType === 1) return "idle";
  if (result === 0) return null;
  if (noteType === 0 || noteType === 8 || noteType === 2) return "speaker_normal";
  if (noteType === 4) return "speaker_continuous";
  const flickBit = noteType - 3;
  return flickBit >= 0 && flickBit <= 7 && ((0xdd >>> flickBit) & 1) !== 0 ? "speaker_exciting" : null;
}
