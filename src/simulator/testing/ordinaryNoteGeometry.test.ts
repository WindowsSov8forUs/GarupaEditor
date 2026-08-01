import type { RenderColor, RenderFloat32, RenderVector2, RenderVector3 } from "../backends/renderingContracts";
import { createRenderFloat32 } from "../backends/renderingValidation";
import type { SimulatorResult } from "../engine/evidence";
import {
  buildOrdinaryBaseNoteMesh,
  buildOrdinarySyncLine,
  type OrdinaryBaseNoteMeshOwnerState,
  type OrdinarySyncLineTargetState,
} from "../engine/rendering/ordinaryNoteGeometry";

function equal<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`);
}
function requireOk<T>(result: SimulatorResult<T>, message: string): T {
  if (result.status !== "ok") throw new Error(`${message}: ${result.capability}`);
  return result.value;
}
function f32(value: number): RenderFloat32 {
  return requireOk(createRenderFloat32(Math.fround(value)), "create Float32");
}
function vector2(x: number, y: number): RenderVector2 {
  return Object.freeze({ x: f32(x), y: f32(y) });
}
function vector3(x: number, y: number, z: number): RenderVector3 {
  return Object.freeze({ ...vector2(x, y), z: f32(z) });
}
function color(red: number, green: number, blue: number, alpha: number): RenderColor {
  return Object.freeze({ red: f32(red), green: f32(green), blue: f32(blue), alpha: f32(alpha) });
}
function floatBytes(value: RenderFloat32): string {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0, value.value, true);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function target(
  x: number,
  y: number,
  z: number,
  lossyScaleX: number,
  localScaleX: number,
  gameNoteType: number,
): OrdinarySyncLineTargetState {
  return Object.freeze({
    position: vector3(x, y, z),
    lossyScaleX: f32(lossyScaleX),
    localScaleX: f32(localScaleX),
    gameNoteType,
  });
}

const meshState: OrdinaryBaseNoteMeshOwnerState = Object.freeze({
  front: Object.freeze({ position: vector2(-1, 0.5), localScaleX: f32(0.25), buttonCount: 1 }),
  after: Object.freeze({ position: vector2(1, 2.5), localScaleX: f32(0.5), buttonCount: 2 }),
  screenToSafeAreaRatio: f32(0.9),
  widthRate: f32(0.8),
  color: color(0.9, 0.8, 0.7, 0.6),
});

const expectedVertexBytes = [
  "3D0A97BF", "0000003F", "00000000", "85EB51BF", "0000003F", "00000000",
  "1C5A84BF", "3333333F", "00000000", "60E510BF", "3333333F", "00000000",
  "F75363BF", "6666663F", "00000000", "77BE9FBE", "6666663F", "00000000",
  "B6F33DBF", "CDCC8C3F", "00000000", "60916DBD", "CDCC8C3F", "00000000",
  "759318BF", "6666A63F", "00000000", "3AB4483E", "6666A63F", "00000000",
  "6566E6BE", "0000C03F", "00000000", "6766E63E", "0000C03F", "00000000",
  "E0A59BBE", "9A99D93F", "00000000", "5A39343F", "9A99D93F", "00000000",
  "BFCA21BE", "3333F33F", "00000000", "7D3F753F", "3333F33F", "00000000",
  "709B44BC", "66660640", "00000000", "D1229B3F", "66660640", "00000000",
  "4C37093E", "33331340", "00000000", "E3A5BB3F", "33331340", "00000000",
  "2A5C8F3E", "00002040", "00000000", "F628DC3F", "00002040", "00000000",
];
const expectedIndices = [
  0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5, 4, 6, 5, 5, 6, 7,
  6, 8, 7, 7, 8, 9, 8, 10, 9, 9, 10, 11, 10, 12, 11, 11, 12, 13,
  12, 14, 13, 13, 14, 15, 14, 16, 15, 15, 16, 17, 16, 18, 17, 17, 18, 19,
  18, 20, 19, 19, 20, 21,
];

function main(): void {
  const mesh = requireOk(buildOrdinaryBaseNoteMesh(meshState), "build ordinary base mesh");
  equal(mesh.vertices.length, 22, "base mesh vertex count");
  equal(mesh.indices.length, 60, "base mesh index count");
  equal(mesh.uv.length, 22, "base mesh UV count");
  equal(mesh.colors.length, 22, "base mesh color count");
  equal(
    JSON.stringify(mesh.vertices.flatMap((vertex) => [
      floatBytes(vertex.x), floatBytes(vertex.y), floatBytes(vertex.z),
    ])),
    JSON.stringify(expectedVertexBytes),
    "all 22 vertices preserve frozen Float32 arithmetic",
  );
  equal(JSON.stringify(mesh.indices), JSON.stringify(expectedIndices), "all ten strips preserve R2 winding");
  equal(floatBytes(mesh.uv[0]!.x), "00000000", "left U");
  equal(floatBytes(mesh.uv[1]!.x), "0000803F", "right U");
  equal(floatBytes(mesh.uv[20]!.y), "0000803F", "final V");
  equal(floatBytes(mesh.colors[0]!.red), "6666663F", "uniform color bits");
  equal(floatBytes(mesh.colors[21]!.alpha), "9A99193F", "uniform alpha bits");
  equal(Object.isFrozen(mesh), true, "mesh result frozen");
  equal(Object.isFrozen(mesh.vertices), true, "vertex array frozen");
  equal(Object.isFrozen(mesh.vertices[0]), true, "vertex frozen");
  equal(Object.isFrozen(mesh.colors[0]), true, "copied color frozen");
  equal(mesh.colors[0] === meshState.color, false, "owner color is not aliased");

  const line = requireOk(buildOrdinarySyncLine({
    targetA: target(-2, 1, -13.5, 0.4, 0.7, 1),
    targetB: target(2, 1.25, -13, 0.6, 0.9, 10),
    edgeMargin: f32(0.2),
  }), "build ordinary sync line");
  equal(floatBytes(line.start.x), "8FC2F5BF", "ordinary target A margin applied");
  equal(floatBytes(line.end.x), "00000040", "GameNoteType 10 target B margin excluded");
  equal(floatBytes(line.start.z), "000058C1", "target A Z preserved");
  equal(floatBytes(line.end.z), "000050C1", "target B Z preserved");
  equal(floatBytes(line.width), "39B4483E", "width uses target A localScaleX times Float32 0.28");

  const reverse = requireOk(buildOrdinarySyncLine({
    targetA: target(2, 1.25, -13, 0.6, 0.9, 10),
    targetB: target(-2, 1, -13.5, 0.4, 0.7, 1),
    edgeMargin: f32(0.2),
  }), "build reverse ordinary sync line");
  equal(floatBytes(reverse.start.x), "00000040", "reverse direction excluded A margin");
  equal(floatBytes(reverse.end.x), "8FC2F5BF", "reverse direction applies B margin inward");
  equal(floatBytes(reverse.width), "2506813E", "reverse width still uses target A local scale");

  const badButton = buildOrdinaryBaseNoteMesh({
    ...meshState,
    front: { ...meshState.front, buttonCount: 8 },
  });
  equal(badButton.status, "evidence-required", "button count outside current 1..7 fails closed");
  const zeroRate = buildOrdinaryBaseNoteMesh({ ...meshState, widthRate: f32(0) });
  equal(zeroRate.status, "evidence-required", "zero width rate fails closed");
  const overflow = buildOrdinaryBaseNoteMesh({
    ...meshState,
    front: { ...meshState.front, position: vector2(3.4028234663852886e38, 0), localScaleX: f32(3.4028234663852886e38) },
    widthRate: f32(3.4028234663852886e38),
  });
  equal(overflow.status, "evidence-required", "Float32 overflow fails closed without throwing");
  const degenerate = buildOrdinarySyncLine({
    targetA: target(0, 0, -13, 1, 1, 10),
    targetB: target(0, 0, -12, 1, 1, 10),
    edgeMargin: f32(0),
  });
  equal(degenerate.status, "evidence-required", "degenerate projected line fails closed");
  const malformed = buildOrdinarySyncLine({
    targetA: { ...target(0, 0, -13, 1, 1, 1), lossyScaleX: { value: Number.NaN } as RenderFloat32 },
    targetB: target(1, 0, -13, 1, 1, 1),
    edgeMargin: f32(0.1),
  });
  equal(malformed.status, "evidence-required", "non-Float32 owner value fails closed");

  console.log("ordinary Note geometry producer tests passed: mesh=22/60 line=margin/width failures=closed");
}

main();
