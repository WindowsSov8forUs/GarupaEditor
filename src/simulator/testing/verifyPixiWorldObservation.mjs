import assert from "node:assert/strict";

const REQUIRED_FIELDS = [
  "parent", "localMatrix", "worldMatrix", "localBounds", "worldBounds", "anchor", "size",
  "visible", "renderable", "alpha", "tint", "blend", "order", "mask", "texture", "geometry",
];

export function verifyPixiWorldObservation(world) {
  assert.equal(world?.schemaVersion, 1);
  assert.equal(world?.kind, "testing-pixi-world-observer");
  assert.ok(Array.isArray(world.records) && world.records.length > 0);
  const paths = new Set(world.records.map((record) => record.path));
  assert.equal(paths.size, world.records.length, "world observer paths are unique");
  let rootCount = 0;
  for (const record of world.records) {
    assert.equal(typeof record.path, "string");
    assert.equal(typeof record.label, "string");
    for (const field of REQUIRED_FIELDS) assert.ok(Object.hasOwn(record, field), `${record.path} missing ${field}`);
    finiteTuple(record.localMatrix, 6, `${record.path} local matrix`);
    finiteTuple(record.worldMatrix, 6, `${record.path} world matrix`);
    nullableFiniteTuple(record.localBounds, 4, `${record.path} local bounds`);
    nullableFiniteTuple(record.worldBounds, 4, `${record.path} world bounds`);
    nullableFiniteTuple(record.anchor, 2, `${record.path} anchor`);
    finiteTuple(record.size, 2, `${record.path} size`);
    finiteTuple(record.order, 2, `${record.path} order`);
    assert.equal(typeof record.visible, "boolean");
    assert.equal(typeof record.renderable, "boolean");
    assert.ok(Number.isFinite(record.alpha));
    assert.ok(record.tint === null || Number.isFinite(record.tint));
    assert.equal(typeof record.blend, "string");
    if (record.parent === null) rootCount += 1;
    else assert.ok(paths.has(record.parent), `${record.path} parent path exists`);
    if (record.mask !== null) {
      assert.equal(typeof record.mask, "string");
      assert.ok(world.records.some((candidate) => candidate.label === record.mask), `${record.path} mask owner exists`);
    }
    if (record.texture !== null) {
      assert.equal(typeof record.texture.label, "string");
      assert.equal(typeof record.texture.sourceLabel, "string");
      assert.equal(typeof record.texture.alphaMode, "string");
      finiteTuple(record.texture.frame, 4, `${record.path} texture frame`);
    }
    if (record.geometry !== null) {
      assert.ok(Number.isSafeInteger(record.geometry.vertexCount) && record.geometry.vertexCount >= 0);
      assert.ok(Number.isSafeInteger(record.geometry.indexCount) && record.geometry.indexCount >= 0);
      nullableFiniteTuple(record.geometry.positionBounds, 4, `${record.path} geometry bounds`);
    }
    for (const forbidden of ["status", "closed", "passed", "productionAuthorization", "expected"]) {
      assert.equal(Object.hasOwn(record, forbidden), false, `${record.path} contains decision field ${forbidden}`);
    }
  }
  assert.equal(rootCount, 1, "world observation has one scene root");
  return world;
}

export function verifyOrdinaryPixiWorldObservation(world, fixture) {
  verifyPixiWorldObservation(world);
  assert.deepEqual(fixture.independentObserverRequiredFields, REQUIRED_FIELDS);
  const root = one(world, "GarupaSimulatorRoot");
  assert.equal(root.parent, null);
  const note = one(world, "note:world");
  assert.equal(note.parent, root.path);
  assert.deepEqual(note.worldMatrix.slice(4), [fixture.viewport[0] / 2, fixture.viewport[1] / 2]);
  assert.ok(note.localBounds === null && note.worldBounds !== null,
    "semantic Note owner aggregates descendant world bounds without inventing local drawable bounds");
  assert.ok(intersectsViewport(note.worldBounds, fixture.viewport));
  const noteSprite = world.records.find((record) =>
    record.path.startsWith(`${note.path}/`) && record.texture?.label.includes("note_normal_1"));
  assert.ok(noteSprite !== undefined, "Note owner has the exact bound Sprite descendant");

  const combo = one(world, "hud:combo");
  closeTuple(combo.worldMatrix.slice(4), fixture.selectedUiWorld.combo.pixiWorld, 1e-4, "Combo world position");
  assert.ok(combo.worldBounds !== null && intersectsViewport(combo.worldBounds, fixture.viewport));
  const result = one(world, "hud:result");
  assert.deepEqual(result.worldMatrix.slice(4), fixture.selectedUiWorld.result.pixiWorld);
  const timing = one(world, "result-timing");
  assert.ok(timing.parent !== root.path && timing.parent !== null, "JudgeTiming retains a descendant parent");
  const resultScale = fixture.hudCorrections.result.gameJudgeSamples.find((sample) => sample.time === 0.04).values[0];
  const timingExpected = [
    fixture.selectedUiWorld.result.pixiWorld[0] + fixture.hudCorrections.result.timingLocalPosition[0] * resultScale,
    fixture.selectedUiWorld.result.pixiWorld[1] - fixture.hudCorrections.result.timingLocalPosition[1] * resultScale,
  ];
  closeTuple(timing.worldMatrix.slice(4), timingExpected, 1e-4, "animated JudgeTiming world position");

  const score = one(world, "hud:score");
  assert.deepEqual(score.worldMatrix.slice(4), fixture.selectedUiWorld.score.pixiWorld);
  const life = one(world, "hud:life");
  assert.deepEqual(life.worldMatrix.slice(4), fixture.selectedUiWorld.life.pixiWorld);
  const consumer = world.records.find((record) =>
    record.path.startsWith(`${score.path}/`) && record.label === "score-high-rank-animation-layer" &&
    record.mask === "score-high-rank-panel-mask");
  assert.ok(consumer !== undefined, "Score high-rank consumer has its explicit mask relation");
  const mask = world.records.find((record) =>
    record.parent === consumer.parent && record.label === "score-high-rank-panel-mask");
  assert.ok(mask !== undefined, "Score high-rank mask shares the consumer parent coordinate space");
  assert.ok(mask.worldBounds !== null && consumer.worldBounds !== null);
  assert.ok(boundsOverlap(mask.worldBounds, consumer.worldBounds), "Score mask and consumer share an intersecting world space");
  return world;
}

export function verifyNoFallbackObservation(raw) {
  assert.deepEqual(raw.decoder, {
    kind: "synthetic-texture-source-routing-adapter",
    browserDecodeExecuted: false,
    rasterObserved: false,
  });
  assert.equal(Object.hasOwn(raw.decoder, "fallbackUsed"), false);
}

function one(world, label) {
  const rows = world.records.filter((record) => record.label === label);
  assert.equal(rows.length, 1, `exactly one world observation for ${label}`);
  return rows[0];
}

function finiteTuple(value, length, label) {
  assert.ok(Array.isArray(value) && value.length === length && value.every(Number.isFinite), label);
}

function nullableFiniteTuple(value, length, label) {
  assert.ok(value === null || Array.isArray(value) && value.length === length && value.every(Number.isFinite), label);
}

function intersectsViewport(bounds, viewport) {
  return bounds[0] + bounds[2] > 0 && bounds[0] < viewport[0] &&
    bounds[1] + bounds[3] > 0 && bounds[1] < viewport[1];
}

function boundsOverlap(left, right) {
  return left[0] + left[2] > right[0] && right[0] + right[2] > left[0] &&
    left[1] + left[3] > right[1] && right[1] + right[3] > left[1];
}

function closeTuple(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, label);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance, `${label}[${index}]`));
}
