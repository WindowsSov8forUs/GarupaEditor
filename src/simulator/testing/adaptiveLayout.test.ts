declare function require(name: string): any;
const assert = require("node:assert/strict");
import {
  copyAndValidateInitialSimulatorSurface,
  validateUnchangedSimulatorSurface,
  type SimulatorSurfaceState,
} from "../platform/surfaceContracts";
import {
  createOriginalSurfaceLayout,
  originalBottomLeftScreenToWorld,
  originalWorldToBottomLeftScreen,
} from "../scene/originalSurfaceLayout";
import {
  createRehearsalControlSceneLayout,
  resolveRehearsalControlTouch,
} from "../scene/rehearsalControlScene";
import { REHEARSAL_MANUAL_MODE } from "./modeFixtures";

function surface(
  revision: number,
  width: number,
  height: number,
  safeArea = { x: 0, y: 0, width, height },
): SimulatorSurfaceState {
  return Object.freeze({
    revision,
    viewportWidth: width,
    viewportHeight: height,
    safeArea: Object.freeze({
      x: Math.fround(safeArea.x),
      y: Math.fround(safeArea.y),
      width: Math.fround(safeArea.width),
      height: Math.fround(safeArea.height),
    }),
    origin: "bottom-left" as const,
  });
}

const cases = [
  ["4:3", surface(7, 1200, 900), [0, 0, 1200, 900], 1, 64.76761627197266, 54],
  ["16:9", surface(7, 1600, 900), [0, 0, 1600, 900], 1, 86.35681915283203, 54],
  ["20:9", surface(7, 1600, 720), [80, 0, 1440, 720], 0.7203599810600281, 142.20799255371094, 43.20000076293945],
  ["21:9", surface(7, 1680, 720), [84, 0, 1512, 720], 0.6860570907592773, 146.20799255371094, 43.20000076293945],
  ["32:9", surface(7, 2560, 720), [128, 0, 2304, 720], 0.45022502541542053, 190.2080078125, 43.20000076293945],
] as const;

for (const [name, input, expectedSafe, expectedRatio, expectedX, expectedRadius] of cases) {
  const checked = copyAndValidateInitialSimulatorSurface(input);
  assert.equal(checked.status, "ok", `${name}: surface`);
  const layout = createOriginalSurfaceLayout(input, Math.fround(100));
  assert.equal(layout.status, "ok", `${name}: layout`);
  if (layout.status !== "ok") continue;
  assert.deepEqual(
    [layout.value.starUi.safeArea.x, layout.value.starUi.safeArea.y,
      layout.value.starUi.safeArea.width, layout.value.starUi.safeArea.height],
    [...expectedSafe],
    `${name}: safe`,
  );
  assert.equal(layout.value.starUi.screenToSafeAreaRatio, expectedRatio, `${name}: safe ratio`);
  assert.equal(layout.value.ui.moveTime.returnCenterBottomLeft[0], expectedX, `${name}: move center`);
  assert.equal(layout.value.ui.moveTime.hitCircleRadiusPixels, expectedRadius, `${name}: hit radius`);
  assert.equal(layout.value.camera.pixelsPerWorldUnit, Math.fround(input.viewportHeight / 2), `${name}: ppu`);
  assert.equal(layout.value.camera.halfWidthWorld, Math.fround(input.viewportWidth / input.viewportHeight), `${name}: half width`);
  const screen = originalWorldToBottomLeftScreen(layout.value, Math.fround(0.25), Math.fround(-0.5));
  assert.equal(screen.status, "ok", `${name}: project`);
  if (screen.status !== "ok") continue;
  const world = originalBottomLeftScreenToWorld(layout.value, screen.value[0], screen.value[1]);
  assert.equal(world.status, "ok", `${name}: inverse`);
  if (world.status === "ok") {
    assert.equal(world.value[0], Math.fround(0.25), `${name}: x roundtrip`);
    assert.equal(world.value[1], Math.fround(-0.5), `${name}: y roundtrip`);
  }
}

const reference = createOriginalSurfaceLayout(surface(0, 1600, 720), Math.fround(100));
assert.equal(reference.status, "ok");
if (reference.status === "ok") {
  const controls = createRehearsalControlSceneLayout(reference.value);
  assert.deepEqual(controls.returnFive.centerBottomLeft, [142.20799255371094, 360]);
  assert.deepEqual(controls.demoBadgeBoundsTopLeft, {
    x: 103.32799530029297,
    y: 99.3599853515625,
    width: 177.98399353027344,
    height: 32.83199691772461,
  });
  const state = Object.freeze({ timelineSeconds: 8, paused: false, moveTimeInProgress: false });
  assert.equal(resolveRehearsalControlTouch(
    REHEARSAL_MANUAL_MODE,
    "began",
    { x: controls.returnFive.centerBottomLeft[0], y: controls.returnFive.centerBottomLeft[1] },
    state,
    controls,
  ).status, "ok");
  const outsideOldSquare = resolveRehearsalControlTouch(
    REHEARSAL_MANUAL_MODE,
    "began",
    { x: controls.returnFive.centerBottomLeft[0] + 40, y: controls.returnFive.centerBottomLeft[1] + 40 },
    state,
    controls,
  );
  assert.equal(outsideOldSquare.status, "ok");
  if (outsideOldSquare.status === "ok") assert.equal(outsideOldSquare.value, null);
}

const asymmetric = createOriginalSurfaceLayout(
  surface(0, 1600, 720, { x: 31, y: 12, width: 1517, height: 690 }),
  Math.fround(100),
);
assert.equal(asymmetric.status, "ok");
if (asymmetric.status === "ok") {
  assert.deepEqual(asymmetric.value.starUi.safeArea, { x: 52, y: 18, width: 1496, height: 684 });
}

for (const invalid of [
  surface(0, 719, 720),
  surface(0, 0, 0),
  surface(0, 1600, 720, { x: 0, y: 0, width: 1601, height: 720 }),
  { ...surface(0, 1600, 720), safeArea: { x: 0.1, y: 0, width: 1600, height: 720 } },
]) {
  assert.equal(copyAndValidateInitialSimulatorSurface(invalid).status, "evidence-required");
}

const initial = surface(4, 1600, 720);
assert.equal(validateUnchangedSimulatorSurface(initial, initial).status, "ok");
assert.equal(validateUnchangedSimulatorSurface(initial, surface(5, 1600, 720)).status, "evidence-required");
assert.equal(validateUnchangedSimulatorSurface(initial, surface(4, 1920, 1080)).status, "evidence-required");

console.log("adaptive layout tests passed");
