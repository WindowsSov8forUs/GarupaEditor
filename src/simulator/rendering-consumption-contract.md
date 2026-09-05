# Rendering consumption re-audit

Status: **OPEN**. Earlier isolated resource, scene-graph and primitive audits do not close the production renderer. This contract takes precedence over historical aggregate completion statements. Public capability gaps are informational, not reasons to reject otherwise valid launches.

Original authority is the verified, committed and pushed Reverse 10.1.4/230 ARM64 evidence available at `2c14fa7dbe7b78c313d297ca23675dccc7d85b04`. Paths below are relative to its `artifacts/investigations/` directory; production never reads that checkout.

## SRC-SCORE-ANCHOR — runtime anchor, not prefab initial position

Authority: `simulator-production-visual-third-reaudit-10-1-4/simulator_production_visual_third_reaudit.json`, `hud_owner_contract.score.anchor`, and `simulator-multiaspect-layout-runtime-contract-10-1-4/simulator_multiaspect_layout_contract.json` with its ARM64 applySafeArea/SetAnchor/SetAnchorTransform slices.

Score's StarUIAnchor (PathID 1126, target UIWidget 1125) uses Left + Top and ScreenToSafeArea. Runtime anchoring overrides the serialized root position `(-411, 309)`; it does not replace the Base/Progress child transforms.

`applyScoreHud` and `updatePersistentScoreHud` therefore both use `placeSafeTopAnchoredUiRoot(object, "left")`. The Pixi root is `(safe.x, viewportHeight - (safe.y + safe.height))`, with the existing authored UI scale. Child graph, font metrics, rank logic and SoftClip remain independently owned. Life and Auto Live placement are not changed.

The regression was introduced by treating the serialized Score root as the final runtime transform. Checking only copied fields or initial graph TRS missed this override. The anchor correction does not close remaining UILabel glyph/baseline or full clip-consumption coverage.

## SRC-PARTICLE-STRETCH — native non-Freeform head/tail correction

Authority: `simulator-stretched-particle-worker-reaudit-10-1-4/stretched_worker_contract.json`, STR-W01..W11, its six hash-locked ARM64 slices, reciprocal-square-root table and native arithmetic/perimeter extraction. This supersedes the older renderer-domain `nativePrimitiveContract.mode1` centered-quad vectors **and the previous projected-direction explanation in this contract**. The old investigation inspected the dispatcher, not the actual stretched worker.

Current non-Freeform rendering anchors the head at particle position, constructs a tail from camera-space velocity, and derives the side from the head/tail cross-product. Inverse speed uses corrected ARM64 FRSQRTE; side normalization uses two FRSQRTS refinements and the native threshold mask. Zero velocity and camera-axis degeneracy do not select a camera-up fallback. UVs follow head+, tail+, tail-, head- with the long axis along U. `RotateWithStretchDirection` does not authorize unconditional particle roll in this branch.

Production now consumes these head/tail equations, the current stationary camera Z reflection and the renderer scale coefficient; world vertices do not receive emitter rotation twice or an extra subtract/re-add of the head. Side-width limiting occurs before stretch rather than shrinking the final tail bounds. Emission, alpha, particle count, size multipliers and random ownership are unchanged.

Bounded differential scope: 75 native arithmetic rows (six explicit arithmetic inputs plus each of the ordinary renderer-domain's 69 enabled mode-1 parameter profiles) match Float32 output bits. Default-pack mode-1 geometry is also compared with native world-perimeter output projected into the portable viewport. Inputs are explicitly marshalled arithmetic states, not captured gameplay; this does not close owner/simulation/preflight/commit or full renderer consumption.

Still OPEN: complete native min/max camera-uniform consumption (the portable orthographic screen-size conversion is retained), normal stream, full motion worker and final mixed composition. The reciprocal-square-root table executes source instructions in an emulator, not on the fixed device. No whole-renderer or framebuffer acceptance is claimed.

## SRC-PARTICLE-COMPOSITION — open cross-renderer sorting

Authority: `simulator-pixi-particle-visual-reconciliation-10-1-4/simulator_pixi_particle_visual_reconciliation.json` and `simulator-particle-transform-fourth-reaudit-10-1-4/particle_transform_fourth_reaudit_contract.json`. They prohibit one monolithic particle stage before all ordinary renderers. Current renderer layer/order must survive the final handoff; HUD follows the world domain.

Current defect: particle preflight sorts native primitives internally, but commit puts every mesh into one generation under the low stage. The high stage is empty, while `pixiCombinedScene` and ordinary sibling sorting still treat the mounts as separate fixed-depth siblings. Thus native sorting orders do not participate in ordinary/particle composition. This is a production integration gap, not an excluded GPU/driver difference.

Still required: a shared, transitive ordering domain covering ordinary renderer layer/order/Z and concrete particle renderer ownership, without arbitrary high/low thresholds. Detached preflight, failure cleanup and generation publication must remain intact. A mixed-domain comparator cannot invent equivalence between ordinary `sourceZ` and particle sorting fudge, nor assume that root containers describe every child renderer's order.

## Acceptance boundary

The production route is connected: platform composition creates the deterministic particle backend and Pixi particle renderer; simulation samples flow through `buildCurrentParticlePrimitives` into mesh preparation and commit. No bypass to the old simulation has been found. That callgraph fact does not prove appearance or explain all missing particles.

Current ordinary scene/HUD and selected rendering/HUD/Skin gates remain `observational-gap`; Skin settings retains only its static portable resource-selection claim. All-Skin, final mixed composition and terminal particle presentation are not closed by old primitive digests. CS-V1 and Live Auto AP remain product semantics. Application/framebuffer execution is not part of this re-audit; TypeScript and contract checks are compile/integrity information only. No product tests, fixtures or harnesses are added or changed.
