import source from "../data/originalMusicSelectionProfile.json";

const scroll = source.prefabs.layout.components.find(component => component.id === 213)!.data as {
  scrollMomentumMin: number; scrollMomentumMax: number; scrollFriction: number;
  scrollMomentRatio: number; swipeMomentumMin: number; swipeMomentumMax: number;
};
export const MUSIC_CELL_HEIGHT = 64;
const clamp = (value: number, maximum: number) => Math.min(maximum, Math.max(0, value));

/** Finite Carousel list. The bottom list consumes this same position in LateUpdate.
 * Source: CarouselScrollMusicSelectScrollView / StarSimpleScrollView / RecycleScrollView.
 * Click ScrollDuration and release ScrollMomentum are distinct transitions. */
export class MusicSelectionCarousel {
  position = MUSIC_CELL_HEIGHT / 2;
  candidate = 0;
  confirmed = 0;
  private momentum = 0;
  private tween: { from: number; to: number; elapsed: number; duration: number } | null = null;
  private dragging = false;
  private pendingPosition: number | null = null;
  private pendingRelease: { speed: number } | null = null;
  constructor(public count: number, readonly targetFrameRate = 60,
    private readonly onSwitch?: (candidate: number, confirmed: number) => void,
    private readonly onEndAttempt?: () => void, initialIndex = 0) {
    this.candidate = this.confirmed = Math.max(0, Math.min(count - 1, initialIndex));
    this.position = count ? (this.confirmed + 0.5) * MUSIC_CELL_HEIGHT : 0;
  }
  appendCount(count: number) { this.count = count; }
  get maximum() { return Math.max(0, this.count) * MUSIC_CELL_HEIGHT; }
  get moving() { return this.dragging || this.momentum !== 0 || this.tween !== null; }
  private setPosition(position: number) {
    const previous = this.candidate;
    this.position = clamp(position, this.maximum);
    // Nearest cell sorts by distance, retaining the earlier cell on a tie.
    this.candidate = Math.min(Math.max(0, this.count - 1), Math.max(0, Math.ceil(this.position / MUSIC_CELL_HEIGHT - 1)));
    if (this.candidate !== previous) this.onSwitch?.(this.candidate, this.confirmed);
  }
  beginDrag() { this.pendingRelease = null; this.dragging = true; this.momentum = 0; this.tween = null; }
  drag(delta: number) { this.setPosition(this.position + delta * scroll.scrollMomentRatio); }
  // UICamera samples pointer position in its frame update. DOM move events only
  // replace the pending position; the normal selection callback runs on consumption.
  queueDrag(delta: number) {
    if (delta > 0 && (this.candidate === this.count - 1 || (this.pendingPosition ?? this.position) >= this.maximum)) this.onEndAttempt?.();
    this.pendingPosition = (this.pendingPosition ?? this.position) + delta * scroll.scrollMomentRatio;
  }
  queueSeek(fraction: number) {
    if (fraction > 1) this.onEndAttempt?.();
    this.pendingPosition = clamp(fraction, 1) * this.maximum;
  }
  queueRelease(speed = 0) { this.pendingRelease = { speed }; }
  release(speed: number) {
    this.dragging = false;
    if (!speed) { this.snap(); return; }
    const magnitude = clamp(Math.abs(speed), scroll.swipeMomentumMax);
    this.momentum = Math.sign(speed) * (scroll.scrollMomentumMin +
      (scroll.scrollMomentumMax - scroll.scrollMomentumMin) *
      (Math.max(scroll.swipeMomentumMin, magnitude) - scroll.swipeMomentumMin) / scroll.swipeMomentumMax);
  }
  cancelDrag() { this.dragging = false; this.snap(); }
  choose(index: number) {
    if (index >= this.count) this.onEndAttempt?.();
    if (!this.count) return;
    this.pendingPosition = null; this.pendingRelease = null;
    this.dragging = false; this.momentum = 0;
    this.animate((clamp(index, Math.max(0, this.count - 1)) + 0.5) * MUSIC_CELL_HEIGHT, 0.2);
  }
  seek(fraction: number) {
    this.momentum = 0; this.tween = null;
    this.setPosition(clamp(fraction, 1) * this.maximum);
  }
  private animate(to: number, duration: number) {
    if (to === this.position) { this.tween = null; this.confirmed = this.candidate; return; }
    this.tween = { from: this.position, to, elapsed: 0, duration };
  }
  snap() {
    this.momentum = 0;
    if (!this.count) return;
    const to = (this.candidate + 0.5) * MUSIC_CELL_HEIGHT;
    // RecycleScrollView.ScrollMomentum: abs(distance / momentum / targetFrameRate).
    this.animate(to, Math.abs(to - this.position) / 10 / this.targetFrameRate);
  }
  update(deltaSeconds: number) {
    if (this.pendingPosition !== null) {
      const position = this.pendingPosition; this.pendingPosition = null;
      this.setPosition(position);
    }
    if (this.pendingRelease) {
      const { speed } = this.pendingRelease; this.pendingRelease = null;
      this.release(speed);
      // Start inertia/tween on the next frame, after the final input sample.
      return;
    }
    if (this.tween) {
      const tween = this.tween;
      tween.elapsed += deltaSeconds;
      const t = Math.min(1, tween.elapsed / tween.duration);
      // DOTween's default OutQuad applies to these To tweens.
      this.setPosition(tween.from + (tween.to - tween.from) * (1 - (1 - t) ** 2));
      if (t === 1) { this.tween = null; this.confirmed = this.candidate; }
    } else if (this.momentum) {
      const next = this.position + this.momentum * scroll.scrollMomentRatio;
      this.setPosition(next);
      if (next < 0 || next > this.maximum || Math.abs(this.momentum) < scroll.scrollMomentumMin) {
        this.snap();
      } else this.momentum *= scroll.scrollFriction;
    }
  }
}
