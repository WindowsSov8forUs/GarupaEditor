import behavior from "../data/originalSkinPreviewBehavior.json";
import { originalPreviewArrivalSeconds } from "../simulator/public/preview";

export type OriginalPreviewNoteType = 0 | 1 | 2 | 3 | 5 | 6 | 7;
export interface OriginalPreviewNote {
  readonly id: number;
  readonly type: OriginalPreviewNoteType;
  readonly arrivalSeconds: number;
  readonly size: number;
  elapsed: number;
  animationElapsed: number;
  y: number;
  scale: number;
  stopped: boolean;
  dust: boolean;
}

/** PreviewNote.OnUpdate and SkinPreview's existing impact/coroutine sequence. */
export class OriginalSkinPreviewMotion {
  private serial = 0;
  private clock = 0;
  private currentType: OriginalPreviewNoteType = 0;
  private nextType: OriginalPreviewNoteType = 0;
  private tailAt: number | null = null;
  private notes: OriginalPreviewNote[] = [];
  constructor(private speed: number, private size: number, readonly startY: number, readonly goalY: number,
    private readonly onImpact?: (type: OriginalPreviewNoteType) => void) {
    this.setParameters(speed, size);
    if (!(startY > goalY)) throw new Error("Original preview endpoints are not ordered.");
    this.spawn(0);
  }
  setParameters(speed: number, size: number): void {
    if (!Number.isFinite(speed) || speed < 1 || speed > 12 || !Number.isFinite(size) || size < 80 || size > 150)
      throw new Error("Preview settings are outside the original speed/size domains.");
    this.speed = speed; this.size = size;
  }
  private spawn(type: OriginalPreviewNoteType): void {
    this.notes.push({ id: ++this.serial, type, arrivalSeconds: originalPreviewArrivalSeconds(this.speed),
      size: this.size / 100, elapsed: 0, animationElapsed: 0, y: this.startY, scale: behavior.initialScale, stopped: false, dust: false });
  }
  private impact(note: OriginalPreviewNote): void {
    this.onImpact?.(note.type);
    if (note.type === behavior.holdHeadType) { note.stopped = true; return; }
    note.dust = true;
    if (note.type === behavior.holdTailType) {
      for (const head of this.notes) if (head.type === behavior.holdHeadType) head.dust = true;
    }
    const next = behavior.nextOnImpact[String(note.type) as keyof typeof behavior.nextOnImpact];
    if (next !== null) this.nextType = next as OriginalPreviewNoteType;
  }
  step(deltaSeconds: number): readonly OriginalPreviewNote[] {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error("Preview delta must be non-negative and finite.");
    this.clock += deltaSeconds;
    const distance = this.startY - this.goalY;
    for (const note of this.notes) {
      note.animationElapsed += deltaSeconds;
      if (note.stopped || note.dust) continue;
      const curve = Math.pow(1.1, (note.elapsed / note.arrivalSeconds - 1) * 50);
      note.y = Math.max(this.goalY, this.startY - Math.abs(distance * curve));
      note.scale = (this.startY - note.y) / distance * note.size;
      if (note.y <= this.goalY) this.impact(note);
      else note.elapsed += deltaSeconds;
    }
    this.notes = this.notes.filter(note => !note.dust);
    if (this.currentType !== this.nextType) {
      this.currentType = this.nextType;
      this.spawn(this.currentType);
      if (this.currentType === behavior.holdHeadType) this.tailAt = this.clock + behavior.holdTailDelaySeconds;
    }
    if (this.tailAt !== null && this.clock >= this.tailAt) { this.spawn(5); this.tailAt = null; }
    return this.notes;
  }
}
