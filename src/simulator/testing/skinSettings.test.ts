declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import type { OriginalSkinSettings } from "../engine/skin/contracts";
import {
  CURRENT_NORMAL_DIRECTIONAL_SKINS,
  CURRENT_NORMAL_EFFECT_SKINS,
  CURRENT_NORMAL_LANE_SKINS,
  CURRENT_NORMAL_NOTE_SKINS,
  CURRENT_NORMAL_SOUND_SKINS,
  CURRENT_SPECIAL_SKINS,
} from "../engine/skin/currentMasterCatalog";
import { resolveOriginalSkinRecipe } from "../engine/skin/originalSkinResolver";
import { validateAndFreezeOriginalSkinSettings } from "../engine/skin/originalSkinValidation";
import { selectResolvedSkinResourceInventory } from "../resources/skinResourceSelector";
import { prepareSelectedSkinPortablePacks } from "../resources/skinPortablePack";
import { ImmutableSharedStaticResourceStore } from "../resources/sharedStaticResourceStore";
import { prepareSkinRenderOverlay } from "../assembly/skinRenderPreparation";
import { CURRENT_ORDINARY_RENDER_BINDINGS } from "../backends/resources/currentOrdinaryResourceManifest";

async function main(): Promise<void> {
  testCatalog();
  testValidation();
  testNormalRoutes();
  testSpecialModeMatrix();
  testPartialAndDirectionalRoutes();
  testHabahiroAndMvPrecedence();
  testFailedClosedPackage();
  testResourceInventory();
  await testPortablePackAndRenderOverlay();
  testIdentityAndFreeze();
  console.log("Skin settings tests passed: current catalog, exact validation, per-component modes, HAB/MV, failed package, frozen identity");
}

function testCatalog(): void {
  assert.deepEqual([
    CURRENT_NORMAL_NOTE_SKINS.length,
    CURRENT_NORMAL_LANE_SKINS.length,
    CURRENT_NORMAL_EFFECT_SKINS.length,
    CURRENT_NORMAL_SOUND_SKINS.length,
    CURRENT_NORMAL_DIRECTIONAL_SKINS.length,
  ], [7, 15, 5, 4, 5]);
  assert.equal(CURRENT_SPECIAL_SKINS.length, 34);
  assert.equal(CURRENT_SPECIAL_SKINS.filter((row) => row.kind === "collabo" && row.selectable).length, 29);
  assert.equal(CURRENT_SPECIAL_SKINS.filter((row) => row.kind === "limited" && row.selectable).length, 4);
  const unavailable = CURRENT_SPECIAL_SKINS.filter((row) => !row.selectable);
  assert.deepEqual(unavailable.map((row) => [row.kind, row.selectionId]), [["collabo", 36]]);
  assert.equal(CURRENT_NORMAL_NOTE_SKINS[6]!.bundleName, "skin05");
  assert.equal(CURRENT_NORMAL_NOTE_SKINS[6]!.noteSyncEdgeMargin, Math.fround(1.1));
  assert.ok(CURRENT_SPECIAL_SKINS.every((row) => Object.isFrozen(row)));
}

function testValidation(): void {
  const input = defaults();
  const validated = requireOk(validateAndFreezeOriginalSkinSettings(input));
  (input as { noteSkin: number }).noteSkin = 6;
  assert.equal(validated.noteSkin, 0);
  assert.ok(Object.isFrozen(validated));
  assert.ok(Object.isFrozen(validated.special));
  for (const mutation of [
    (value: any) => { value.noteSkin = 7; },
    (value: any) => { value.fieldSkin = -1; },
    (value: any) => { value.directionalFlickEffect = 2; },
    (value: any) => { value.judgeSkinId = "skin_bike"; },
    (value: any) => { value.special = { kind: "collabo", seasonSpecialId: 37, components: states("on") }; },
    (value: any) => { value.special = { kind: "limited", limitedSkinId: 2, components: { ...states("on"), judge: true } }; },
    (value: any) => { value.special = { kind: "none", components: states("off") }; },
  ]) {
    const value: any = defaults();
    mutation(value);
    assert.equal(validateAndFreezeOriginalSkinSettings(value).status, "evidence-required");
  }
}

function testNormalRoutes(): void {
  const defaultRecipe = requireOk(resolveOriginalSkinRecipe(
    defaults(), createSimulatorModeIdentity("live", "manual"), "ordinary", "standard",
  ));
  assert.equal(defaultRecipe.fidelity, "default-current");
  assert.deepEqual([
    defaultRecipe.note.logicalResource,
    defaultRecipe.field.logicalResource,
    defaultRecipe.tapEffect.logicalResource,
    defaultRecipe.tapSE.logicalResource,
    defaultRecipe.directional.noteLogicalResource,
    defaultRecipe.directional.effectLogicalResource,
    defaultRecipe.directional.seLogicalResource,
    defaultRecipe.judge.logicalResource,
    defaultRecipe.structuralStage.logicalResource,
  ], [
    "ingameskin/noteskin/skin00",
    "ingameskin/fieldskin/skin00",
    "ingameskin/tapeffect/skin00",
    "sound/tapseskin/skin00",
    "ingameskin/noteskin/directionalflickskin00",
    "ingameskin/tapeffect/directionalflickskin00normal",
    "sound/tapseskin/directionalflickskin00",
    "ingameskin/judgeskin/skin00",
    "ingameskin/stageskin/normal",
  ]);
  assert.equal(defaultRecipe.background.route, "presentation-background");
  const nondefault = defaults();
  (nondefault as any).noteSkin = 6;
  (nondefault as any).fieldSkin = 14;
  (nondefault as any).tapEffect = 4;
  (nondefault as any).judgeSE = 3;
  (nondefault as any).directionalFlick = 4;
  (nondefault as any).directionalFlickEffect = 1;
  const resolved = requireOk(resolveOriginalSkinRecipe(
    nondefault, createSimulatorModeIdentity("live", "manual"), "ordinary", "standard",
  ));
  assert.equal(resolved.fidelity, "normal-current-static-portable");
  assert.equal(resolved.note.bundleName, "skin05");
  assert.equal(resolved.note.noteSyncEdgeMargin, Math.fround(1.1));
  assert.equal(resolved.field.bundleName, "skin14");
  assert.equal(resolved.tapEffect.bundleName, "skin04");
  assert.equal(resolved.tapSE.bundleName, "skin03");
  assert.equal(resolved.directional.effectVariant, "light");
  assert.equal(resolved.directional.effectLogicalResource, "ingameskin/tapeffect/directionalflickskin04light");
}

function testSpecialModeMatrix(): void {
  const selected = aggregate("limited", 2, "on");
  const manual = requireOk(resolveOriginalSkinRecipe(
    selected, createSimulatorModeIdentity("live", "manual"), "ordinary", "standard",
  ));
  for (const component of [manual.note, manual.field, manual.tapEffect, manual.background, manual.tapSE, manual.judge]) {
    assert.equal(component.route, "special");
    assert.equal(component.bundleName, "skin_april2019");
  }
  const auto = requireOk(resolveOriginalSkinRecipe(
    selected, createSimulatorModeIdentity("live", "auto"), "ordinary", "standard",
  ));
  assert.equal(auto.note.route, "special");
  assert.equal(auto.field.route, "special");
  assert.equal(auto.tapEffect.route, "special");
  assert.equal(auto.background.route, "special");
  assert.equal(auto.tapSE.route, "special");
  assert.equal(auto.judge.route, "default");
  assert.equal(auto.judge.bundleName, "skin00");
  for (const inputMode of ["manual", "auto"] as const) {
    const practice = requireOk(resolveOriginalSkinRecipe(
      selected, createSimulatorModeIdentity("rehearsal", inputMode), "ordinary", "standard",
    ));
    assert.equal(practice.note.route, "normal");
    assert.equal(practice.field.route, "normal");
    assert.equal(practice.tapEffect.route, "normal");
    assert.equal(practice.background.route, "practice-background");
    assert.equal(practice.tapSE.route, "normal");
    assert.equal(practice.judge.route, "default");
  }
  const off = aggregate("limited", 2, "off");
  const disabled = requireOk(resolveOriginalSkinRecipe(
    off, createSimulatorModeIdentity("live", "manual"), "ordinary", "standard",
  ));
  assert.equal(disabled.note.route, "normal");
  assert.equal(disabled.background.route, "presentation-background");
  assert.equal(disabled.judge.route, "default");
}

function testPartialAndDirectionalRoutes(): void {
  const partial = requireOk(resolveOriginalSkinRecipe(
    aggregate("collabo", 159, "on"),
    createSimulatorModeIdentity("live", "manual"),
    "ordinary",
    "standard",
  ));
  assert.equal(partial.field.bundleName, "skin_gbp2020");
  assert.equal(partial.background.bundleName, "skin_gbp2020");
  assert.equal(partial.note.route, "normal");
  assert.equal(partial.tapEffect.route, "normal");
  assert.equal(partial.tapSE.route, "normal");
  const directionalInput = aggregate("collabo", 210, "on");
  (directionalInput as any).directionalFlickEffect = 1;
  const directional = requireOk(resolveOriginalSkinRecipe(
    directionalInput, createSimulatorModeIdentity("live", "auto"), "ordinary", "standard",
  ));
  assert.equal(directional.directional.route, "special");
  assert.equal(directional.directional.bundleName, "skin_persona");
  assert.equal(directional.directional.noteLogicalResource, "ingameskin/noteskin/directionalflickskin_persona");
  assert.equal(directional.directional.effectLogicalResource, "ingameskin/tapeffect/directionalflickskin_personalight");
  assert.equal(directional.directional.seLogicalResource, "sound/tapseskin/directionalflickskin00");
}

function testHabahiroAndMvPrecedence(): void {
  const selected = aggregate("limited", 2, "on");
  const hab = requireOk(resolveOriginalSkinRecipe(
    selected, createSimulatorModeIdentity("live", "auto"), "habahiro", "standard",
  ));
  assert.equal(hab.note.route, "habahiro");
  assert.equal(hab.field.route, "habahiro");
  assert.equal(hab.judge.route, "habahiro");
  assert.equal(hab.background.route, "habahiro");
  assert.equal(hab.note.noteSyncEdgeMargin, Math.fround(0));
  assert.equal(hab.tapEffect.route, "special");
  assert.equal(hab.tapSE.route, "special");
  const mv = requireOk(resolveOriginalSkinRecipe(
    selected, createSimulatorModeIdentity("live", "manual"), "ordinary", "mv",
  ));
  assert.equal(mv.background.route, "mv-video");
  assert.equal(mv.background.logicalResource, null);
  assert.equal(mv.note.route, "special");
  const unsupported = resolveOriginalSkinRecipe(
    selected, createSimulatorModeIdentity("rehearsal", "manual"), "ordinary", "mv",
  );
  assert.equal(unsupported.status, "evidence-required");
  if (unsupported.status === "evidence-required") {
    assert.equal(unsupported.capability, "skin.rehearsal-mv-unsupported");
  }
}

function testFailedClosedPackage(): void {
  const result = resolveOriginalSkinRecipe(
    aggregate("collabo", 36, "off"),
    createSimulatorModeIdentity("rehearsal", "manual"),
    "ordinary",
    "standard",
  );
  assert.equal(result.status, "evidence-required");
  if (result.status === "evidence-required") {
    assert.equal(result.capability, "skin.special-package-unavailable");
  }
}

function testResourceInventory(): void {
  const ordinary = requireOk(resolveOriginalSkinRecipe(
    defaults(), createSimulatorModeIdentity("live", "manual"), "ordinary", "standard",
  ));
  const ordinaryInventory = selectResolvedSkinResourceInventory(ordinary);
  assert.equal(ordinaryInventory.recipeIdentity, ordinary.identity);
  assert.equal(ordinaryInventory.resources.length, 8);
  assert.ok(ordinaryInventory.resources.every((resource) =>
    resource.resourceKey.startsWith("simulator-static/current-10.1.4/skin-portable/")));
  const hab = requireOk(resolveOriginalSkinRecipe(
    aggregate("limited", 2, "on"),
    createSimulatorModeIdentity("live", "manual"),
    "habahiro",
    "standard",
  ));
  const habInventory = selectResolvedSkinResourceInventory(hab);
  assert.equal(habInventory.resources.length, 10);
  assert.equal(habInventory.resources.filter((resource) =>
    resource.role === "habahiro-change-flash")[0]?.logicalResource,
  "ingameskin/tapeffect/habahiro");
  assert.ok(Object.isFrozen(habInventory));
  assert.ok(Object.isFrozen(habInventory.resources));
}

async function testPortablePackAndRenderOverlay(): Promise<void> {
  const recipe = requireOk(resolveOriginalSkinRecipe(
    aggregate("limited", 3, "on"),
    createSimulatorModeIdentity("live", "manual"),
    "ordinary",
    "standard",
  ));
  const selected = selectResolvedSkinResourceInventory(recipe);
  const fixtureRoot = join(
    process.cwd(),
    "src/simulator/testing/fixtures/reverse-snapshots/skin-settings/limited3",
  );
  const entries = selected.resources.map((resource) => ({
    resourceKey: resource.resourceKey,
    bytes: new Uint8Array(readFileSync(join(
      fixtureRoot,
      `${resource.logicalResource.replace(/\//g, "__")}.json`,
    ))),
  }));
  const store = requireAccepted(ImmutableSharedStaticResourceStore.create(entries));
  const packs = requireAccepted(await prepareSelectedSkinPortablePacks(
    selected.resources,
    store,
  ));
  assert.equal(packs.length, 9);
  assert.ok(packs.every((pack) => Object.isFrozen(pack)));
  const overlay = requireAccepted(await prepareSkinRenderOverlay(
    recipe,
    packs,
    CURRENT_ORDINARY_RENDER_BINDINGS,
  ));
  assert.notEqual(overlay, null);
  assert.ok(overlay!.assets.length > 0);
  assert.match(overlay!.bindings.noteAtlasLogicalAssetId, /skin_april2021/);
  assert.match(overlay!.bindings.ordinaryVisible!.judgeLogicalAssetId, /skinapril2021/);
  assert.notEqual(overlay!.fieldBindings, null);
  assert.match(overlay!.fieldBindings!.backgroundLineLogicalAssetId, /skin_april2021/);
  assert.match(overlay!.backgroundLogicalAssetId!, /skin_april2021/);
  const tampered = entries.map((entry) => ({ ...entry, bytes: Uint8Array.from(entry.bytes) }));
  tampered[0]!.bytes[0] ^= 0xff;
  const badStore = requireAccepted(ImmutableSharedStaticResourceStore.create(tampered));
  const rejected = await prepareSelectedSkinPortablePacks(selected.resources, badStore);
  assert.equal(rejected.status, "rejected");
  if (rejected.status === "rejected") assert.equal(rejected.failure.capability, "simulator.skin.pack-integrity");
}

function testIdentityAndFreeze(): void {
  const input = aggregate("limited", 3, "on");
  const first = requireOk(resolveOriginalSkinRecipe(
    input, createSimulatorModeIdentity("live", "manual"), "ordinary", "standard",
  ));
  const second = requireOk(resolveOriginalSkinRecipe(
    input, createSimulatorModeIdentity("live", "manual"), "ordinary", "standard",
  ));
  assert.equal(first.identity, second.identity);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.note));
  assert.ok(Object.isFrozen(first.directional));
  const auto = requireOk(resolveOriginalSkinRecipe(
    input, createSimulatorModeIdentity("live", "auto"), "ordinary", "standard",
  ));
  assert.notEqual(first.identity, auto.identity);
  const fixed = defaults();
  (fixed as any).isFixedBG = true;
  const fixedResolved = requireOk(resolveOriginalSkinRecipe(
    fixed, createSimulatorModeIdentity("live", "manual"), "ordinary", "standard",
  ));
  const unfixedResolved = requireOk(resolveOriginalSkinRecipe(
    defaults(), createSimulatorModeIdentity("live", "manual"), "ordinary", "standard",
  ));
  assert.notEqual(fixedResolved.identity, unfixedResolved.identity);
}

function defaults(): OriginalSkinSettings {
  return {
    noteSkin: 0,
    fieldSkin: 0,
    tapEffect: 0,
    judgeSE: 0,
    directionalFlick: 0,
    directionalFlickEffect: 0,
    isFixedBG: false,
    special: { kind: "none" },
  };
}

function aggregate(
  kind: "collabo" | "limited",
  selectionId: number,
  state: "on" | "off",
): OriginalSkinSettings {
  return {
    ...defaults(),
    special: kind === "collabo"
      ? { kind, seasonSpecialId: selectionId, components: states(state) }
      : { kind, limitedSkinId: selectionId, components: states(state) },
  };
}

function states(state: "on" | "off") {
  return {
    laneAndLine: state,
    tapEffect: state,
    rhythmIcon: state,
    background: state,
    soundEffect: state,
    judge: state,
    directionalFlickIcon: state,
  } as const;
}

function requireOk<T>(result: { readonly status: "ok"; readonly value: T } | { readonly status: "evidence-required"; readonly capability: string }): T {
  if (result.status !== "ok") throw new Error(result.capability);
  return result.value;
}
function requireAccepted<T>(result: { readonly status: "accepted"; readonly value: T } | { readonly status: "rejected"; readonly failure: { readonly capability: string; readonly boundary?: string } }): T {
  if (result.status !== "accepted") throw new Error(`${result.failure.capability}: ${result.failure.boundary ?? ""}`);
  return result.value;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
