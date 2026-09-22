import { authoredEndpointPosition } from "../chart/noteGraph";
import { AfterNoteType, FrontNoteType, GameNoteType } from "../chart/types";
import { directionalMembersAdjacent, frontEndpointLane, directionalEndpointLane, directionalEndpointPosition, isSameDirectionalGroup, type DirectionalGraphSource } from "../chart/noteGraph";
import { integrityFailure, ok, type SimulatorResult } from "../result";

export interface SyncConnection<T, E extends boolean | number = boolean> {
  readonly targetA: T; readonly targetB: T;
  readonly afterA: E; readonly afterB: E;
}

export function selectDirectionalSyncEndpoints<E extends { readonly after: boolean | number }>(
  a: { readonly left: E; readonly right: E }, b: { readonly left: E; readonly right: E },
  buttonA: number, buttonB: number,
): readonly [E, E] {
  const selectedA = buttonA > buttonB ? a.left : a.right;
  const selectedB = buttonA > buttonB ? b.right : b.left;
  return b.right.after ? [selectedB, selectedA] : [selectedA, selectedB];
}

/** Recovered connection decisions, independent of render storage and coordinate domain. */
export class SyncLineConnectionRules<T extends { readonly noteInformation: DirectionalGraphSource | null }, L extends SyncConnection<T, E>, E extends boolean | number = boolean> {
  constructor(private readonly host: {
    readonly pendingTails: T[];
    readonly pendingDirectionalTails: T[];
    position(): number;
    hasTail(note: T): boolean;
    lineFor(note: T, after: E | boolean): L | null;
    connect(a: T, afterA: E | boolean, b: T, afterB: E | boolean, existing?: L | null): SimulatorResult<void>;
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
    if (source.directionalMemberRootIndex !== undefined || target.directionalMemberRootIndex !== undefined) {
      if (source.directionalMemberRootIndex !== target.directionalMemberRootIndex) return false;
      if (maxRange === 2) return matches;
    }
    const difference = source.directionalMemberRootIndex === undefined
      ? directionalEndpointLane(source) - frontEndpointLane(target)
      : source.directionalMemberOffset! - target.directionalMemberOffset!;
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
    const oldButton = otherAfter ? directionalEndpointLane(other.noteInformation!) : frontEndpointLane(other.noteInformation!);
    const tailButton = directionalEndpointLane(tail.noteInformation!);
    const newButton = frontEndpointLane(front.noteInformation!);
    return (tailButton < oldButton ? newButton < oldButton : newButton > oldButton)
      ? this.host.connect(tail, true, front, false, line)
      : ok(undefined);
  }

  setupSyncTailForFront(front: T): SimulatorResult<T | null> {
    const information = front.noteInformation!;
    const candidateIndex = this.host.pendingTails.findIndex((tail) =>
      tail.noteInformation !== null &&
      authoredEndpointPosition(tail.noteInformation, true) === authoredEndpointPosition(information) &&
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
        if (first === second || authoredEndpointPosition(first.noteInformation!, true) !==
          authoredEndpointPosition(second.noteInformation!, true)) continue;
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
        return integrityFailure("render.note.sync-line-target-information-unavailable", "Sync-line connection requires committed NoteInformation.");
      }
      if (information.isInvisible) continue;
      if (previous !== null) {
        const previousInformation = previous.noteInformation!;
        const sameMultiple = information.fireNoteType === FrontNoteType.MultipleDirectionalFlick &&
          previousInformation.fireNoteType === FrontNoteType.MultipleDirectionalFlick &&
          information.gameNoteType === previousInformation.gameNoteType &&
          directionalMembersAdjacent(information, previousInformation);
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
