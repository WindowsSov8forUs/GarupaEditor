export type StageSpeakerClipName = "idle" | "speaker_normal" | "speaker_continuous" | "speaker_exciting";
export interface StageSpeakerClip {
  readonly duration: number;
  readonly loop: boolean;
  readonly curveCount: number;
  readonly constants: readonly number[];
  readonly bindings: readonly { path: string; property: string; index: number; size: number }[];
  readonly frames: readonly { time: number; keys: readonly { index: number; coefficients: readonly number[] }[] }[];
}

export function stageSpeakerClipForJudgement(noteType: number, result: number): StageSpeakerClipName | null {
  if (noteType === 1) return "idle";
  if (result === 0) return null;
  if (noteType === 0 || noteType === 8 || noteType === 2) return "speaker_normal";
  if (noteType === 4) return "speaker_continuous";
  const flickBit = noteType - 3;
  return flickBit >= 0 && flickBit <= 7 && ((0xdd >>> flickBit) & 1) !== 0 ? "speaker_exciting" : null;
}

export class StageSpeakerAnimation {
  readonly values: Float64Array;
  private readonly keys: Array<readonly number[] | null>;
  private readonly times: Float64Array;
  private elapsed = 0;
  private frameIndex = -1;
  private previousPhase = -1;
  clip: StageSpeakerClip;

  constructor(private readonly clips: Readonly<Record<StageSpeakerClipName, StageSpeakerClip>>) {
    const count = Math.max(...Object.values(clips).map(clip => clip.curveCount + clip.constants.length));
    this.values = new Float64Array(count);
    this.times = new Float64Array(count);
    this.keys = Array.from({ length: count }, () => null);
    this.clip = clips.idle;
    this.play("idle");
  }

  play(name: StageSpeakerClipName): void {
    this.clip = this.clips[name];
    this.elapsed = 0;
    this.resetCursor();
    this.sample(0);
  }

  advance(deltaSeconds: number): boolean {
    if (!this.clip.loop && this.elapsed >= this.clip.duration) return false;
    this.elapsed += deltaSeconds;
    const phase = this.clip.loop ? this.elapsed % this.clip.duration : Math.min(this.elapsed, this.clip.duration);
    if (phase < this.previousPhase) this.resetCursor();
    this.sample(phase);
    return true;
  }

  private resetCursor(): void {
    this.frameIndex = -1;
    this.previousPhase = -1;
    this.keys.fill(null);
    this.values.set(this.clip.constants, this.clip.curveCount);
  }

  private sample(phase: number): void {
    const frames = this.clip.frames;
    while (this.frameIndex + 1 < frames.length && frames[this.frameIndex + 1]!.time <= phase) {
      const frame = frames[++this.frameIndex]!;
      for (const key of frame.keys) {
        this.keys[key.index] = key.coefficients;
        this.times[key.index] = frame.time;
      }
    }
    for (let index = 0; index < this.clip.curveCount; index++) {
      const key = this.keys[index];
      if (key === null || key === undefined) throw new Error("Stage speaker clip has an unbound animation channel.");
      const delta = phase - this.times[index]!;
      this.values[index] = ((key[0]! * delta + key[1]!) * delta + key[2]!) * delta + key[3]!;
    }
    this.previousPhase = phase;
  }
}
