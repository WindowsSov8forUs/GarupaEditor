# Rendering consumption re-audit

Status: **OPEN**. Earlier isolated resource, scene-graph and primitive audits do not close the production renderer. This contract takes precedence over historical aggregate completion statements. Public capability gaps are informational, not reasons to reject otherwise valid launches.

Original authority is the verified, committed and pushed Reverse 10.1.4/230 ARM64 evidence available at `6cddb142806ffdb933cc6a237f69f4dd16e9ca97`. Paths below are relative to its `artifacts/investigations/` directory; production never reads that checkout.

## SRC-SCORE-ANCHOR — runtime anchor, not prefab initial position

Authority: `simulator-production-visual-third-reaudit-10-1-4/simulator_production_visual_third_reaudit.json`, `hud_owner_contract.score.anchor`, and `simulator-multiaspect-layout-runtime-contract-10-1-4/simulator_multiaspect_layout_contract.json` with its ARM64 applySafeArea/SetAnchor/SetAnchorTransform slices.

Score's StarUIAnchor (PathID 1126, target UIWidget 1125) uses Left + Top and ScreenToSafeArea. Runtime anchoring overrides the serialized root position `(-411, 309)`; it does not replace the Base/Progress child transforms.

`applyScoreHud` and `updatePersistentScoreHud` therefore both use `placeSafeTopAnchoredUiRoot(object, "left")`. The Pixi root is `(safe.x, viewportHeight - (safe.y + safe.height))`, with the existing authored UI scale. Child graph, font metrics, rank logic and SoftClip remain independently owned. Life and Auto Live placement are not changed.

The regression was introduced by treating the serialized Score root as the final runtime transform. Checking only copied fields or initial graph TRS missed this override. The anchor correction does not close remaining UILabel glyph/baseline or full clip-consumption coverage.

## SRC-PARTICLE-STRETCH — projected direction versus speed

Authority: `simulator-particle-renderer-native-domain-10-1-4/particle_renderer_native_domain_contract.json`, `nativePrimitiveContract.mode1` and its vectors; also `simulator-particle-transform-fourth-reaudit-10-1-4/particle_transform_fourth_reaudit_contract.json` (projected velocity angle and signed height).

The long-axis direction is determined in the camera XY plane. Signed length remains `sizeY * lengthScale + length(velocityXYZ) * velocityScale`. Normalizing XYZ and subsequently projecting its XY components incorrectly shortens the axis when velocity has a Z component; pure camera-axis motion can collapse the quad.

The formula mismatch is identified but not patched in this batch. Native handling of a zero XY projection with nonzero Z speed, and interaction with outer/alignment rotations, require bounded audit. Reusing the zero-total-speed camera-up basis for that distinct branch would introduce an unproved fallback. No particle count, alpha, emission rate, size multiplier, random owner or geometry behavior is changed.

## SRC-PARTICLE-COMPOSITION — open cross-renderer sorting

Authority: `simulator-pixi-particle-visual-reconciliation-10-1-4/simulator_pixi_particle_visual_reconciliation.json` and `simulator-particle-transform-fourth-reaudit-10-1-4/particle_transform_fourth_reaudit_contract.json`. They prohibit one monolithic particle stage before all ordinary renderers. Current renderer layer/order must survive the final handoff; HUD follows the world domain.

Current defect: particle preflight sorts native primitives internally, but commit puts every mesh into one generation under the low stage. The high stage is empty, while `pixiCombinedScene` and ordinary sibling sorting still treat the mounts as separate fixed-depth siblings. Thus native sorting orders do not participate in ordinary/particle composition. This is a production integration gap, not an excluded GPU/driver difference.

Still required: a shared, transitive ordering domain covering ordinary renderer layer/order/Z and concrete particle renderer ownership, without arbitrary high/low thresholds. Detached preflight, failure cleanup and generation publication must remain intact. A mixed-domain comparator cannot invent equivalence between ordinary `sourceZ` and particle sorting fudge, nor assume that root containers describe every child renderer's order.

## Acceptance boundary

The production route is connected: platform composition creates the deterministic particle backend and Pixi particle renderer; simulation samples flow through `buildCurrentParticlePrimitives` into mesh preparation and commit. No bypass to the old simulation has been found. That callgraph fact does not prove appearance or explain all missing particles.

Current ordinary scene/HUD and selected rendering/HUD/Skin gates remain `observational-gap`; Skin settings retains only its static portable resource-selection claim. All-Skin, final mixed composition and terminal particle presentation are not closed by old primitive digests. CS-V1 and Live Auto AP remain product semantics. Application/framebuffer execution is not part of this re-audit; TypeScript and contract checks are compile/integrity information only. No product tests, fixtures or harnesses are added or changed.
