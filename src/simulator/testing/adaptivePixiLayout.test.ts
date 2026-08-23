declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { Texture, TextureSource } from "pixi.js";
import { PixiRendererBackend, type PixiTextureDecoder } from "../backends/pixi/pixiRendererBackend";
import { ImmutableLocalRenderResourceProvider, PortableRenderResourcePreflightAdapter } from "../backends/resources/localResourceProvider";
import type {
  RenderCommand,
  RenderFloat32,
  RenderResourceProfile,
  SimulatorResourceProvider,
} from "../backends/renderingContracts";
import { createRenderFloat32 } from "../backends/renderingValidation";
import {
  createOriginalSurfaceLayout,
  type OriginalSurfaceLayout,
} from "../scene/originalSurfaceLayout";

const ROOT = join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/autonomous-module/artifacts/investigations/autonomous-simulator-portable-pack-10-1-4",
);
const FILES: Readonly<Record<string, string>> = Object.freeze({
  "ordinary/notes/skin00/atlas": "rhythm-game-sprites.png",
  "ordinary/notes/skin00/long-note-line": "long-note-line.png",
  "ordinary/notes/skin00/curve-note-line": "curve-note-line.png",
  "ordinary/notes/skin00/simultaneous-line": "simultaneous-line.png",
  "ordinary/notes/directionalflickskin00/atlas": "directional-flick-sprites.png",
  "ordinary/notes/directionalflickskin00/line-left": "directional-line-left.png",
  "ordinary/notes/directionalflickskin00/line-right": "directional-line-right.png",
});
const decoder: PixiTextureDecoder = {
  async decodePng(asset) {
    return { status: "ok", value: new Texture({ source: new TextureSource({
      width: asset.width!, height: asset.height!,
      resource: { width: asset.width!, height: asset.height! },
      resolution: 1, autoGarbageCollect: false,
    }) }) };
  },
  async decodeFont() {
    return { status: "integrity-failure", capability: "adaptive.test.unexpected-font", requiredEvidence: [], boundary: "ordinary pack has no font" };
  },
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const base = JSON.parse(readFileSync(join(ROOT, "ordinary_portable_profile.json"), "utf8")) as RenderResourceProfile;
  const provider = requireOk<SimulatorResourceProvider>(ImmutableLocalRenderResourceProvider.create(base.assets.map((asset) => ({
    logicalAssetId: asset.logicalAssetId,
    bytes: new Uint8Array(readFileSync(join(ROOT, "ordinary-portable-assets", FILES[asset.logicalAssetId]!))),
  }))));
  for (const [label, width, height] of [
    ["4:3", 1200, 900],
    ["32:9", 2560, 720],
  ] as const) {
    const layout = requireOk<OriginalSurfaceLayout>(createOriginalSurfaceLayout({
      revision: 0,
      viewportWidth: width,
      viewportHeight: height,
      safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(width), height: Math.fround(height) },
      origin: "bottom-left",
    }, Math.fround(100)));
    const profile: RenderResourceProfile = {
      ...base,
      scene: {
        ...base.scene,
        projection: {
          ...base.scene.projection,
          viewportWidth: width,
          viewportHeight: height,
          pixelsPerWorldUnit: layout.camera.pixelsPerWorldUnit,
        },
      },
    };
    const renderer = new PixiRendererBackend(decoder);
    requireOk(await renderer.prepare(
      `adaptive-pixi:${label}`,
      profile,
      provider,
      new PortableRenderResourcePreflightAdapter(),
    ));
    requireOk(renderer.bindOriginalSurfaceLayout(layout));
    const commands: RenderCommand[] = [
      {
        sessionId: `adaptive-pixi:${label}`, sequence: 0, frame: 0, substep: 0,
        kind: "create-object", renderObjectId: "note", poolFamily: "normal",
        role: "note-root", parentObjectId: null,
      },
      {
        sessionId: `adaptive-pixi:${label}`, sequence: 1, frame: 0, substep: 0,
        kind: "bind-resource", renderObjectId: "note", binding: "sprite",
        logicalAssetId: "ordinary/notes/skin00/atlas", exactKey: "note_normal_1",
      },
      {
        sessionId: `adaptive-pixi:${label}`, sequence: 2, frame: 0, substep: 0,
        kind: "set-transform", renderObjectId: "note",
        position: { x: f32(0), y: f32(0), z: f32(0) },
        scale: { x: f32(1), y: f32(1) }, rotationDegrees: f32(0),
        color: { red: f32(1), green: f32(1), blue: f32(1), alpha: f32(1) },
        ordering: { domainLayer: 3, sourceDepthOrSortingOrder: 0, sourceZ: f32(0), creationSequence: 0 },
        maskObjectId: null,
      },
      {
        sessionId: `adaptive-pixi:${label}`, sequence: 3, frame: 0, substep: 0,
        kind: "activate-object", renderObjectId: "note",
      },
    ];
    requireOk(renderer.commit(requireOk(renderer.preflight(commands))));
    const row = renderer.sceneSnapshot().find((candidate) => candidate.renderObjectId === "note")!;
    assert.deepEqual(row.position, [width / 2, height / 2], `${label}: actual Pixi center`);
    assert.equal(row.scale[0], Math.fround(layout.camera.pixelsPerWorldUnit / 100), `${label}: actual Pixi PPU scale`);
    const node = renderer.stage.getChildByLabel("note") as any;
    assert.deepEqual([node.x, node.y], [width / 2, height / 2], `${label}: actual Pixi node transform`);
    requireOk(renderer.dispose());
  }
  console.log("adaptive actual Pixi layout tests passed: 4:3 and 32:9 projection/PPU/cleanup");
}

function f32(value: number): RenderFloat32 {
  return requireOk(createRenderFloat32(Math.fround(value)));
}
function requireOk<T>(result: any): T {
  if (result.status !== "ok") throw new Error(`${result.capability}: ${result.boundary}`);
  return result.value as T;
}
