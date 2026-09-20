export const SERIALIZED_BUTTON_PRESS_ALPHA = 0.5;

/** StarUIButton interaction shared by modal and result buttons; no rendering or page actions. */
export class SerializedButtonInput<T extends string> {
  private readonly pressed = new Map<number, T>();

  press(finger: number, target: T | null): void {
    if (target !== null) this.pressed.set(finger, target);
  }

  release(finger: number, target: T | null): T | null {
    const captured = this.pressed.get(finger);
    this.pressed.delete(finger);
    return captured !== undefined && captured === target ? captured : null;
  }

  get pressedTargets(): readonly T[] { return [...new Set(this.pressed.values())]; }
  get isPressed(): boolean { return this.pressed.size > 0; }
  clear(): void { this.pressed.clear(); }
}

export function containsSerializedButton(
  point: Readonly<{ x: number; y: number }>,
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
): boolean {
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y && point.y <= bounds.y + bounds.height;
}

/** UICamera.ProcessTouches routes both Ended (3) and Canceled (4) to release. */
export function isSerializedTouchRelease(phase: number): boolean {
  return phase === 3 || phase === 4;
}
