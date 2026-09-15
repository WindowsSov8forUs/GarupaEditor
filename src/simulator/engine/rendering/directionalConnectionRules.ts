import { AfterNoteType, FrontNoteType, GameNoteType, type NoteInformation } from "../chart/types";
import { noteMotionCoordinates } from "./ordinaryNoteGeometry";
import { directionalEndpointLane, directionalEndpointPosition, directionalMembersAdjacent, frontEndpointLane, isSameDirectionalGroup } from "../chart/noteGraph";
import { ok, type SimulatorResult } from "../result";
import type { OrdinaryNoteMotionResult } from "./ordinaryNoteGeometry";
import type { SyncConnection } from "./syncLineConnectionRules";
import { selectDirectionalSyncEndpoints } from "./syncLineConnectionRules";
import { createRenderFloat32 } from "../../backends/renderingValidation";

export type ConnectionEndpoint = boolean | number;
export interface ConnectionNote { readonly noteInformation: NoteInformation | null }
export type DirectionalConnection<T> = SyncConnection<T, ConnectionEndpoint> & { readonly materialDirection: "left" | "right" };

export function connectionSource(note: ConnectionNote, after: ConnectionEndpoint): NoteInformation {
  const source = note.noteInformation!;
  return typeof after === "number" ? source.slideNoteList[after - 1]!
    : after ? source.slideNoteList[source.slideNoteList.length - 1] ?? source : source;
}
export function connectionLane(note: ConnectionNote, after: ConnectionEndpoint): number {
  return typeof after === "number" ? frontEndpointLane(connectionSource(note, after))
    : after ? directionalEndpointLane(note.noteInformation!) : frontEndpointLane(note.noteInformation!);
}
export function isDirectionalVisual(note: ConnectionNote): boolean {
  const type = note.noteInformation?.fireNoteType;
  return type === FrontNoteType.LongMultipleDirectionalFlickAdd || type === FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
    type === FrontNoteType.SlideBMultipleDirectionalFlickAdd;
}
export function connectionDirection(note: ConnectionNote, after: ConnectionEndpoint): "left" | "right" {
  const source = connectionSource(note, after);
  const gameType = source?.slideGesture?.direction != null
    ? source.slideGesture.direction === "Left" ? 10 : 11 : source?.gameNoteType;
  const left = gameType === undefined
    ? note.noteInformation!.afterNoteType === AfterNoteType.MultipleDirectionalFlickLeft ||
      note.noteInformation!.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft
    : [10, 14, 16, 18, 20, 22].includes(gameType);
  return left ? "left" : "right";
}

/** Same batch adjacency and tail attachment for active and early presentation owners. */
export function connectDirectionalMemberBatch<T extends ConnectionNote>(notes: readonly T[], host: {
  pendingTails: T[];
  sameTail(tail: T, front: T, maxRange: number): boolean;
  connect(a: T, afterA: ConnectionEndpoint, b: T, afterB: ConnectionEndpoint): SimulatorResult<void>;
}): SimulatorResult<void> {
  let previous: T | null = null;
  for (const current of notes) {
    const information = current.noteInformation!;
    if (information.isInvisible) continue;
    if (information.directionalSlideConnection === undefined && information.gameNoteType >= GameNoteType.LongDirectionalFlickLeftAdd &&
        information.gameNoteType <= GameNoteType.SlideBDirectionalFlickRightAdd) {
      const index = host.pendingTails.findIndex(tail => tail.noteInformation !== null &&
        directionalEndpointPosition(tail.noteInformation) === information.absolutePos && host.sameTail(tail, current, 1));
      const tail = host.pendingTails[index];
      if (tail !== undefined) {
        const connected = host.connect(tail, true, current, false);
        if (connected.status !== "ok") return connected;
        host.pendingTails.splice(index, 1);
      }
    }
    if (previous !== null) {
      const before = previous.noteInformation!;
      const frontGroup = before.fireNoteType === FrontNoteType.MultipleDirectionalFlick &&
        information.fireNoteType === FrontNoteType.MultipleDirectionalFlick && before.gameNoteType === information.gameNoteType &&
        directionalMembersAdjacent(before, information);
      const addLong = before.fireNoteType === FrontNoteType.LongMultipleDirectionalFlickAdd &&
        information.fireNoteType === FrontNoteType.LongMultipleDirectionalFlickAdd;
      const addSlide = (before.fireNoteType === FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
        before.fireNoteType === FrontNoteType.SlideBMultipleDirectionalFlickAdd) &&
        (information.fireNoteType === FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
          information.fireNoteType === FrontNoteType.SlideBMultipleDirectionalFlickAdd);
      if (frontGroup || ((addLong || addSlide) && isSameDirectionalGroup(before, information))) {
        const connected = host.connect(current, false, previous, false);
        if (connected.status !== "ok") return connected;
      }
    }
    previous = current;
  }
  return ok(undefined);
}

export function slideDirectionalAnchorEndpoint(visual: ConnectionNote, root: ConnectionNote): ConnectionEndpoint | null {
  const binding = visual.noteInformation?.directionalSlideConnection;
  if (binding === undefined) return null;
  const after = binding.connectionIndex || false;
  const gesture = connectionSource(root, after).slideGesture!;
  const anchor = gesture.direction === "Left" ? gesture.width - 1 : 0;
  return Math.abs(binding.memberOffset - anchor) === 1 ? after : null;
}

export function directionalConnectionEndpoints<T extends ConnectionNote>(note: T, after: ConnectionEndpoint,
  lines: readonly (SyncConnection<T, ConnectionEndpoint> | null)[]): Array<{ note: T; after: ConnectionEndpoint }> {
  const start = { note, after };
  // Front MultipleDirectional inherits the base self endpoint.
  if (!after && !isDirectionalVisual(note)) return [start];
  const endpoints = [start];
  for (let i = 0; i < endpoints.length; i += 1) {
    const endpoint = endpoints[i]!;
    for (const line of lines) {
      if (line === null) continue;
      const other = line.targetA === endpoint.note && line.afterA === endpoint.after ? { note: line.targetB, after: line.afterB }
        : line.targetB === endpoint.note && line.afterB === endpoint.after ? { note: line.targetA, after: line.afterA } : null;
      if (other !== null && !endpoints.some(item => item.note === other.note && item.after === other.after)) endpoints.push(other);
    }
  }
  return endpoints;
}
export function reconnectDirectionalSyncConnections<T extends ConnectionNote, L extends SyncConnection<T, ConnectionEndpoint>>(
  position: number, sync: readonly (L | null)[], directional: readonly (SyncConnection<T, ConnectionEndpoint> | null)[],
  connect: (a: T, afterA: ConnectionEndpoint, b: T, afterB: ConnectionEndpoint, existing: L) => SimulatorResult<void>,
): SimulatorResult<void> {
  const extremes = (note: T, after: ConnectionEndpoint) => {
    let left = { note, after }, right = left;
    for (const endpoint of directionalConnectionEndpoints(note, after, directional)) {
      if (connectionLane(endpoint.note, endpoint.after) < connectionLane(left.note, left.after)) left = endpoint;
      if (connectionLane(endpoint.note, endpoint.after) > connectionLane(right.note, right.after)) right = endpoint;
    }
    return { left, right };
  };
  for (const line of sync) {
    if (line === null) continue;
    const information = line.targetA.noteInformation!;
    if ((line.afterA ? directionalEndpointPosition(information) : information.absolutePos) !== position) continue;
    const [a, b] = selectDirectionalSyncEndpoints(extremes(line.targetA, line.afterA), extremes(line.targetB, line.afterB),
      connectionLane(line.targetA, line.afterA), connectionLane(line.targetB, line.afterB));
    const connected = connect(a.note, a.after, b.note, b.after, line);
    if (connected.status !== "ok") return connected;
  }
  return ok(undefined);
}

export function directionalConnectionPresentation<T extends ConnectionNote>(line: DirectionalConnection<T>,
  lines: readonly (DirectionalConnection<T> | null)[], targetA: OrdinaryNoteMotionResult, targetB: OrdinaryNoteMotionResult,
): SimulatorResult<{ readonly motion: OrdinaryNoteMotionResult; readonly iconA: boolean; readonly iconB: boolean }> {
  const toRight = connectionLane(line.targetA, line.afterA) > connectionLane(line.targetB, line.afterB);
  const z = createRenderFloat32(Math.fround(targetB.position.z.value +
    (toRight === (line.materialDirection === "left") ? 0.00001 : -0.00001)));
  if (z.status !== "ok") return z;
  const raw = targetA.unclipped ?? targetB.unclipped;
  const a = raw ? noteMotionCoordinates(targetA) : undefined, b = raw ? noteMotionCoordinates(targetB) : undefined;
  const motion = { ...targetA, position: { x: targetB.position.x, y: targetB.position.y, z: z.value },
    unclipped: raw === undefined ? undefined : { ...raw,
      x: targetB.unclipped?.x ?? targetB.position.x.value, y: targetB.unclipped?.y ?? targetB.position.y.value,
      scale: targetA.unclipped?.scale ?? targetA.localScale.x.value,
      exponential: { x: b!.x, y: b!.y, scaleX: a!.scaleX, scaleY: a!.scaleY } } };
  const iconVisible = (note: T, after: ConnectionEndpoint) => !lines.some(edge => {
    if (edge === null) return false;
    const other = edge.targetA === note && edge.afterA === after ? { note: edge.targetB, after: edge.afterB }
      : edge.targetB === note && edge.afterB === after ? { note: edge.targetA, after: edge.afterA } : null;
    if (other === null || (!after && isDirectionalVisual(note) && other.after)) return false;
    const difference = connectionLane(other.note, other.after) - connectionLane(note, after);
    return line.materialDirection === "left" ? difference < 0 : difference > 0;
  });
  return ok({ motion, iconA: iconVisible(line.targetA, line.afterA), iconB: iconVisible(line.targetB, line.afterB) });
}
