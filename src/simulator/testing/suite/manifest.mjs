const DEVELOPMENT = ["development", "portable", "release"];
const PORTABLE = ["portable", "release"];
const BROWSER = ["browser", "release"];

const compiled = (id, capability, path, profiles = DEVELOPMENT, authority = "product-contract", extra = {}) => ({
  id, capability, stage: "compiled", type: "compiled-test", path, profiles, authority, timeoutMs: 180_000, ...extra,
});
const node = (id, capability, path, profiles = PORTABLE, authority = "reverse-fixture", extra = {}) => ({
  id, capability, stage: "integration", type: "node-test", path, profiles, authority, timeoutMs: 300_000, ...extra,
});
const check = (id, capability, path, profiles = DEVELOPMENT, authority = "product-contract", extra = {}) => ({
  id, capability, stage: "static", type: "static-check", path, profiles, authority, timeoutMs: 120_000, ...extra,
});
const webview2 = (id, path, sources, extra = {}) => ({
  id, capability: "platform-browser", stage: "browser", type: "webview2", path,
  sources, profiles: BROWSER, authority: "platform-observation", timeoutMs: 1_800_000,
  exclusiveGroup: "webview2", ...extra,
});

export const capabilities = Object.freeze([
  "provenance-contracts",
  "chart-construction",
  "input-timing-scoring",
  "modes-lifecycle-layout",
  "render-hud-particles",
  "audio-mv-startup",
  "resources-skin-habahiro",
  "platform-browser",
  "product-chart-external",
]);

export const profiles = Object.freeze(["development", "portable", "browser", "release"]);

export const preflights = Object.freeze([
  { id: "preflight.fixtures", path: "checks/verifyTestingFixtures.mjs", timeoutMs: 120_000 },
  { id: "preflight.dependencies", path: "checks/verifyDependencies.mjs", timeoutMs: 120_000 },
  { id: "preflight.production-boundary", path: "checks/verifyEvidenceIntegrityStatic.mjs", timeoutMs: 120_000 },
  { id: "preflight.expected-boundary", path: "checks/verifyExpectedIndependence.mjs", timeoutMs: 120_000 },
  { id: "preflight.runtime-audit", path: "../../../scripts/audit-runtime-contract-blockers.mjs", args: ["--check"], timeoutMs: 120_000 },
]);

export const cases = Object.freeze([
  check("contracts.runtime-policy.static", "provenance-contracts", "checks/verifyRuntimeContractPolicyStatic.mjs"),
  compiled("contracts.runtime-policy", "provenance-contracts", "cases/session/runtimeContractPolicy.test.ts"),
  check("contracts.visible-lifecycle.static", "provenance-contracts", "checks/verifyStrictHudParticlePauseTerminalStatic.mjs"),

  compiled("chart.boundary", "chart-construction", "cases/chart/chartConstructionBoundary.test.ts"),
  compiled("chart.batch-conversion", "chart-construction", "cases/chart/chartBatchConversion.test.ts"),
  node("chart.command-data.evidence", "chart-construction", "cases/chart/chartCommandDataEvidence.test.mjs", DEVELOPMENT, "reverse-fixture", { sources: ["cases/chart/chartCommandData.test.ts"] }),
  node("chart.note-graph.evidence", "chart-construction", "cases/chart/chartNoteGraphEvidence.test.mjs", DEVELOPMENT, "reverse-fixture", { sources: ["cases/chart/chartNoteGraph.test.ts"] }),
  node("chart.multi-range.evidence", "chart-construction", "cases/chart/chartMultiRangeEvidence.test.mjs", PORTABLE, "reverse-fixture", { sources: ["cases/chart/chartMultiRange.test.ts"] }),
  node("chart.finalize.evidence", "chart-construction", "cases/chart/chartFinalizeEvidence.test.mjs", DEVELOPMENT, "reverse-fixture", { sources: ["cases/chart/chartFinalize.test.ts"] }),
  node("chart.parsing", "chart-construction", "cases/chart/chartParsing.test.mjs", DEVELOPMENT, "reverse-fixture"),
  node("chart.production", "chart-construction", "cases/chart/chartProduction.test.mjs", PORTABLE, "reverse-fixture"),
  compiled("chart.garupa-json", "chart-construction", "cases/chart/publicGarupaJsonChart.test.ts"),
  check("chart.garupa-json.static", "chart-construction", "checks/verifyGarupaJsonStatic.mjs"),

  node("gameplay.clock", "input-timing-scoring", "cases/gameplay/clockScheduling.test.mjs", DEVELOPMENT, "reverse-fixture"),
  node("gameplay.auto-live", "input-timing-scoring", "cases/gameplay/autoLive.test.mjs", DEVELOPMENT, "reverse-fixture"),
  node("gameplay.manual.boundary-evidence", "input-timing-scoring", "cases/gameplay/manualInputBoundaryEvidence.test.mjs", DEVELOPMENT, "reverse-fixture", { sources: ["cases/gameplay/manualInputBoundary.test.ts"] }),
  node("gameplay.manual.dispatch-evidence", "input-timing-scoring", "cases/gameplay/manualInputDispatchEvidence.test.mjs", DEVELOPMENT, "reverse-fixture", { sources: ["cases/gameplay/manualInputDispatch.test.ts"] }),
  node("gameplay.manual.judgement-evidence", "input-timing-scoring", "cases/gameplay/manualJudgementEvidence.test.mjs", DEVELOPMENT, "reverse-fixture"),
  node("gameplay.manual.normal-evidence", "input-timing-scoring", "cases/gameplay/manualNormalJudgementEvidence.test.mjs", DEVELOPMENT, "reverse-fixture", { sources: ["cases/gameplay/manualNormalJudgement.test.ts"] }),
  node("gameplay.manual.flick-evidence", "input-timing-scoring", "cases/gameplay/manualFlickJudgementEvidence.test.mjs", DEVELOPMENT, "reverse-fixture", { sources: ["cases/gameplay/manualFlickJudgement.test.ts"] }),
  node("gameplay.manual.multiple-evidence", "input-timing-scoring", "cases/gameplay/manualMultipleDirectionalJudgementEvidence.test.mjs", DEVELOPMENT, "reverse-fixture", { sources: ["cases/gameplay/manualMultipleDirectionalJudgement.test.ts"] }),
  node("gameplay.manual.long-evidence", "input-timing-scoring", "cases/gameplay/manualLongJudgementEvidence.test.mjs", DEVELOPMENT, "reverse-fixture", { sources: ["cases/gameplay/manualLongJudgement.test.ts"] }),
  node("gameplay.manual.slide-evidence", "input-timing-scoring", "cases/gameplay/manualSlideJudgementEvidence.test.mjs", DEVELOPMENT, "reverse-fixture", { sources: ["cases/gameplay/manualSlideJudgement.test.ts"] }),
  node("gameplay.manual.timeout-evidence", "input-timing-scoring", "cases/gameplay/manualTimeoutJudgementEvidence.test.mjs", DEVELOPMENT, "reverse-fixture", { sources: ["cases/gameplay/manualTimeoutJudgement.test.ts"] }),
  compiled("gameplay.score-life", "input-timing-scoring", "cases/gameplay/scoreLifeState.test.ts"),

  compiled("session.engine-foundation", "modes-lifecycle-layout", "cases/session/engineFoundation.test.ts"),
  compiled("session.autonomous-module", "modes-lifecycle-layout", "cases/session/autonomousModule.test.ts"),
  compiled("session.adaptive-layout", "modes-lifecycle-layout", "cases/session/adaptiveLayout.test.ts"),
  compiled("session.scene-layout", "modes-lifecycle-layout", "cases/session/sceneLayout.test.ts"),
  compiled("session.live-rehearsal", "modes-lifecycle-layout", "cases/session/liveRehearsalMode.test.ts"),
  compiled("session.pause-controls", "modes-lifecycle-layout", "cases/session/pauseControlScene.test.ts"),
  compiled("session.original-live-settings", "modes-lifecycle-layout", "cases/session/originalLiveSettings.test.ts"),
  compiled("session.public-life-profile", "modes-lifecycle-layout", "cases/session/publicLifeProfile.test.ts"),
  compiled("session.garupa-extension", "modes-lifecycle-layout", "cases/session/garupaProductExtension.test.ts"),
  check("session.autonomous.static", "modes-lifecycle-layout", "checks/verifyAutonomousModuleStatic.mjs"),
  check("session.adaptive.static", "modes-lifecycle-layout", "checks/verifyAdaptiveLayoutStatic.mjs"),
  check("session.live-rehearsal.static", "modes-lifecycle-layout", "checks/verifyLiveRehearsalStatic.mjs"),
  check("session.original-settings.static", "modes-lifecycle-layout", "checks/verifyOriginalLiveSettingsStatic.mjs"),
  check("session.public-life.static", "modes-lifecycle-layout", "checks/verifyPublicLifeProfileStatic.mjs"),
  check("session.garupa-extension.static", "modes-lifecycle-layout", "checks/verifyGarupaProductExtensionStatic.mjs"),

  compiled("render.contracts", "render-hud-particles", "cases/rendering/renderContracts.test.ts"),
  compiled("render.note-geometry", "render-hud-particles", "cases/rendering/ordinaryNoteGeometry.test.ts"),
  compiled("render.adaptive-pixi", "render-hud-particles", "cases/rendering/adaptivePixiLayout.test.ts"),
  compiled("render.hud.logic", "render-hud-particles", "cases/rendering/hudLogicContract.test.ts"),
  compiled("render.hud.scene-graph", "render-hud-particles", "cases/rendering/hudSceneGraphContract.test.ts"),
  compiled("render.hud.primitives", "render-hud-particles", "cases/rendering/hudRenderPrimitiveContract.test.ts"),
  compiled("render.hud.score", "render-hud-particles", "cases/rendering/scoreHudRenderingContract.test.ts"),
  compiled("render.visual-correction", "render-hud-particles", "cases/rendering/ordinaryVisualCorrectionContract.test.ts"),
  compiled("render.visible-lifecycle", "render-hud-particles", "cases/rendering/ordinaryVisibleLifecycleContract.test.ts", PORTABLE, "reverse-fixture"),
  compiled("render.visible-evidence", "render-hud-particles", "cases/rendering/ordinaryVisibleEvidenceContract.test.ts", PORTABLE, "reverse-fixture"),
  compiled("render.game-clear", "render-hud-particles", "cases/rendering/gameClearLifecycle.test.ts"),
  compiled("render.lane-particle-state", "render-hud-particles", "cases/rendering/laneParticleStateContract.test.ts"),
  compiled("render.particle-contracts", "render-hud-particles", "cases/rendering/particleContracts.test.ts", PORTABLE, "reverse-fixture"),
  compiled("render.particle-native-axis", "render-hud-particles", "cases/rendering/particleBoxDirectionNative.test.ts"),
  compiled("render.particle-terminal", "render-hud-particles", "cases/rendering/ordinaryParticleTerminalContract.test.ts"),
  compiled("render.particle-lane-slide", "render-hud-particles", "cases/rendering/particleLaneSlideOneFrameContract.test.ts"),
  compiled("render.particle-production", "render-hud-particles", "cases/rendering/particleProduction.test.ts", PORTABLE),
  compiled("render.startup-direction-pixi", "render-hud-particles", "cases/rendering/startupDirectionPixi.test.ts"),
  compiled("render.actual-pixi", "render-hud-particles", "cases/rendering/renderPixi.test.ts", PORTABLE, "platform-observation", { produces: ["pixi-observation"], env: { SIMULATOR_RENDER_OBSERVATION_PATH: "$PIXEL_OBSERVATION" }, timeoutMs: 600_000 }),
  node("render.production-chart", "render-hud-particles", "cases/rendering/renderProductionChart.test.mjs", PORTABLE, "product-regression", { timeoutMs: 600_000 }),
  check("render.production.static", "render-hud-particles", "checks/verifyRenderProductionStatic.mjs"),
  check("render.particle.static", "render-hud-particles", "checks/verifyParticleStatic.mjs"),
  check("render.visible-lifecycle.static", "render-hud-particles", "checks/verifyOrdinaryVisibleLifecycleStatic.mjs", PORTABLE, "reverse-fixture"),
  check("render.visible-evidence.static", "render-hud-particles", "checks/verifyOrdinaryVisibleEvidenceStatic.mjs", PORTABLE, "reverse-fixture"),
  check("render.original-visible-anchor", "render-hud-particles", "checks/verifyOriginalVisibleAnchorPixels.mjs", PORTABLE, "reverse-fixture"),
  check("render.observation-cases", "render-hud-particles", "checks/verifyRenderProductionCases.mjs", PORTABLE, "reverse-fixture", { dependencies: ["render.actual-pixi"], env: { SIMULATOR_RENDER_OBSERVATION_PATH: "$PIXEL_OBSERVATION" } }),
  check("render.observation-independence", "render-hud-particles", "checks/verifyRenderObservationIndependence.mjs", PORTABLE, "reverse-fixture", { dependencies: ["render.actual-pixi"], env: { SIMULATOR_RENDER_OBSERVATION_PATH: "$PIXEL_OBSERVATION" } }),
  check("render.observation-total", "render-hud-particles", "checks/verifyTotalRevalidationObservation.mjs", PORTABLE, "reverse-fixture", { dependencies: ["render.actual-pixi"], args: ["$PIXEL_OBSERVATION"] }),

  compiled("media.session-bgm", "audio-mv-startup", "cases/media/sessionBgmDerivation.test.ts"),
  compiled("media.audio-contracts", "audio-mv-startup", "cases/media/audioContracts.test.ts"),
  compiled("media.audio-webaudio", "audio-mv-startup", "cases/media/audioWebAudio.test.ts"),
  compiled("media.movie-contracts", "audio-mv-startup", "cases/media/movieContracts.test.ts"),
  compiled("media.mv-live", "audio-mv-startup", "cases/media/mvLiveContract.test.ts"),
  compiled("media.startup-audio", "audio-mv-startup", "cases/media/startupAudioCallgraph.test.ts"),
  compiled("media.startup-direction", "audio-mv-startup", "cases/media/startupDirection.test.ts"),
  compiled("media.startup-presentation", "audio-mv-startup", "cases/media/startupPresentationDerivation.test.ts"),
  check("media.audio.static", "audio-mv-startup", "checks/verifyAudioStatic.mjs"),
  check("media.mv.static", "audio-mv-startup", "checks/verifyMvLiveStatic.mjs"),
  check("media.startup.static", "audio-mv-startup", "checks/verifyStartupDirectionStatic.mjs"),

  compiled("resources.habahiro", "resources-skin-habahiro", "cases/resources/habahiroContract.test.ts", PORTABLE, "reverse-fixture"),
  compiled("resources.skin-settings", "resources-skin-habahiro", "cases/resources/skinSettings.test.ts"),
  compiled("resources.skin-production", "resources-skin-habahiro", "cases/resources/skinProductionComposition.test.ts", PORTABLE),
  compiled("resources.default-particle-lease", "resources-skin-habahiro", "cases/resources/leasedDefaultParticlePreparation.test.ts"),
  compiled("resources.source-package", "resources-skin-habahiro", "cases/resources/sourcePackageDecoder.test.ts"),
  check("resources.habahiro.static", "resources-skin-habahiro", "checks/verifyHabahiroStatic.mjs", PORTABLE),
  check("resources.skin.static", "resources-skin-habahiro", "checks/verifySkinSettingsStatic.mjs"),

  compiled("platform.boundary", "platform-browser", "cases/platform/platformBoundaryContract.test.ts", PORTABLE, "historical-boundary"),
  webview2("platform.browser-pixi", "cases/platform/browserPixiDecoder.webview2.mjs", ["cases/platform/browserPixiDecoder.webview2.test.ts", "support/platform/hudWebView2Observation.ts"]),
  webview2("platform.ordinary-rendering", "cases/platform/ordinaryRendering.webview2.mjs", ["cases/platform/ordinaryRendering.webview2.test.ts"]),
  webview2("platform.garupa-product", "cases/platform/garupaProduct.webview2.mjs", ["cases/platform/garupaProduct.webview2.test.ts"]),
  webview2("platform.startup-direction", "cases/platform/startupDirection.webview2.mjs", ["cases/platform/startupDirection.webview2.test.ts"]),
  webview2("platform.mv-live", "cases/platform/mvLive.webview2.mjs", ["cases/platform/mvLive.webview2.test.ts"]),
  webview2("platform.original-settings", "cases/platform/originalLiveSettings.webview2.mjs", ["cases/platform/originalLiveSettings.webview2.test.ts"]),
  webview2("platform.skin-settings", "cases/platform/skinSettings.webview2.mjs", ["cases/platform/skinSettings.webview2.test.ts"]),

  compiled("product-chart.external", "product-chart-external", "cases/chart/productChartExternal.test.ts", [], "product-regression", { optIn: true, timeoutMs: 600_000 }),
]);

export const supportSources = Object.freeze([
  "checks/verifyPixiWorldObservation.mjs",
  "support/rendering/hudPixiAssertions.ts",
]);
