declare function require(name: string): any;
const assert = require("node:assert/strict");

import {
  EvidenceNoticeCollector,
  integrityFailure,
  productSemantic,
} from "../engine/evidence";
import { createSimulatorModuleCapabilitySummary } from "../public/capabilities";

function main(): void {
  const collector = new EvidenceNoticeCollector();
  const continued = productSemantic(
    "continued",
    "simulator.policy.test-product-continuation",
    ["PAU-B04"],
    "The original presentation is unobserved; the registered product action continues.",
    "GE-PS-TEST-CONTINUE",
    collector,
  );
  assert.equal(continued.status, "ok");
  assert.equal(continued.value, "continued");
  assert.equal(continued.evidenceNotices?.length, 1);
  assert.equal(continued.evidenceNotices?.[0]?.productSemanticsId, "GE-PS-TEST-CONTINUE");
  assert.deepEqual(collector.snapshot(), continued.evidenceNotices);
  assert.equal(Object.isFrozen(collector.snapshot()), true);

  const integrity = integrityFailure(
    "simulator.policy.test-integrity",
    ["PAU-B04"],
    "Corrupt ownership is not an evidence notice.",
  );
  assert.equal(integrity.status, "integrity-failure");
  assert.equal(Object.isFrozen(integrity), true);

  const capabilities = createSimulatorModuleCapabilitySummary(null, null);
  assert.equal(capabilities.dynamicSurfaceResize, "observational-gap");
  assert.equal(capabilities.selectedRenderingGate, "observational-gap");
  assert.equal(capabilities.selectedBackgroundGate, "observational-gap");
  console.log("runtime contract policy tests passed: evidence notices continue and integrity remains typed");
}

main();
