import { runBuiltinCatalogTests } from "./builtinCatalog.test";
import { runResourceContractTests } from "./contracts.test";
import { runDynamicCatalogTests } from "./dynamicCatalog.test";
import { runResourceManagerLifecycleTests } from "./managerLifecycle.test";
import { runUserMediaTests } from "./userMedia.test";

async function main(): Promise<void> {
  runResourceContractTests();
  await runBuiltinCatalogTests();
  await runDynamicCatalogTests();
  await runResourceManagerLifecycleTests();
  await runUserMediaTests();
  console.log("resource manager core: ok");
}

void main();
