import { runBuiltinCatalogTests } from "./builtinCatalog.test";
import { runResourceContractTests } from "./contracts.test";
import { runDynamicCatalogTests } from "./dynamicCatalog.test";
import { runNoVersionLockTests } from "./noVersionLock.test";
import { runResourceManagerLifecycleTests } from "./managerLifecycle.test";
import { runUserMediaTests } from "./userMedia.test";
import { runSimulatorResourceCapabilityTests } from "./simulatorCapability.test";
import { runSimulatorPreAdaptationTests } from "./simulatorPreAdaptation.test";

async function main(): Promise<void> {
  runResourceContractTests();
  runNoVersionLockTests();
  await runBuiltinCatalogTests();
  await runDynamicCatalogTests();
  await runResourceManagerLifecycleTests();
  await runUserMediaTests();
  await runSimulatorResourceCapabilityTests();
  await runSimulatorPreAdaptationTests();
  console.log("resource manager core: ok");
}

void main();
