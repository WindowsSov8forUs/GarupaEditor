import {
  HABAHIRO_BESTDORI_PINNED_ASSETS,
} from "../../support/resources/habahiroBestdoriTestManifest";
import {
  parseHabahiroAtlasRows,
  prepareHabahiroBestdoriPack,
  type HabahiroBestdoriTransport,
} from "../../support/resources/habahiroBestdoriTestProvider";
import { createRenderFloat32 } from "../../../backends/renderingValidation";
import { ok, type SimulatorResult } from "../../../engine/evidence";
import { getHabahiroMeshWidthRate } from "../../../engine/rendering/ordinaryNoteGeometry";

function requireOk<T>(result: SimulatorResult<T>, message: string): T {
  if (result.status !== "ok") throw new Error(`${message}: ${result.capability}`);
  return result.value;
}
function equal<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`);
}

async function main(): Promise<void> {
  const requested: string[] = [];
  const tamperedTransport: HabahiroBestdoriTransport = {
    async read(url) {
      requested.push(url);
      const pinned = HABAHIRO_BESTDORI_PINNED_ASSETS.find((asset) => asset.url === url);
      return ok(new Uint8Array(pinned?.byteLength ?? 0));
    },
  };
  const tampered = await prepareHabahiroBestdoriPack(tamperedTransport);
  equal(tampered.status, "integrity-failure", "tampered Bestdori payload fails closed");
  equal(
    tampered.status === "integrity-failure" ? tampered.capability : null,
    "render.habahiro.bestdori-resource-mismatch",
    "tamper capability is stable",
  );
  equal(requested.length, 1, "tamper rejection stops before later downloads");

  const malformedRows = parseHabahiroAtlasRows(
    new TextEncoder().encode("[]"),
    new TextEncoder().encode("{}"),
  );
  equal(malformedRows.status, "integrity-failure", "malformed Sprite metadata fails closed");
  equal(
    malformedRows.status === "integrity-failure" ? malformedRows.capability : null,
    "render.habahiro.bestdori-sprite-count-mismatch",
    "Sprite count capability is stable",
  );

  const settingZero = requireOk(createRenderFloat32(0), "zero mesh setting");
  const settingOne = requireOk(createRenderFloat32(1), "one mesh setting");
  equal(requireOk(getHabahiroMeshWidthRate(1, settingOne), "width one").value,
    Math.fround(1), "single-lane HABAHIRO width");
  equal(requireOk(getHabahiroMeshWidthRate(2, settingOne), "width two").value,
    Math.fround(1.05), "two-lane HABAHIRO base width");
  equal(requireOk(getHabahiroMeshWidthRate(3, settingZero), "width three zero").value,
    Math.fround(1.05), "wide HABAHIRO zero setting");
  equal(requireOk(getHabahiroMeshWidthRate(7, settingOne), "width seven one").value,
    Math.fround(Math.fround(1.05) + Math.fround(0.0300000906)),
    "wide HABAHIRO coefficient uses Float32 steps");
  equal(getHabahiroMeshWidthRate(8, settingOne).status, "integrity-failure",
    "out-of-domain HABAHIRO width fails closed");

  console.log("HABAHIRO complete implementation contracts passed: pinned tamper/parser/Float32 width failure closure");
}

void main();
