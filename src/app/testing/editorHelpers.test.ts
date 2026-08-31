declare const require: (id: string) => any;
const assert = require("node:assert/strict");

import {
  isLastBeatOrderedBpmNegative,
  normalizeBaseBpmForWrite,
  normalizeEventBpmForWrite,
} from "../editorHelpers";

function main(): void {
  assert.equal(normalizeBaseBpmForWrite(120, 120), 120);
  assert.equal(normalizeBaseBpmForWrite(0, 120), null);
  assert.equal(normalizeBaseBpmForWrite(-180, 120), null);

  assert.equal(normalizeEventBpmForWrite(180, 120), 180);
  assert.equal(normalizeEventBpmForWrite(0, 120), null);
  assert.equal(normalizeEventBpmForWrite(0.0000004, 120), null);

  assert.equal(isLastBeatOrderedBpmNegative(120, [
    { beat: 8, bpm: -180 },
    { beat: 8, bpm: 180 },
  ]), false);
  assert.equal(isLastBeatOrderedBpmNegative(120, [
    { beat: 8, bpm: 180 },
    { beat: 8, bpm: -180 },
  ]), true);

  console.log("editor helper tests passed: BPM write guards and beat-ordered tail selection");
}

main();
