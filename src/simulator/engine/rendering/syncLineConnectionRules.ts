import { AfterNoteType, FrontNoteType, GameNoteType } from "../chart/types";
import { directionalEndpointButton, directionalEndpointPosition, isSameDirectionalGroup, type DirectionalGraphSource } from "../chart/noteGraph";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";

export interface SyncConnection<T> {
  readonly targetA: T; readonly targetB: T;
  readonly afterA: boolean; readonly afterB: boolean;
}

export function selectDirectionalSyncEndpoints<E extends { readonly after: boolean }>(
  a: { readonly left: E; readonly right: E }, b: { readonly left: E; readonly right: E },
  buttonA: number, buttonB: number,
): readonly [E, E] {
  const selectedA = buttonA > buttonB ? a.left : a.right;
  const selectedB = buttonA > buttonB ? b.right : b.left;
  return b.right.after ? [selectedB, selectedA] : [selectedA, selectedB];
}

/** Recovered connection decisions, independent of render storage and coordinate domain. */
export class SyncLineConnectionRules<T extends { readonly noteInformation: DirectionalGraphSource | null }, L extends SyncConnection<T>> {
  constructor(private readonly host: {
    readonly pendingTails: T[];
    readonly pendingDirectionalTails: T[];
    position(): number;
    hasTail(note: T): boolean;
    lineFor(note: T, after: boolean): L | null;
    connect(a: T, afterA: boolean, b: T, afterB: boolean, existing?: L | null): SimulatorResult<void>;
  }) {}

  isSameFrontTailDirectionalGroup(tail: T, front: T, maxRange = 2): boolean {
    const source = tail.noteInformation!;
    const target = front.noteInformation!;
    const after = source.afterNoteType;
    let matches = false;
    if (source.fireNoteType === FrontNoteType.Long) {
      matches = (after === AfterNoteType.MultipleDirectionalFlickLeft &&
        target.gameNoteType === GameNoteType.LongDirectionalFlickLeftAdd) ||
        (after === AfterNoteType.MultipleDirectionalFlickRight &&
          target.gameNoteType === GameNoteType.LongDirectionalFlickRightAdd);
    } else if (source.fireNoteType === FrontNoteType.SlideA || source.fireNoteType === FrontNoteType.SlideB) {
      const left = source.fireNoteType === FrontNoteType.SlideA
        ? GameNoteType.SlideADirectionalFlickLeftAdd : GameNoteType.SlideBDirectionalFlickLeftAdd;
      matches = (after === AfterNoteType.SlideMultipleDirectionalFlickLeft && target.gameNoteType === left) ||
        (after === AfterNoteType.SlideMultipleDirectionalFlickRight && target.gameNoteType === left + 1);
    }
    const difference = directionalEndpointButton(source) - target.buttonType;
    const left = after === AfterNoteType.MultipleDirectionalFlickLeft ||
      after === AfterNoteType.SlideMultipleDirectionalFlickLeft;
    return matches && (left ? difference > 0 && difference <= maxRange : difference < 0 && difference >= -maxRange);
  }

  reconnectSyncTail(tail: T, front: T): SimulatorResult<void> {
    const line = this.host.lineFor(tail, true);
    if (line === null) return ok(undefined);
    const otherIsA = line.targetB === tail && line.afterB;
    const other = otherIsA ? line.targetA : line.targetB;
    const otherAfter = otherIsA ? line.afterA : line.afterB;
    const oldButton = otherAfter ? directionalEndpointButton(other.noteInformation!) : other.noteInformation!.buttonType;
    const tailButton = directionalEndpointButton(tail.noteInformation!);
    const newButton = front.noteInformation!.buttonType;
    return (tailButton < oldButton ? newButton < oldButton : newButton > oldButton)
      ? this.host.connect(tail, true, front, false, line)
      : ok(undefined);
  }

  setupSyncTailForFront(front: T): SimulatorResult<T | null> {
    const information = front.noteInformation!;
    const candidateIndex = this.host.pendingTails.findIndex((tail) =>
      tail.noteInformation !== null &&
      directionalEndpointPosition(tail.noteInformation) === information.absolutePos &&
      !this.isSameFrontTailDirectionalGroup(tail, front));
    const candidate = this.host.pendingTails[candidateIndex] ?? null;
    if (candidate !== null) {
      const connected = this.host.connect(candidate, true, front, false,
        this.host.lineFor(candidate, true) ?? this.host.lineFor(front, false));
      if (connected.status !== "ok") return connected;
      this.host.pendingTails.splice(candidateIndex, 1);
    }
    if (this.host.hasTail(front)) {
      if (!this.host.pendingTails.includes(front)) this.host.pendingTails.push(front);
      if (!this.host.pendingDirectionalTails.includes(front)) this.host.pendingDirectionalTails.push(front);
    }
    return ok(candidate);
  }

  connectPendingSyncTails(): SimulatorResult<void> {
    for (let i = this.host.pendingTails.length - 1; i >= 0; i -= 1) {
      const information = this.host.pendingTails[i]!.noteInformation;
      if (information === null || this.host.position() > directionalEndpointPosition(information)) {
        this.host.pendingTails.splice(i, 1);
      }
    }
    for (let i = 0; i < this.host.pendingTails.length - 1; i += 1) {
      const first = this.host.pendingTails[i]!;
      for (let j = 1; j < this.host.pendingTails.length; j += 1) {
        const second = this.host.pendingTails[j]!;
        if (first === second || directionalEndpointPosition(first.noteInformation!) !==
          directionalEndpointPosition(second.noteInformation!)) continue;
        const connected = this.host.connect(second, true, first, true);
        if (connected.status !== "ok") return connected;
        const multiple = [AfterNoteType.MultipleDirectionalFlickLeft, AfterNoteType.MultipleDirectionalFlickRight,
          AfterNoteType.SlideMultipleDirectionalFlickLeft, AfterNoteType.SlideMultipleDirectionalFlickRight] as readonly number[];
        if (!multiple.includes(first.noteInformation!.afterNoteType) && !multiple.includes(second.noteInformation!.afterNoteType)) {
          this.host.pendingTails.splice(this.host.pendingTails.indexOf(first), 1);
          this.host.pendingTails.splice(this.host.pendingTails.indexOf(second), 1);
        }
        return ok(undefined);
      }
    }
    return ok(undefined);
  }

  connectOrdinarySyncLines(activatedNotes: readonly T[]): SimulatorResult<void> {
    let previous: T | null = null;
    let matchedTail: T | null = null;
    for (const current of activatedNotes) {
      const information = current.noteInformation;
      if (information === null) {
        return integrityFailure("render.note.sync-line-target-information-unavailable",
          ["RPR-D06", "RPR-D13", "PR16", "PR39"], "Sync-line connection requires committed NoteInformation.");
      }
      if (information.isInvisible) continue;
      if (previous !== null) {
        const previousInformation = previous.noteInformation!;
        const sameMultiple = information.fireNoteType === FrontNoteType.MultipleDirectionalFlick &&
          previousInformation.fireNoteType === FrontNoteType.MultipleDirectionalFlick &&
          information.gameNoteType === previousInformation.gameNoteType &&
          Math.abs(information.buttonType - previousInformation.buttonType) === 1;
        if (!sameMultiple && !isSameDirectionalGroup(previousInformation, information)) {
          const line = this.host.lineFor(previous, false);
          if (line === null) {
            const connected = this.host.connect(current, false, previous, false);
            if (connected.status !== "ok") return connected;
          } else {
            const otherIsA = line.targetB === previous && !line.afterB;
            const other = otherIsA ? line.targetA : line.targetB;
            if ((otherIsA ? line.afterA : line.afterB) && !isSameDirectionalGroup(other.noteInformation!, information)) {
              const connected = this.reconnectSyncTail(other, current);
              if (connected.status !== "ok") return connected;
            }
          }
        }
      }
      previous = current;
      if (matchedTail !== null && this.host.lineFor(matchedTail, true) !== null) {
        if (!this.isSameFrontTailDirectionalGroup(matchedTail, current)) {
          const connected = this.reconnectSyncTail(matchedTail, current);
          if (connected.status !== "ok") return connected;
        }
      } else {
        const connected = this.setupSyncTailForFront(current);
        if (connected.status !== "ok") return connected;
        matchedTail = connected.value;
      }
    }
    return this.connectPendingSyncTails();
  }

}
