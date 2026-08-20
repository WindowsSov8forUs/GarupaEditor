import {
  createResourceRef,
  parseResourceId,
  validateObservedIntegrity,
} from "../contracts";
import {
  APPLICATION_RESOURCE_SLOTS,
  createEmptyApplicationResourceSelection,
  replaceApplicationResourceSelection,
} from "../selections";

export function runResourceContractTests(): void {
  const dynamic = parseResourceId("bestdori/jp/noteskin/skin999");
  equal(dynamic.status, "accepted");
  equal(parseResourceId("bestdori//noteskin/skin00").status, "rejected");
  equal(parseResourceId("simulator-static/current-10.1.4/x").status, "rejected");

  const reference = createResourceRef("user/media/f0c3c1fd-0e1d-4fd2-9e3c-d86b384733ea");
  equal(reference.status, "accepted");
  equal(validateObservedIntegrity({
    byteLength: 3,
    sha256: "A".repeat(64),
  }).status, "accepted");
  equal(validateObservedIntegrity({
    byteLength: 0,
    sha256: "A".repeat(64),
  }).status, "rejected");

  const empty = createEmptyApplicationResourceSelection();
  equal(Object.keys(empty).length, APPLICATION_RESOURCE_SLOTS.length);
  equal(empty["chart-media.bgm"], null);
  equal(reference.status, "accepted");
  if (reference.status !== "accepted") return;
  const selected = replaceApplicationResourceSelection(empty, {
    "chart-media.bgm": reference.value,
  });
  equal(selected["chart-media.bgm"]?.id, reference.value.id);
  equal(selected["chart-media.cover"], null);
  equal(Object.isFrozen(selected), true);
}

function equal(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`assertion failed: expected ${String(expected)}, got ${String(actual)}`);
  }
}
