/** AbstractDialog's application-level transition, shared by DOM and Pixi. */
export class SerializedDialogMotion {
  static readonly duration = 0.15;
  private startedAt = 0;
  private opening = false;
  private scaleFrom = 0;
  private alphaFrom = 0.01;
  scale = 0;
  alpha = 0;

  setOpen(open: boolean, now: number, openingAlpha = 0.01): void {
    if (this.opening === open) return;
    this.scaleFrom = this.scale;
    this.alphaFrom = open ? openingAlpha : this.alpha;
    this.opening = open;
    this.startedAt = now;
  }

  update(now: number): boolean {
    // Reverse 5514c30b: linear DOScale 0.15 s, background fade 0.14 s.
    const elapsed = Math.max(0, now - this.startedAt);
    this.scale = this.scaleFrom + ((this.opening ? 1 : 0) - this.scaleFrom) * Math.min(1, elapsed / 0.15);
    this.alpha = this.alphaFrom + ((this.opening ? 0.5 : 0) - this.alphaFrom) * Math.min(1, elapsed / 0.14);
    return this.opening || elapsed < SerializedDialogMotion.duration;
  }
}

/** RhythmGameSettingDialog.startOpen / Close: local translation, never a scale tween. */
export class SerializedSettingsDialogMotion {
  readonly scale = 1;
  x = -800;
  alpha = 0;
  private opening = false;
  private startedAt = -Infinity;
  private initialized = false;
  private wroteStartFrame = false;
  private positionFrom = -800;
  setOpen(open: boolean, now: number, _openingAlpha = 0): void {
    if (!this.initialized && !open) { this.initialized = true; return; }
    if (this.initialized && this.opening === open) return;
    if (!open && Number.isFinite(this.startedAt)) this.update(now);
    this.initialized = true; this.opening = open; this.startedAt = now;
    this.wroteStartFrame = false;
    this.positionFrom = open ? -800 : this.x;
    this.x = this.positionFrom;
    this.alpha = open ? 0 : 0.5;
  }
  update(now: number): boolean {
    const elapsed = Math.max(0, now - this.startedAt);
    // The original fade coroutine writes the start alpha and yields one frame.
    const positionProgress = this.wroteStartFrame ? Math.min(1, elapsed / 0.15) : 0;
    const coverProgress = this.wroteStartFrame ? Math.min(1, elapsed / 0.14) : 0;
    this.wroteStartFrame = true;
    this.x = this.positionFrom + ((this.opening ? 0 : -800) - this.positionFrom) * positionProgress;
    this.alpha = this.opening ? 0.5 * coverProgress : 0.5 * (1 - coverProgress);
    return this.opening || elapsed < 0.15;
  }
}
