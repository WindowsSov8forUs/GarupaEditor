declare const require: (id: string) => any;
const assert = require("node:assert/strict");

import type { ChartNote } from "../../chartCore";
import {
  buildSelectionMirrorOffsetMap,
  buildSelectionMoveOffsetMap,
} from "../slideHiddenMoveOffsets";

function makeNote(id: string, type: ChartNote["type"], lane: number, beat: number): ChartNote {
  return { id, type, lane, beat };
}

function main(): void {
  testMirrorSingleVisibleNode();
  testMirrorEndpointInterpolation();
  testMoveSamePositionNextHidden();
  testMoveSamePositionPreviousHidden();
  testMoveChainStartHidden();
  testMoveChainEndHidden();
  testDifferentPositionUsesBeatInterpolation();
  console.log("slide hidden-offset tests passed: mirror interpolation and same-position move ownership");
}

function testMirrorSingleVisibleNode(): void {
  const notes: ChartNote[] = [
    makeNote("h0", "hidden", 0, 0),
    makeNote("v1", "slide", 1, 1),
    makeNote("h2", "hidden", 2, 2),
    makeNote("h3", "hidden", 3, 3),
  ];
  const offsets = buildSelectionMirrorOffsetMap({
    notes,
    slideChains: [{ noteIds: ["h0", "v1", "h2", "h3"] }],
    selectedNoteIds: new Set(["v1"]),
    selectedOffsetById: new Map([["v1", { lane: 10, beat: 0 }]]),
    resolveMirrorLaneDelta: (note) => 100 + note.lane,
  });
  assert.deepEqual(offsets.get("v1"), { lane: 10, beat: 0 });
  assert.deepEqual(offsets.get("h0"), { lane: 100, beat: 0 });
  assert.deepEqual(offsets.get("h2"), { lane: 102, beat: 0 });
  assert.deepEqual(offsets.get("h3"), { lane: 103, beat: 0 });
}

function testMirrorEndpointInterpolation(): void {
  const notes: ChartNote[] = [
    makeNote("v0", "slide", 0, 0),
    makeNote("h1", "hidden", 1, 1),
    makeNote("h2", "hidden", 2, 2),
    makeNote("v3", "slide", 3, 3),
  ];
  const offsets = buildSelectionMirrorOffsetMap({
    notes,
    slideChains: [{ noteIds: ["v0", "h1", "h2", "v3"] }],
    selectedNoteIds: new Set(["v0"]),
    selectedOffsetById: new Map([["v0", { lane: 4, beat: 0 }]]),
    resolveMirrorLaneDelta: () => 999,
  });
  assert.deepEqual(offsets.get("v0"), { lane: 4, beat: 0 });
  assert.deepEqual(offsets.get("h1"), { lane: 2.666667, beat: 0 });
  assert.deepEqual(offsets.get("h2"), { lane: 1.333333, beat: 0 });
}

function testMoveSamePositionNextHidden(): void {
  assertMoveExactFollow(
    [makeNote("v0", "slide", 1, 4), makeNote("h1", "hidden", 1, 4), makeNote("v2", "slide", 3, 8)],
    ["v0", "h1", "v2"], "v0", "h1", 2, 1.5,
  );
}

function testMoveSamePositionPreviousHidden(): void {
  assertMoveExactFollow(
    [makeNote("v0", "slide", 0, 0), makeNote("h1", "hidden", 2, 6), makeNote("v2", "slide", 2, 6)],
    ["v0", "h1", "v2"], "v2", "h1", -1, 0.25,
  );
}

function testMoveChainStartHidden(): void {
  assertMoveExactFollow(
    [makeNote("h0", "hidden", 4, 2), makeNote("v1", "slide", 4, 2)],
    ["h0", "v1"], "v1", "h0", 1, 3,
  );
}

function testMoveChainEndHidden(): void {
  assertMoveExactFollow(
    [makeNote("v0", "slide", 5, 7), makeNote("h1", "hidden", 5, 7)],
    ["v0", "h1"], "v0", "h1", -2, 1,
  );
}

function assertMoveExactFollow(
  notes: ChartNote[],
  noteIds: string[],
  selectedId: string,
  hiddenId: string,
  laneDelta: number,
  beatDelta: number,
): void {
  const offsets = buildSelectionMoveOffsetMap({
    notes,
    slideChains: [{ noteIds }],
    selectedNoteIds: new Set([selectedId]),
    laneDelta,
    beatDelta,
  });
  assert.deepEqual(offsets.get(selectedId), { lane: laneDelta, beat: beatDelta });
  assert.deepEqual(offsets.get(hiddenId), { lane: laneDelta, beat: beatDelta });
}

function testDifferentPositionUsesBeatInterpolation(): void {
  const notes: ChartNote[] = [
    makeNote("v0", "slide", 0, 0),
    makeNote("h1", "hidden", 1, 0),
    makeNote("v2", "slide", 2, 2),
  ];
  const offsets = buildSelectionMoveOffsetMap({
    notes,
    slideChains: [{ noteIds: ["v0", "h1", "v2"] }],
    selectedNoteIds: new Set(["v0"]),
    laneDelta: 4,
    beatDelta: 2,
  });
  assert.deepEqual(offsets.get("v0"), { lane: 4, beat: 2 });
  // The hidden node is not captured by the same-position shortcut, but its equal
  // beat still gives ratio 0 in the existing beat interpolation contract.
  assert.deepEqual(offsets.get("h1"), { lane: 4, beat: 2 });
}

main();
