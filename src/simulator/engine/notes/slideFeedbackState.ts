/** The feedback owned by a Slide, independent of how its graph advances. */
export class SlideFeedbackState {
  private sequence = 0;
  private playingRevision: number | null = null;
  private soundActive = false;

  constructor(private readonly onSound: (action: "start" | "fade") => void) {}

  get revision(): number | null { return this.playingRevision; }
  restartFlash(): void { this.playingRevision = ++this.sequence; }
  hideFlash(): void { this.playingRevision = null; }

  setSound(action: "start" | "fade"): void {
    const active = action === "start";
    if (active === this.soundActive) return;
    this.soundActive = active;
    this.onSound(action);
  }

  reset(): void {
    this.sequence = 0;
    this.playingRevision = null;
    this.soundActive = false;
  }

  snapshot() { return { sequence: this.sequence, revision: this.playingRevision, soundActive: this.soundActive }; }
  restore(snapshot: ReturnType<SlideFeedbackState["snapshot"]>): void {
    this.sequence = snapshot.sequence;
    this.playingRevision = snapshot.revision;
    this.soundActive = snapshot.soundActive;
  }
}
