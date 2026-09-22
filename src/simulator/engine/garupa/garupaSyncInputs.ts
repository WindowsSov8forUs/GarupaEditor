import { authoredEndpointPosition } from "../chart/noteGraph";
import { FrontNoteType, type NoteBatchInformation, type NoteInformation } from "../chart/types";
import { directionalEndpointPosition, isNonPlayableCommand } from "../chart/noteGraph";
import { SyncLineConnectionRules, type SyncConnection } from "../rendering/syncLineConnectionRules";
import { connectDirectionalMemberBatch, connectionDirection, reconnectDirectionalSyncConnections, slideDirectionalAnchorEndpoint,
  type ConnectionEndpoint, type DirectionalConnection } from "../rendering/directionalConnectionRules";
import { ok, type SimulatorResult } from "../result";

export interface PresentationConnectionOwner { readonly noteInformation: NoteInformation }
export interface PresentationSyncConnection extends SyncConnection<PresentationConnectionOwner, ConnectionEndpoint> { readonly identity: string }
export interface PresentationDirectionalConnection extends DirectionalConnection<PresentationConnectionOwner> { readonly identity: string }
export interface PresentationConnections {
  readonly sync: readonly PresentationSyncConnection[];
  readonly directional: readonly PresentationDirectionalConnection[];
  neighbors(line: PresentationDirectionalConnection): readonly PresentationDirectionalConnection[];
  advance(musicPosition: number, presented: Iterable<NoteInformation>): SimulatorResult<void>;
}

/** Actual batches enter this presentation graph when first needed. The shared
 * rules read the current music clock; no judging owner is activated here. */
export function createPresentationConnections(batches: readonly NoteBatchInformation[], syncEnabled: boolean): PresentationConnections {
  const pendingTails: PresentationConnectionOwner[] = [], pendingDirectionalTails: PresentationConnectionOwner[] = [];
  const sync: PresentationSyncConnection[] = [], directional: PresentationDirectionalConnection[] = [];
  const owners = new Map<number, PresentationConnectionOwner>();
  const batchForSource = new WeakMap<NoteInformation, NoteBatchInformation>();
  const batchOrder = new Map(batches.map((batch, index) => [batch, index] as const));
  for (const batch of batches) for (const source of batch.informationList)
    if (!isNonPlayableCommand(source)) {
      owners.set(source.index, { noteInformation: source });
      batchForSource.set(source, batch);
    }
  let position = 0, sequence = 0;
  const owned = new Map<PresentationConnectionOwner, Map<ConnectionEndpoint, PresentationSyncConnection[]>>();
  const incoming = new Map<PresentationConnectionOwner, Map<ConnectionEndpoint, PresentationSyncConnection[]>>();
  const syncAt = new Map<number, Set<PresentationSyncConnection>>();
  const directionalAt = new Map<number, PresentationDirectionalConnection[]>();
  const lineIndices = new Map<PresentationSyncConnection, number>();
  const endpointLines = (map: typeof owned, note: PresentationConnectionOwner, after: ConnectionEndpoint) => {
    let endpoints = map.get(note);
    if (endpoints === undefined) { endpoints = new Map(); map.set(note, endpoints); }
    let lines = endpoints.get(after);
    if (lines === undefined) { lines = []; endpoints.set(after, lines); }
    return lines;
  };
  const time = (note: PresentationConnectionOwner, after: ConnectionEndpoint) => after
    ? directionalEndpointPosition(note.noteInformation) : note.noteInformation.absolutePos;
  const connect = (targetA: PresentationConnectionOwner, afterA: ConnectionEndpoint,
    targetB: PresentationConnectionOwner, afterB: ConnectionEndpoint, existing?: PresentationSyncConnection | null) => {
    if (!syncEnabled || authoredEndpointPosition(targetA.noteInformation, afterA) !== authoredEndpointPosition(targetB.noteInformation, afterB)) return ok(undefined);
    const line = { identity: existing?.identity ?? `sync:${sequence++}`, targetA, afterA, targetB, afterB };
    const index = existing == null ? sync.length : lineIndices.get(existing)!;
    if (existing != null) {
      for (const lines of [endpointLines(owned, existing.targetA, existing.afterA), endpointLines(incoming, existing.targetB, existing.afterB)])
        lines.splice(lines.indexOf(existing), 1);
      syncAt.get(time(existing.targetA, existing.afterA))!.delete(existing);
      lineIndices.delete(existing);
    }
    sync[index] = line;
    lineIndices.set(line, index);
    endpointLines(owned, targetA, afterA).push(line);
    endpointLines(incoming, targetB, afterB).push(line);
    const at = time(targetA, afterA), lines = syncAt.get(at) ?? new Set();
    lines.add(line); syncAt.set(at, lines);
    return ok(undefined);
  };
  const rules = new SyncLineConnectionRules<PresentationConnectionOwner, PresentationSyncConnection, ConnectionEndpoint>({
    pendingTails, pendingDirectionalTails, position: () => position,
    hasTail: ({ noteInformation: source }) => source.fireNoteType === FrontNoteType.Long ||
      source.slideNoteList.length > 0 && source.slideNoteList[source.slideNoteList.length - 1]!.isInvisible !== true,
    lineFor: (note, after) => {
      const outgoing = endpointLines(owned, note, after), received = endpointLines(incoming, note, after);
      return outgoing[outgoing.length - 1] ?? received[received.length - 1] ?? null;
    },
    connect,
  });
  const incident = new Map<PresentationConnectionOwner, Map<ConnectionEndpoint, PresentationDirectionalConnection[]>>();
  const connectDirectional = (targetA: PresentationConnectionOwner, afterA: ConnectionEndpoint,
    targetB: PresentationConnectionOwner, afterB: ConnectionEndpoint) => {
    const line: PresentationDirectionalConnection = { identity: `directional:${directional.length}`, targetA, afterA, targetB, afterB,
      materialDirection: connectionDirection(targetA, afterA) };
    directional.push(line);
    for (const [note, after] of [[targetA, afterA], [targetB, afterB]] as const) {
      const endpoints = incident.get(note) ?? new Map<ConnectionEndpoint, PresentationDirectionalConnection[]>();
      const lines = endpoints.get(after) ?? [];
      lines.push(line); endpoints.set(after, lines); incident.set(note, endpoints);
    }
    const at = typeof afterA === "number" ? targetA.noteInformation.slideNoteList[afterA - 1]!.absolutePos : time(targetA, afterA);
    const lines = directionalAt.get(at) ?? [];
    lines.push(line); directionalAt.set(at, lines);
    return ok(undefined);
  };
  const available = new Set<PresentationConnectionOwner>();
  const pendingVisuals = new Set<PresentationConnectionOwner>();
  const processed = new Set<NoteBatchInformation>();
  const advance = (musicPosition: number, presented: Iterable<NoteInformation>): SimulatorResult<void> => {
    position = musicPosition;
    const due = new Set<NoteBatchInformation>();
    for (const source of presented) {
      const batch = batchForSource.get(source);
      if (batch !== undefined && !processed.has(batch)) due.add(batch);
    }
    for (const batch of [...due].sort((a, b) => batchOrder.get(a)! - batchOrder.get(b)!)) {
      processed.add(batch);
      const notes = batch.informationList.flatMap(source => owners.has(source.index) ? [owners.get(source.index)!] : []);
      if (notes.length === 0) continue;
      const batchPosition = batch.informationList[0]!.absolutePos;
      for (const note of notes) {
        available.add(note);
        if (note.noteInformation.directionalSlideConnection !== undefined) pendingVisuals.add(note);
      }
      const synced = rules.connectOrdinarySyncLines(notes.filter(note => note.noteInformation.directionalSlideConnection === undefined));
      if (synced.status !== "ok") return synced;
      const connected = connectDirectionalMemberBatch(notes, { pendingTails: pendingDirectionalTails,
        sameTail: (tail, front, range) => rules.isSameFrontTailDirectionalGroup(tail, front, range), connect: connectDirectional });
      if (connected.status !== "ok") return connected;
      for (const visual of pendingVisuals) {
        const binding = visual.noteInformation.directionalSlideConnection;
        if (binding === undefined) continue;
        const root = owners.get(binding.rootIndex)!;
        if (!available.has(root)) continue;
        pendingVisuals.delete(visual);
        const after = slideDirectionalAnchorEndpoint(visual, root);
        if (after === null || directional.some(line => line.targetA === root && line.afterA === after && line.targetB === visual)) continue;
        connectDirectional(root, after, visual, false);
      }
      const reconnected = reconnectDirectionalSyncConnections(batchPosition, [...syncAt.get(batchPosition) ?? []], directionalAt.get(batchPosition) ?? [],
        (a, afterA, b, afterB, line) => connect(a, afterA, b, afterB, line));
      if (reconnected.status !== "ok") return reconnected;
    }
    return ok(undefined);
  };
  return { sync, directional, advance, neighbors: line => [...new Set([
    ...incident.get(line.targetA)!.get(line.afterA)!, ...incident.get(line.targetB)!.get(line.afterB)!,
  ])] };
}
