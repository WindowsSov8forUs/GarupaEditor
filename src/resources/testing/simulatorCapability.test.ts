import { ApplicationSimulatorResourceCapability } from "../../app/simulator/ApplicationSimulatorResourceCapability";
import { ApplicationResourceManager } from "../applicationResourceManager";
import type { ResourceObjectUrlFactory } from "../backend";
import { MemoryApplicationResourceBackend } from "../memoryResourceBackend";

export async function runSimulatorResourceCapabilityTests(): Promise<void> {
  const manager = new ApplicationResourceManager(
    new MemoryApplicationResourceBackend(),
    new NoopObjectUrls(),
  );
  equal((await manager.initialize()).status, "accepted");
  const registered = await manager.registerBuiltin({
    id: "builtin/game/atlas/bms/ui/iconcombonumber",
    kind: "image",
    title: "Combo",
    sourceUrl: "/combo.png",
    files: [{
      logicalPath: "combo-number.png",
      mediaType: "image/png",
      bytes: new TextEncoder().encode("combo-bytes"),
    }],
  });
  equal(registered.status, "accepted");
  if (registered.status !== "accepted") return;
  const capability = new ApplicationSimulatorResourceCapability(manager, Object.freeze({
    "atlas/bms/ui/iconcombonumber": registered.value.ref,
  }));
  const acquired = await capability.acquire([
    {
      semanticRole: "hud.combo",
      logicalResource: "atlas/bms/ui/iconcombonumber",
      requiredFiles: ["combo-number.png"],
    },
    {
      semanticRole: "hud.combo.second-consumer",
      logicalResource: "atlas/bms/ui/iconcombonumber",
      requiredFiles: ["combo-number.png"],
    },
  ]);
  equal(acquired.status, "accepted");
  if (acquired.status !== "accepted") return;
  equal(acquired.value.listFiles("atlas/bms/ui/iconcombonumber").length, 1);
  equal(
    new TextDecoder().decode(await acquired.value.readBytes(
      "atlas/bms/ui/iconcombonumber",
      "combo-number.png",
    )),
    "combo-bytes",
  );
  await acquired.value.release();
  equal(acquired.value.listFiles("atlas/bms/ui/iconcombonumber").length, 0);

  const missingFile = await capability.acquire([{
    semanticRole: "hud.combo",
    logicalResource: "atlas/bms/ui/iconcombonumber",
    requiredFiles: ["missing.png"],
  }]);
  equal(missingFile.status, "rejected");
  if (missingFile.status === "rejected") {
    equal(missingFile.failure.capability, "simulator.resources.application-required-file-missing");
  }
  const missingBinding = await new ApplicationSimulatorResourceCapability(manager, {}).acquire([{
    semanticRole: "hud.combo",
    logicalResource: "atlas/bms/ui/iconcombonumber",
    requiredFiles: null,
  }]);
  equal(missingBinding.status, "rejected");
  equal((await manager.collectGarbage()).status, "accepted");
}

class NoopObjectUrls implements ResourceObjectUrlFactory {
  create(): string { return "noop"; }
  revoke(): void {}
}

function equal(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`assertion failed: expected ${String(expected)}, got ${String(actual)}`);
  }
}
