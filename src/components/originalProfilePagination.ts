/** ProfilePageController: logical indices stay fixed while page transforms move. */
export class OriginalProfilePagination {
  index = 0;
  rootX = 0;
  readonly pageX: number[];
  motion: { from: number; to: number; previousIndex: number } | null = null;

  constructor(readonly count: number, readonly pageWidth: number) {
    this.pageX = Array.from({ length: count }, (_, index) => index * pageWidth);
  }

  turn(direction: -1 | 1): boolean {
    if (this.motion !== null || this.count < 2) return false;
    const previousIndex = this.index;
    this.index = direction === 1 ? (this.index + 1) % this.count
      : (this.index > 0 ? this.index : this.count) - 1;
    const targetX = this.rootX - direction * this.pageWidth;
    this.pageX[this.index] = -targetX;
    this.motion = { from: this.rootX, to: targetX, previousIndex };
    return true;
  }

  complete(): void {
    if (!this.motion) return;
    this.rootX = this.motion.to;
    this.motion = null;
  }
}
