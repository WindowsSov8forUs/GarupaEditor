# Rendering consumption re-audit

Status: application-scope review is defined below. Historical device, engine-internal and aggregate renderer claims remain unpromoted. Public capability gaps are informational, not reasons to reject otherwise valid launches.

Original authority is the verified, committed and pushed Reverse 10.1.4/230 ARM64 evidence available through `23827f847249b8336379ac12c23bfb2d7f09df44`. Paths below are relative to its `artifacts/investigations/` directory; production never reads that checkout.

## Current application-layer implementation boundary

The Simulator does not use implementation code to erase platform differences. This boundary supersedes historical instruction-exact and Unity-internal consumption requirements below; those reports remain records of their original source revisions, not acceptance gates for the current implementation.

- Particle normals, their singular inverse/Jacobi/QR solver and normal-only validation are removed: the active Pixi particle shaders have no normal input.
- Host sine/cosine, cube root, reciprocal and square root replace ARM estimates, refinement tables, copied trigonometric polynomials and software fused-multiply-add. Standard sRGB transfer replaces the source SIMD color lookup. Particle transforms retain authored spatial semantics without simulating world/local setter round trips or signed-zero instruction sequences.
- Particle storage contains admitted particles only and preserves surviving insertion order; SIMD padding and physical swap-tail/compaction behavior are not application contracts. Authored gradient/curve keys are evaluated directly instead of reproducing Unity internal caches. Seeded random streams, lifetime rules and application emission/update ordering remain explicit.
- Unity-only shadow/probe/ray-tracing/instancing states and investigation commit/hash gates are not runtime prerequisites. Resource byte identity, topology, material inputs and application ownership checks remain.
- Score text uses host font measurements and a width fit, without original CharacterInfo tables, Android crispness branches or clip-center rounding corrections. The authored spacing, colors and alignment remain. Historical C49/C50/C220 numeric layout conclusions do not apply to this host text path.
- Production disables diagnostic particle frame retention and polls compact backend status. Recording/offline backends and explicit diagnostic snapshots remain useful verification interfaces.

Historical normal output, storage-row, internal-cache, world/local round-trip and instruction-exact numeric comparisons are retired for these consumers. Compilation and contract checks do not establish original-client or device equivalence. No original binary/runtime or visual capture is required to remove unused implementation.

### Current application-scope dispositions

The acceptance domain is the supported ordinary single-song Live/Rehearsal × Manual/Auto routes, registered default/Skin resources and original-compatible chart behavior. Host math, font measurement, graphics and audio remain the interfaces specified by evidence-workflow.md. Garupa chart/CS-V1/Auto-AP extensions retain their own contracts. The following closes the named source-rule and consumption questions, not arbitrary Unity execution or all product-host defects.

| Consumer | Source and current disposition |
| --- | --- |
| Chart, clock, input and note state/geometry | Existing input/timing/scoring, four-mode and note-world-scale results remain applicable to unchanged rules; original-compatible routing is separate from Garupa continuous lanes/SV/extended Slide. See live-rehearsal-contract.md and garupa-extension-contract.md. |
| Record, HUD reflection and end selection | CS-V1 numeric score is explicitly product-only. Original Combo/Life/OneFrame rules remain source-bound. The frame-end branch now selects clear before Life-zero Game Over, after reflection; GameState 8/11/12 publication is explicit. See live-rehearsal-contract.md and the timing correction below. |
| Particle birth/update/death and random ownership | Reuse current clock, emission, frame-step, gradient, motion, Play/seed and 59-source prewarm results. Simulation/random source hashes are unchanged by end-branch repair. The four lifetime-rounding boundary probes and analytic floating residuals remain platform differences, not bitwise PASS. Nonempty native Play and forced padded-emission probes are not reachable through the supported fresh Stop/Clear/Play inputs. |
| Particle geometry, bounds and projection | C147–C202 bind current actual/analytic bounds and button/Slide/Game-clear transforms. Current samples always supplies rendererWorldBounds; all three owner kinds publish nativeOwnerHierarchy. Thus current production does not use the legacy primitive-union fallback. The positive-PPU orthographic projection maps world min/max to viewport bounds with Y reflection; its six interval comparisons implement the current camera volume. Host matrix/trigonometric arithmetic replaces the retired instruction-level proofs. |
| Shared draw order, material and clip consumption | SORT-01–10 and the current shared-order results cover application keys and ordinary/particle registration. Pixi consumes primitive order/distance in the common layer; Game-clear order 50 remains below HUD order 100. Current 102-material handoff is closed below; all 73 Cull Back references are disabled. Native allocation-dependent ties, unused normal streams and GPU submission are excluded. |
| HUD, settings and media | Authored HUD graph, anchors, clip uniforms, colors, spacing and settings/Skin selection retain source bindings. Host-measured glyph widths are fitted to the source layout. AddScore, result visibility and high-rank clocks are corrected below. Existing startup/pause/MV results are reused; delayed MV continues during clear, then actual background completion gates exit. |

Within the listed supported application rules and current source-resource inputs, the source-level alignment review is closed: no unresolved application-algorithm differences or necessary evidence gaps remain in this scope. This uses existing independent source outputs plus current consumer review and focused execution of changed methods; it is not a new full-suite or device run. Historical OPEN paragraphs below describe their original investigation scope and must not recreate excluded engine work. Host numerical/raster behavior and the existing excluded features remain outside this conclusion.

The terminal-state loss from surface replay is resolved by the [canvas-fit host policy](adaptive-layout-contract.md#surface-revision-disposition): resizing preserves the running engine and only transforms the display canvas. The obsolete surface replay route is removed. This is a product-host correction, not a new original Unity resize or device-rendering claim.

### Current material consumption and culling relevance

Reverse `550ebb355acc9830228c221118a4e7632494cbec` binds the 102 material color/mask operations and the original renderer enable states to the current production consumers. The 13 Standard Unlit materials with Cull Back have 73 renderer references; all 73 are disabled in both the original serialized domain and the product catalog. `samples` and `buildBindings` exclude them. Enabled references use Cull Off, so no winding or front-face emulation is required for their output. Material color expressions, color masks, their production handoff and enabled-reference culling have zero differences. Runtime enable/keyword overrides and device raster equivalence are not claimed; material configuration alone must not reopen the retired winding investigation.

## HUD-ADDSCORE — per-update phase transitions

The existing pushed `resource-pixi-rendering-runtime-contract-10-1-4/arm64/0387a260__AddScoreObject_playCoroutine_d__11__MoveNext.arm64.tsv` is the source for the three 0.14-second phases. At each resume, the previous phase time is compared with its duration before adding the current delta; crossing a phase resets its clock, without carrying overshoot. The final phase completes on the following resume. The first resume also runs immediately on Play, including a zero-delta start. Reverse `552433d0dea66a0aa67c28f335e3430a9db323c6` separately establishes local X increments +8/+1/+1, superseding the older Y interpretation.

The transactional render owner now carries the phase, phase time, accumulated X offset and raw alpha. Pixi consumes the committed position/alpha instead of selecting a phase from total elapsed time or ending at a fixed 0.42-second deadline. Every new Play in an outer frame receives that frame's delta; only advancing existing animations is once per outer update. Pool/depth cycling, pause and discard semantics remain unchanged.

Source-branch review and direct execution at zero, 0.1, 0.2 and exact Float32 0.14-second deltas agree on phase resets, increments, raw alpha and completion. At 0.1-second cadence the active resumes produce X offsets 8,16,17,18,19,20 before completion, rather than selecting later phases from global elapsed time. TypeScript compilation verifies the command handoff. This closes the AddScore phase rule; it is not a device cadence or raster equivalence claim.

## HUD-CLOCKS — independent animation and visibility clocks

The source-bound `simulator-score-ngui-native-domain-10-1-4/score_ngui_native_domain_contract.json` gives the high-rank clip a 3-second loop, BigStar alpha tweens 0.8-second legs and Flash a 1-second leg. The producer no longer wraps their shared elapsed input at 3 seconds; each consumer uses its own period. Direct production sampling at 0/3/6 seconds gives BigStar alpha 0.4/0.475/0.55 and Flash 0/0.3/0, preserving the independent cycles instead of resetting all alpha at each clip loop.

`resource-pixi-rendering-runtime-contract-10-1-4/arm64/032ac710__CE_Result_showCoroutine_d__31__MoveNext.arm64.tsv` compares the previous visibility time with 1 second before adding delta. `CE.Result.Show` starts that coroutine immediately, while GameJudge starts at animation time zero. The producer now carries both clocks transactionally and hides on the source comparison. Actual producer-method execution with initial delta 0.1 followed by 0.95/0.01, and initial delta 0.9 followed by 0.2/0.01, preserves the first sampled frame and hides on the next resume. Compilation and command classification pass; no product tests or fixtures were added.

The older Combo one-second-hide interpretation is superseded by `simulator-hud-particle-pause-terminal-strict-reaudit-10-1-4`: current ComboNumber.Show starts Animator, not the dormant show coroutine. Combo remains visible after its scale animation and is unchanged. BND-C184/C185's 58 scene-bound Game-clear ParticleSystemRenderers all have layer 0/order 50; current HUD order 100 is above their shared draw layer. This ordering boundary needs no new engine emulation and does not assert native allocation-dependent ties.

## Game-clear application timing correction

Reverse `2c7bc211294ea24f09da342bc51dce34a38f9cec`, `simulator-game-clear-native-domain-10-1-4/game_clear_timing_correction.json`, supersedes all fixed 3.233-second/15-ms interpretations below. Those values describe one runtime observation. Original `GameObjectUtility.WaitForSeconds` compares the previous elapsed time with `f32(0.2)` before adding the current delta; the base Animator then starts at zero. The original AnimationClip emits `ClearAnimationFinished` at its own time 3. FC/AP starts immediately on a separate timeline. Completion waits for full-combo character voice and background completion before exit; current supported sessions have no character voice, and MV completion is checked after the clear animation, not before starting it.

The engine owns this timeline transactionally. Base particles retain serialized inactive state during the wait and consume their own shifted activation keys; FC/AP keys retain their original times. Game-clear phase validation checks adjacent endpoints rather than requiring reassociated Float32 sums to be identical. The assembly releases host resources on the scheduler turn after the completed presentation is published, without a device-derived timer. Observed duration fields in historical resource metadata no longer gate parsing or drive production.

Validation: original binary ranges and serialized event checked before Reverse delivery; 272 activation-key comparisons across clear statuses 1/2/3 and two delayed starts; direct execution of actual profile parsers, particle owner, frame validator and discard/commit paths including zero-time start, large jumps and elapsed time beyond the old deadline; direct Standard/MV completion ordering checks. TypeScript and the runtime contract check pass. No product test files, fixtures, app runs or visual evidence were added. This closes the named timing/exit defects, not the overall renderer parity declaration.

## SORT-01 — renderer distance prefix

Current status (2026-09-08): the C173 comparator-prefix differences are repaired. This supersedes the historical 136-difference statements below; the complete renderer contract remains OPEN.

Authority: Reverse `ce1b2033d81c49dacb9ff109c220ddcb31220d36`, verified and pushed before consumption. The unchanged `simulator-particle-bounds-calculation-10-1-4/particle_renderer_sort_distance.json` (SHA256 `6A780A7D929FB45B244B2CFCA7C3282011505089C36703682CD0B2C316915A92`) executes original81B464 metric1 and81A11C on unequal layer/order or distance keys, with the gameplay reflected-Z camera at `(0,0,-15)`.

`DeterministicParticleSimulation.samples` computes the Float32 camera distance minus sortingFudge once per renderer from `currentActualRendererBounds`, publishes its bits, and orders samples by that distance after layer/order. `buildPrimitive` carries the same value into primitive sorting. This replaces lexicographic sortingFudge in both consumers. Original multiplication/addition/subtraction rounding order, including zero products, is preserved. C151's599 source inputs/1741 references, including1280 native-eligible references, never take the former undefined-bounds guard; that obsolete guard is removed without substituting a particle-position center. C109's seven source mesh profiles match four original Mesh cache identities.

All91 distance bit patterns and180 comparisons per consumer agree, eliminating136 baseline differences;360 primitive distance transfers agree. Affected Slide and game-clear bounds wrappers (438/414 calls) and complete sample/world vertex-normal consumers (1410 View,540 Local and460 game-clear live rows) remain exact. Both noEmit checks and runtime audit1438 pass as compilation/integrity only.

Reverse `4ff1bf855b151e6f7b1853d8c9bf110323e870de` extends the same oracle to the final Pixi admission comparator and its actual rejection condition. `compareSamples` now consumes rendererSortDistanceBits and finite-bit validation requires this field. All three180-comparison sets and180 admission decisions agree. The third comparator previously had68 differences, producing3 false rejections and65 false acceptances; this downstream omission is now repaired.

The comparison corpus fixes layer value0, queue3000 and explicit camera inputs, and excludes equal-key native ties. Source-domain/cache checks do not prove complete current cache or lifecycle occurrence. Frustum/group/override, current camera/material draw-record production, native final ties and ordinary/particle composition remain OPEN. No application, product tests, build or visual acceptance is used.

## SORT-08 — per-note start depth

Reverse `b74fa56878cf18ba5fae188d21f462747919945b`, SORT-C43 `note_start_depth.json`, restores the Z component of `NoteBase.getStartPos` omitted from the earlier geometry profile. Launcher start positions have source Z zero. Activation adds the original signed `absolutePos` and `buttonType` terms using the native Float32 conversion/multiplication/addition order; a fixed `-13.5` is not the note depth algorithm. Ordinary roots and Slide child sources consume their own information. Long after objects retain the head information's depth while scheduling movement with the separate end time.

The production arithmetic agrees bit-for-bit with248 original ARM64 instruction-window cases. Root/Slide bindings, Long inheritance and launcher zero publication are statically checked. World/local Transform setter rounding and full material/resource/node ties remain separate open consumers; this repair does not claim final Live renderer depth or whole-simulator equivalence.


## SORT-09 — parent-space position writes

Reverse `b591dec690ad1141b1130ef0d365225f6e527872`, SORT-C44 `note_parent_position.json`, binds InGameIPhoneXAdjuster.Awake and the canonical NoteParentTrans538. High-aspect devices assign `ScreenToSafeAreaRatio * (1 + clamp01(HighAspectRatio) * 0x3D8F5C30)` with the original Float32 writes; other devices retain serialized unit scale. Scene layout supplies this explicit scale to note motion.

Root and Slide activation perform the original world-to-local-to-world position conversion. Ordinary Move, synthetic activation adjustment, Long/Slide children and manager state retain the resulting world Z after each write. Sorting records receive the updated world depth. Unity's FRECPE plus two FRECPS steps are preserved; local note scale still uses the requested Y before the Transform conversion. Native expected covers25 layout cases,1536 round trips,1536 Move calls,1536 Long child calls and672 activation-adjustment calls. Root/Slide initial binding and manager/command propagation are source checked.

This closes position-write rounding for the canonical zero-translation, identity-rotation ancestors and positive uniform layout scales. Final renderer world scale, changed hierarchy/animation inputs, complete resource keys and full simulator equivalence remain open. Existing tests received only explicitly authorized parent-scale inputs; no new fixtures, snapshots or visual acceptance were introduced.



## SORT-10 — note world scale and sync margins

Reverse `44f66cc07bb1ccff37d2bb9634847fbff9da7801`, SORT-C45 `note_world_scale.json`, executes the original complete hierarchy matrix path and independent `Transform.lossyScale` getter8C8984. For the canonical zero-translation, identity-rotation parents, both yield the Float32 product of local note scale and the C44 parent scale, including the moving note's zero Z scale.

Seven root/Long-after/Slide-child activation and frame publications now fold the parent scale into their world transforms. Motion state retains local scale for mesh consumers. NoteManager supplies independently derived world X scale to both sync-line edge-margin targets while preserving their local X scale for the line-width calculation. Forty-eight original matrix/getter cases produce288 matching axis comparisons; publication sites and local/world separation are source checked. The C44 position-write audit remains exact.

This closes canonical note scale publication and sync margin ownership. Arbitrary hierarchy/animation changes, complete material/resource/node keys and overall equivalence remain open. No new product tests, fixtures, snapshots or visual tuning.


## SORT-06 — common gameplay draw order and parent depth

Authority: pushed Reverse `0e6e31f1f6d78ce33891f707a188885f0cdba2f7` (C204 native Sprite world bounds/distance), `559c6f08846c4d09b30d6ff5f95a9bb4ec0f6c14` (C39 native renderer types/defaults and C203 cross-type branches), and `cf2c7db5713ed04bb63b7a4c89a51cc9ffc4f9a3` (independent actual-consumer audit). C204 `ordinary_sprite_world_bounds.json` SHA256 is `8CC4BFBA2579674362BD2F0C0B899E189C9CE5C0C2AE5F14CA7DF02BFF4819F5`. C173 camera-distance expected is unchanged.

Production composition gives both Pixi backends one RenderLayer. Particle meshes and registered ordinary note, belt, sync-line, judge-line, lane-effect and HAB flash draws share sorting-order, native world-center distance and renderer-type comparison. This removes the particle generation's fixed lower draw stratum for those consumers. Note Sprite leaves register individually so root/icon ordering does not duplicate child collection; masked belt/field draws keep their own containers. Logical parent transforms, alpha and visibility remain owned by the original scene graph. Changes invalidate cached draw instructions; failed particle attachment removes only candidate registrations, and terminal/disposal paths detach the layer.

Native NoteBase.Move Z scale0 is transported separately from XY scale, including command freezing/copying. Child local Z and animated Z compose through explicit parent scales before native camera distance. Full-matrix-before-bounds rounding is retained for the current planar transform domain. The independent audit agrees on37 depth/leaf bindings,15 motion-scale transfers,180 prefix comparisons and12 cross-type comparisons. Existing ordinary ordering/pose checks and all three particle prefix consumers remain exact. Both TypeScript noEmit checks and runtime classification pass; Pixi collection/cleanup was reviewed statically, with no application, product test or visual execution.

This is a bounded integration repair. Same-type ordering still retains the existing sequence after the verified keys; it is not native material/resource/node equivalence. Multiple-directional line ordering publication, full runtime group/bounds/camera overrides, full quaternion input reachability and complete scene/HUD composition remain OPEN. The layer's application phase position is not a native sort key. Static mask/transaction review does not claim dynamic device validation.

## SORT-07 — multiple-directional back-line publication

Authority: pushed Reverse `8066fb8a69b92b487b6c0ec27788fdab8ac6b4b1`, SORT-C40. The current APK ordinary inventory now includes both native LineRenderers (53 renderers total; the previous51 records remain unchanged). Multiple-directional back-line source order0 and world-coordinate mode are distinct from sync-line AwakeEnd order69. The twelve existing mapped back-line method bodies,632 instructions, were verified against the locked binary; their known class route does not write either setting.

`preflightOrdinaryMultipleDirectionalLine` publishes an identity transform and explicit source order0 before world-space geometry, preserving the pool creation sequence. This supplies the existing common-layer registration prerequisite instead of leaving the line in its previous scene stratum. Four actual left/right activation/update paths and backend transfers now agree, removing four missing-publication discrepancies. Retained ordinary and shared-sort audits, both noEmit checks and runtime audit1442 pass. Endpoint generation, width/color/material state, external mutations and native same-type ties remain separate consumers.

## SORT-02 — ordinary root sorting-order producer

Authority: Reverse `36ea69f8a1f526d511b945db9e7a4ee5df08483f`, verified and pushed before consumption. SORT-C32 in `simulator-renderer-sort-consumption-10-1-4/renderer_sort_consumption_contract.json` (SHA256 `2C9994909A511F4C45E0FD71E15F8F969C1F3A69799CC43182CE16502AC04737`) binds the current NoteBase root SpriteRenderer field+0x58 to original literal70 and the separate directional Flick icon field+0x48 to71, with checked LDR/MOVZ/BL operands and the Renderer sorting-order setter wrapper.

`RenderCommandProducer.preflightOrdinaryNoteActivation` now assigns70 to the root for directional fronts as well. The previous branch assigned71 to DirectionalFlick and MultipleDirectionalFlick roots. The independent `audit_particle_renderer_sort_distance.py --ordinary` executes the actual ordering initializer, first root transform publication and Pixi field transfer against the original root assignment on seven named front types. The two baseline root-field differences are removed; this does not close icon producers, full activation callbacks, world bounds/native ties or shared ordinary/particle composition.

## SORT-03 — simultaneous-line sorting-order producer

Authority: Reverse `0a0e3615ec07eca58bfb9609e318c98954438059`, verified and pushed before consumption. SORT-C33 in `simulator-renderer-sort-consumption-10-1-4/renderer_sort_consumption_contract.json` (SHA256 `7003FD5CE4CE5AF62259EB87751E1FBA8409DE5221BD8CA8C3982EBEC8631304`) binds NoteSyncLine.AwakeEnd's LineRenderer field+0x20 to original literal69 and the sorting-order setter tail-call.

The ordinary fixed-pool line now publishes its identity transform and order69 before its world-space geometry, on activation and updates. The extended product line changes order0 to69. The existing gameplay grouping remains3; it is not the original sorting-layer value. Independent actual command/ordering-helper and backend-transfer checks remove all three baseline discrepancies and preserve all seven root cases. Line geometry, native bounds/distance/ties and shared ordinary/particle rendering remain separately OPEN.

## SORT-04 — runtime note belt sorting-order producer

Authority: Reverse `a356dcd0be704879ac19dd04be007cdafe3854dc`, verified and pushed before consumption. SORT-C34 in `simulator-renderer-sort-consumption-10-1-4/renderer_sort_consumption_contract.json` (SHA256 `A904F7A62CE937C05D0BB6B19061E1E237104BEEC6D14D31E0CDB431BB098FCF`) checks the original NoteMesh/NoteMeshAdvanced MeshRenderer field+0x48 and literal60 setter calls, including the X21 field-address alias in NoteMesh. Serialized PreviewNoteMesh order0 is a different renderer.

Ordinary Long/Slide belt activation and the extended Slide belt now publish60 instead of0. The independent ordinary audit executes all three actual transform publications and backend field transfers; the three differences are removed while the seven root and three simultaneous-line cases remain exact. Motion updates retain this order and update mesh geometry. Native bounds/distance/material/ties and common scene composition remain OPEN.

## SORT-05 — independent note icon ordering

Authority: Reverse `4d6343232241ade4e8546b97a2e633f88724111e`, verified and pushed before consumption. SORT-C35 in `simulator-renderer-sort-consumption-10-1-4/renderer_sort_consumption_contract.json` (SHA256 `FA486A8764E36F66CBEFD4823F2CAF33E1BBCBC1C5E2F1C317E69C8E3B4AEAEC`) checks the root-to-icon getter/setter copy and directional front/add/after writers. C30 `serialized_sort_ordinary.json` (SHA256 `D7A670A2D79FA81B0D147A6BA24E0A3791B05E32F2D6B6C621BDECE5D81AC94A`) retains both Long/Slide TouchingFlash renderers at71.

Ordinary Flick icons receive70; directional Flick and long-flash icons receive71. The three HAB transform sites now preserve that distinction through activation, adjustment and motion instead of publishing72. Ordinary front/after/slide-child animation starts publish their independent child ordering before binding and playback. Eighteen role/site probes execute actual publication helpers and backend transfers with zero differences, replacing nine wrong HAB orders and nine missing ordinary publications. Seven root, three line and three belt cases remain exact. These explicit role adapters do not assert every role occurs at every callsite; world geometry, native distance/ties and independent common-layer rendering remain OPEN.

## ICON-PARENT — preserve native child transforms

Authority: Reverse `a46fb9be6aa16df2560a4f0e1028156c1aa84110`, verified and pushed before consumption, extends the ordinary audit over the unchanged C30 serialized source cited above. For seven front/add families, each icon/TouchingFlash Transform points directly to its note prefab root. Initial Flick local position is `(0, Float32(0.7), 0)`; TouchingFlash is `(0, 0, -1)`; both use unit scale.

HAB icons now belong to their note root, so local animation offsets retain parent position, scale and visibility. Initial transforms use the source local pose, also for ordinary animation children. The two repeated HAB world-transform publications are removed: adjustment and motion flow through the parent instead of overwriting the child's animation pose. The parent identity and twelve initial-pose checks remove13 baseline discrepancies. Seven root, three line, three belt and twelve retained icon-order publications/transfers remain exact. This supersedes SORT-05's three independent HAB transform sites; full world matrices, animation interpolation and common native renderer ordering remain independently OPEN.

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

C95/C96 below closes the source-orthographic raw-size/limit and side-basis scope, replacing the portable screen-height conversion. Current camera-uniform mutation/owner association, normal stream, full motion worker and final mixed composition remain OPEN. The reciprocal-square-root table executes source instructions in an emulator, not on the fixed device. No whole-renderer or framebuffer acceptance is claimed.

## SRC-HAB-PARTICLE-RANGES — recover authored width prefabs

Authority: `simulator-habahiro-particle-range-selection-10-1-4/habahiro_particle_range_contract.json`, HPR-C01/C02. Original Setup instruction slices, ELF/GOT/metadata literal bindings and full source-object byte roundtrips establish eight GamePlayButton families with seven width slots in the multi-range branch. The false branch initializes only index 0, not seven aliases. `effect_tap` is a separate scalar.

The previous catalog retained only the nine base roots (66 systems), losing 366 systems in the authored width-2..7 prefabs. The independent source delta restores all 57 particle roots and 432 systems, retaining exact physical paths, component identities, TRS/parent flags, profiles and renderer relations. The old 1,375-system selected-domain inventory/hashes remain historical, not silently expanded or relabelled.

Preparation requires the full source-bound HAB prefab set before publication. Logical command roots remain unchanged; GamePlayButton width selects the physical prefab in Play, incremental activation and concrete-instance construction. Stop/Clear/restart keeps the existing owner/width identity. No alias, nearest-width selection, scale/emission/alpha adjustment or definition-global random stream is introduced. NoteSlide uses its independently evidenced unsuffixed TapKeep pool, not the button width array; outer `n` and ParticleSystem `g` remain separate.

Bounded independent consumption audit: all 432 serialized system/profile/module/renderer relations and all 57 native-bound prefab lookup entries agree; the other 26 resources and renderer/mesh tables are unchanged. This is not complete lease/preparation execution, original Setup/Play state, global random allocation order, geometry, sorting or framebuffer evidence. Restoring omitted resources does not close those remaining lifecycle/rendering gaps.

## SRC-PARTICLE-COMPOSITION — open cross-renderer sorting

Authority: `simulator-renderer-sort-consumption-10-1-4/renderer_sort_consumption_contract.json` with `serialized_sort_camera.json`, `serialized_sort_pipeline.json`, `particle_bounds_inputs.json`, `serialized_particle_eligibility.json` and `particle_bounds_invalidations.json`, SORT-C01..C27, with hash-locked ARM64 slices, ELF RELA bindings and current APK object identities. Earlier `simulator-pixi-particle-visual-reconciliation-10-1-4/simulator_pixi_particle_visual_reconciliation.json` and `simulator-particle-transform-fourth-reaudit-10-1-4/particle_transform_fourth_reaudit_contract.json` identify the monolithic-stage gap but do not define the complete native comparator.

The nonopaque drawing-settings branch uses criteria `0x17`: packed signed layer-value/order (not numeric layer ID), signed material queue, computed distance and concrete record/state ties. Fudge participates in distance; it is not an independent ascending key before depth. Renderer priority is not enabled by this criteria mask. Final ties are not particle birth order or semantic string IDs.

Native camera construction/reset imports global transparency mode/axis. The current APK has global mode 0, axis +Z and an orthographic GameCamera. A later writer is now identified: UICamera.Start sets camera mode 2 for its nonzero event-type branch; current UICamera1061 has eventType 3. Both paths select distance metric 1 (view-space Z minus fudge), not custom-axis metric 2. This is not proof that the global default remains untouched.

Seven current pipeline MonoBehaviours are fully decoded using freshly original-binary/metadata-derived type trees, with native-header agreement and byte-exact reserialization. Camera renderer index -1 resolves through asset default 0 to UniversalRendererData7166, not Renderer2DData7165, conditional on the current asset and no later override. Serialized quality pipeline overrides are all null. Both CreateDrawingSettings overloads preserve camera-derived sorting settings while setting criteria/pass names. The active outline feature passes opaque queue range 0..2500 to DrawRenderers; the source-linked ordinary particle materials all use queue 3000, so this is not a second ordinary transparent pass. Global shader-parameter consumption, native filtering, later assignments and full renderer reachability still require review.

Ungrouped particle sorting uses renderer bounds center, copied from Renderer+192 through node+128. Bounds publication derives its center from runtime min/max and applies the space-dependent transform. Upstream, `proceduralSimulationSupported` flags select actual-particle reduction versus analytic bounds; therefore neither emitter roots nor a simple union of particle/primitive positions is a justified substitute. The eligibility base rejects enabled ExternalForces, LimitVelocityOverLifetime, RotationBySpeed, Collision, Trigger, SubEmitters and Noise, with initial checks on simulationSpace and stopAction. These identities are bound by original icall records and native getters, not inferred from module layout. RotationOverLifetime has separate curve admissibility checks; the helper examines endpoint times, infinity fields and adjusted key count, not only constant curves. The additional bindings identify gravityModifier mode (not lifetime mode), shape arc/radius modes and RotationModule's serialized `curve` alias. Runtime mutation/invalidation and both bounds algorithms remain open. The draw-record constructor also has a table-entry substitution branch that replaces position/key and zeroes fudge; its reachability remains an independent gap.

A bounded native extraction now executes the original eligibility predicate with fresh, full-read, version8, byte-roundtripped serialized inputs for the cited 1,375 systems: 992 return eligible and 383 ineligible (enabled renderers: 764/383). Disabled Emission fields are read from raw objects rather than defaulted from an enabled-only profile. This is not observed Play state or proof that later invalidation is absent. The 366 width-suffixed HAB systems remain outside that historical eligibility domain. HPR-C01/C02 separately establishes their conditional button-array selection and restores their source profiles (see SRC-HAB-PARTICLE-RANGES); it does not extend the predicate results to their Play state.

Positive runtime invalidation paths are now bound: both SetParticles wrappers reach a core that writes runtimeData+34 before its count branch; Emit parameter/old and managed-job-handle paths contain conditional writers; the SubEmitters helper writes returned children's flags. Count emission and job scheduling have distinct targets. This is not an exhaustive alias/store inventory or proof that current owners never reach these paths, and does not close actual Play state or bounds.

Current defect: particle preflight sorts primitives internally using layer ID/order/native distance/priority/owner/birth keys whose final ties do not implement the complete native comparator, but commit puts every mesh into one generation under the low stage. The high stage is empty, while `pixiCombinedScene` and ordinary sibling sorting still treat the mounts as separate fixed-depth siblings. Thus native sorting orders do not participate in ordinary/particle composition. This is a production integration gap, not an excluded GPU/driver difference.

Still required: a shared, transitive ordering domain covering concrete ordinary and particle renderer records, their layer value/order, material queue, source-bound sorting position and native ties, without arbitrary high/low thresholds. Detached preflight, failure cleanup and generation publication must remain intact. A mixed-domain comparator cannot invent equivalence between ordinary `sourceZ` and particle sorting fudge, nor assume that root containers describe every child renderer's order.

## SRC-PARTICLE-BOUNDS — source inputs bound, production calculation still open

### Complete mesh inverse and source normal output (BND-C117 / C119 / C123 / C124)

Reverse `9fb0aa7cce9c79ea4b4f78b45f626acf6cf9fbd4` was verified and pushed at remote0 0 before consumption. C117 original inverse/normal stores and C119 partition bind the implementation; C123 `particle_mesh_inverse_probes.json` SHA256 `89A052C378D09D5A52B10FB79A5C572AE12F3CF663AE6223DAC059380B0AA1C7` adds316 native source Transform matrices and18 explicit finite nonorthogonal/rank0/rank1/rank2/near-singular/scale probes. No source mesh dispatcher association is inferred from those extra numeric inputs.

Mesh normals now consume the same masked/scaled position-matrix columns as vertices. Native inverse scaling/cofactors, full singular inverse (five Jacobi sweeps, signed sorting and three QR rotations), reciprocal cutoff, transpose and normalization replace separate generic inverse-size/quaternion operations. The complete sourceGeometry normal output matches all896 cases/74368 normals, clearing the remaining838 cases/195206 differing components. Original inverse896/224 singular calls plus334 additional inputs/8 singular calls and normalization74368 remain zero. Scalar vertices448/37184 and3D nonunit336/27888 remain zero; both noEmit checks and runtime audit1438 pass. The old size argument is explicitly unused because precise sample fields now supply all geometry sizes.

This closes those explicit identity-Local/zero-center/offset/no-flip numeric normal stores, including endpoint and degenerate sizes. Current source stream/format admission, nonidentity basis/outer owner/View composition, final portable normal publication, full lifecycle/bounds/sorting/HUD and aggregate equivalence remain OPEN. No tests/app/build/visuals.

### Shared mesh position columns (C120)

The existing native mesh matrix-column calculation is extracted unchanged for reuse by the pending normal inverse implementation. Scalar448/37184 and3D nonunit336/27888 vertices remain byte-identical to original stores; no new algorithm equivalence is claimed. Both noEmit checks and runtime audit1438 pass. Reverse `43aa57b242c693c66ccc72fb2f19c47ee7ca1a9b` registers the inverse partition on immutable C117 expected. Full normal838 differing cases and the aggregate OPEN boundary remain unchanged.

### Mesh normal normalization (BND-C117 / C118)

Reverse `e936055267960572d14c3fbad5b6786211786fb7` was verified and pushed at remote0 0 before consumption. Corpus `particle_mesh_normals.json` SHA256 `3ACCA140FE7880A0260F38169D5E8F2D342F9C975708949B95DC46145AEB0966` executes896 full mesh matrices, native inverse preparation including224 singular10EFB00 calls, and74368 actual Float32 normal stores. Interleaved position/normal/tangent branch and Float32 inputs are explicit; current stream/format association remains OPEN.

The actual mode4 normalization consumer now uses native paired Float32 sums, ARM64 reciprocal-square-root estimates and two FRSQRTS refinements, clearing below-threshold vectors to zero. On native pre-normalization vectors,74368 calls match exactly, clearing49710 differences. This does not close the preceding matrix inverse: the full normal audit still has838 differing cases/195206 components (previously876/197932). Scalar vertices448/37184 and3D nonunit336/27888 remain zero; both noEmit checks and runtime audit1438 pass. Current matrix/axis/storage/View/owner/full streams/lifecycle/bounds/sorting/HUD and aggregate equivalence remain OPEN. No tests/app/build/visuals.

### Scalar mesh vertex consumption (BND-C115 / C116)

Reverse `ade2821641cd0f3c067fbaf1fabdb28434c40398` was verified and pushed at remote0 0 before consumption. Corpus `particle_mesh_scalar_vertices.json` SHA256 `D82706371A1C062134200AB74F350208DA35DB4498F7E2EE02AE748326585A4A` continues the full scalar matrix helper through actual Float32 vertex stores. It crosses exact source meshes/pivots with unit, uniform, nonuniform and reflected scales, zero size, two boundary ages and default+Z axis under explicit scalar storage/identity Local basis/zero center/offset/no flip inputs.

Actual complete sourceGeometry matches all448 cases/37184 vertices. No algorithm change is required in this scope; C114 compilation remains the applicable unchanged-code check. Source X/Y numeric angles are ignored by the original scalar branch. Current axis overrides/storage/angle cooccurrence, View/outer owner/projection, normal/full stream publication/lifecycle/bounds/sorting/HUD and aggregate equivalence remain OPEN. No tests/app/build/visuals.

### Default mesh scalar quaternion (BND-C113 / C114)

Reverse `6c51fba63e8cd1046d82dba2118e8aabb823c2c8` was verified and pushed at remote0 0 before consumption. Corpus `particle_mesh_scalar_axis.json` SHA256 `00C9BF184B73DD40C1942F6873D22332781F9C1369BEE49A5258148A8878E935` binds the original global initializer and RELA-bound Initial reset to default axis+Z, then full105FD50 on1122 source calls/4488 axis rows. Existing birth outputs remain unchanged. The separate axis-storage flag is explicitly enabled; this proves default initialization, not absence of later overrides or current allocation.

The actual mode4 scalar consumer now uses only rotationZ, native half-angle Float32 folded polynomials and original zero-offset quaternion multiplication order. All255 native quaternions match, clearing255 differences including signed zeros and trigonometric rounding. The native normalization result for this default axis is exactly+Z. Existing3D144, unit112/9296 vertices and nonunit336/27888 vertices remain zero; both noEmit checks and runtime audit1438 pass. Current axis/angle/storage producers, nonzero offset, scalar full vertices, View/owner/full streams/normals/lifecycle/bounds/sorting/HUD and aggregate equivalence remain OPEN. No tests/app/build/visuals.

### Mesh Transform scale composition (BND-C111 / C112)

Reverse `bf503f628aa63bde89e29e5d1a06de033ef0bb32` and adapter correction `2bdd97624aaf712042384caeadf9f3687cbda296` were verified and pushed with remote0 0 before consumption. The mesh path now retains raw particle size separately from Transform scale: each rotation-column component receives its corresponding Transform axis before the column's raw size. Actual complete sourceGeometry matches336 original uniform/nonuniform/reflected scale cases and27888 vertex stores, clearing84 differing cases/17430 coordinate components. Unit112/9296 and endpoint288 remain zero; both noEmit checks and runtime audit1438 pass.

All160 current mesh references match C81 source identities and unit scales under its source-unit-setup boundary. The additional nonunit inputs are explicit algorithm probes, not current setup/owner reachability. The auditor supplies raw-size/scale fields in the actual xBits/yBits/zBits form; its earlier unused array adapter was corrected without changing native expected or baseline differences. Identity Local basis, zero center,3D storage and zero offset/no inversion/no flip bound this result. Current scale/matrix/axis producers, scalar/View dispatch, outer owner/projection/full streams/normals/lifecycle/bounds/sorting/HUD and aggregate equivalence remain OPEN. No tests/app/build/visuals.

### Source mesh pivot and matrix vertex consumption (BND-C109 / C110)

Reverse `959ed94b596b582099efd5800219b152e6fabaee` was verified and pushed with remote0 0 before consumption. Fresh1741 system roundtrips bind160 enabled mode4 systems, four serialized meshes and seven mesh/pivot profiles. Original mesh-cache min/max arithmetic, descriptor copies and Local-worker pivot preparation feed complete12BC4AC; actual12BBA44..12BBB58 writes the expected vertex coordinates. Production now resolves the exact mesh bounds by serialized SHA, applies the original pivot sign/half-width/doubling order, scales quaternion-derived matrix columns before vertex products and adds pivot translation last. No vertex-extents approximation is used.

Actual complete sourceGeometry matches all112 cases/9296 vertices, clearing40 differing cases/5277 coordinate components. Mesh endpoint288 and3D quaternion144 comparisons remain zero; both noEmit checks and runtime audit1438 pass. This scope explicitly uses3D storage, unit scale, identity Local basis, zero center/angle offset, no inversion/flips and the source mesh vertices. Source View meshes are numeric crossproducts, not current Local dispatch proof. Nonunit scale composition, scalar/View workers, actual flags/axis/cache/producer/owner state, outer projection/minmax clamp, normals/material/full writer/lifecycle/bounds/sorting/HUD and aggregate equivalence remain OPEN. No tests/app/build/visuals.

### Mesh endpoint size mask (BND-C107 / C108)

Reverse `9596447554c96595eb0d25d9ed7f38ca634a5924` and adapter correction `3dcc6ed6f79ee939799cac3dd6e9bd3db30820de` were verified and pushed with remote0 0 before consumption. Original complete12BC4AC clears all three size axes at percentage age>=100; the independently constructed normal matrix precedes that mask. Actual mode4 vertex-size initialization now applies that predicate. All288 explicit unit-scale/no-flip cases match native masked-size bits, clearing144 baseline differences (72 at exact100 and72 successor100 nonlive probes). Billboard half-size/pivot7080/240 and mesh3D quaternion144 comparisons remain zero.

The audit adapter was corrected to include the actual production bit-pattern declaration and convert native little-endian input bytes to the public0x word form; native expected is unchanged. Both noEmit checks and runtime audit1438 pass. Current source size/age/flags/admission, nonunit scale composition, matrix/pivot/final vertices, owner/camera, bounds/sorting/HUD and aggregate equivalence remain OPEN. No product tests/app/build/visuals.

### Mesh 3D quaternion arithmetic (BND-C105 / C106)

Reverse `3200ee203cdd7a837253bc22a818b5b2970cf894` was verified and pushed with remote0 0 before consumption. Complete original12BC4AC and the original coefficient initialization prefix provide288 numeric cases;144 use3D rotation storage. The actual mode4 quaternion consumer now uses half-angle Float32 folded polynomials and the original ZXY sign/product order. All144 quaternion outputs match native bits, clearing96 baseline differences. Existing scalar/3D billboard rotation and simple/complex vertex consumers retain zero differences.

This closes only the3D quaternion partition with explicit zero angle offset and no inversion. Module requirements select the production3D path; current native allocation flags and source axis/angle producers remain OPEN. Scalar mesh rotation, matrix conversion/scaling, pivot and age masking, owner/camera association, final mesh streams, bounds/sorting/HUD and aggregate equivalence remain OPEN. Both noEmit checks and runtime audit1438 pass as compile/integrity information; no tests/app/build/visuals.

### Source stretch texture-sheet output (BND-C103 / C104)

Authority: Reverse `a31252b43c77f6bcc4653e4e580a5e64ab543f80`, verified and pushed with remote `0 0` before consumption. `particle_stretch_uv_output.json` SHA256 `68F0ACFC4DA2281711F39BA4A9BD3DD25D14A2D4B00EEFAA7F3257605357F70F` binds1741 fresh system roundtrips and286 enabled mode1 renderers to five UV configurations: enabled4x4/4x8/1x8 and disabled4x4/1x1. Original preparation, normalized-frame gather, full12C3738 and final12C39C4 execute58 native frame states, including both disabled defaults. All actual286 tile bindings and4517 source/frame buildUvs consumers match the native output; no algorithm edit is needed.

This explicitly crosses one C97 motion/raw-size/camera row with dyadic integer frame inputs and neutral material ST. Current normalized-frame producer/storage, source cooccurrence, noninteger inputs, renderer flip/stream selection, material/custom shader and normal coefficient remain OPEN, together with full lifecycle/bounds/sorting/HUD. Documentation-only registration does not rerun compilation; no tests/app/build/visuals.

### Final stretch positions and default UV stores (BND-C101 / C102)

Authority: Reverse `21c7225a0b678a5f1cf3f2c734f103d0739e82ba`, verified and pushed with remote `0 0` before consumption. `particle_stretch_output.json` SHA256 `5442EACC3E33418EC38F5B9C42E62237A01082BC26B124BDC755400FB5715300` continues the C97 prefix through the actual12C39C4 interleaved writer. The worker quad flag0x80000000 follows original107A0A8 preparation; C97's previous pre-output flags0 did not establish final vertex count. Descriptor stream-mask0, disabled UV/flip, white Color32 and normal coefficient0 are explicit input boundaries.

All240 calls/960 native particle rows produce3840 vertices; every byte in each576-byte block is written natively and0/A5 dead-padding variants agree. Final position bytes equal the earlier native vertices. Actual production update/samples/stretchedBillboard/buildUvs has zero position/default-UV differences for792 admitted rows;168 age>100 probes remain separately recorded. No algorithm change is needed for this scope. This uses neutral material ST and exact default-UV Y reflection; current enabled UV/flip/stream selection, native normal coefficient and color/material producers, owner association, full worker loop/return, bounds/sorting/HUD remain OPEN. Documentation-only registration does not rerun compilation; no tests/app/build/visuals.

### Ordinary billboard endpoint visibility (BND-C99 / C100)

Authority: Reverse `e2f36019f761a684a7f2b6608215eb6e3cc23c74`, verified and pushed with remote `0 0` before consumption. `billboard_age_visibility.json` SHA256 `388007D245657734688AD316329F988A24EE431DA2A789C04EF241797FC88345` executes continuous original size/limit/mask regions across all four billboard workers. The1770 distinct C34/C35 source inputs give7080 native calls/28320 lane results at percentage ages-0, predecessor100,100 and successor100. All four workers agree; successor100 is an arithmetic probe, not a current admission claim.

Production now masks both limited half sizes to positive zero when native percentage age is not below100, retaining raw size for complex pivot displacement. Actual sourceGeometry prefix7080 calls and separate mask/pivot240 calls have zero differences, down from2922 differing result rows. C34 Local585+6/15060 and C35 View1605/46440 retain zero; pivot60+6/200 and continuous stretched792 admitted vertices also retain zero. Both noEmit checks and runtime audit1438 pass. Current SoA/renderer dispatch and cooccurrence, full normal/UV/material/output, owner/camera state, bounds/sorting/HUD and aggregate equivalence remain OPEN.

### Continuous stretch vertices and lifetime endpoint (BND-C97 / C98)

Authority: Reverse `adb22c874aa871f9c03aabc9ea25de4356c4b794`, verified and pushed with remote `0 0` before consumption. `particle_stretch_prefix.json` SHA256 `851554A2D8265CB295775156A6288A19464168D715BBA52B796A5D1CA8E98203` executes original107A0DC and continuous12C7C4C..12C8ECC, including actual gather and vertex arithmetic. The24 source matrix/Velocity configurations give240 four-row cases, repeated with0/A5 dead padding; both runs agree. Of960 native rows,792 age<=100 rows enter the current vertex comparison;168 age>100 probes remain separately recorded outside current vertex admission.

At exact percentage age100 the native half-width mask clears to positive zero although strict age>100 removal has not occurred. Production now publishes the precise native percentage-age bits and applies that mask in the stretched worker. Actual complete update/samples/stretchedBillboard comparison falls from384 vertex-component differences to zero; all prior differences were at age100. Size-limit1140/2280, lifetime-size1728 and local-motion22752 comparisons remain zero; age-state97/768/16597 plus3701 samples/birth-state calls remain zero. Both noEmit checks and runtime audit1438 pass.

This closes the explicit stationary-camera, identity-outer-owner, raw-size[1,2,1], zero-pivot renderer cross-product through pre-UV vertices only. It does not prove current renderer/configuration cooccurrence, arbitrary owner/camera mutation, final output streams or full lifecycle. C99/C100 separately closes ordinary billboard endpoint masking in its stated domain; remaining current-state/renderer/bounds/sorting/HUD gaps and aggregate equivalence remain OPEN.

### Stretched raw sizes, camera limits and side basis (BND-C95 / C96)

Reverse `6421917cc05c86f882361d10e9cafd2631fa100a` and auditor binding follow-up `23827f847249b8336379ac12c23bfb2d7f09df44` were verified/pushed with remote `0 0` before consumption. `particle_stretch_size_limit.json` SHA256 `9AA778C6EDCCFE185800BA4E8DE098DCB757F1C2C6C0451FC4752DEA1EFDAD23` covers fresh286 enabled mode1 systems,112 runtime scales,3432 source/setup/viewport references and1140 arithmetic configurations. Original camera-width/coefficient preparation and86F0..87A4 determine raw half-width;82CC/8D1C determine `(lengthScale*runtimeScaleX)*rawSizeY`;81B0..83DC and8E28..8E84 produce the actual side basis and world side.

Production now uses the shared native orthographic half-size consumer on raw size, supplies rawY and native-scaled length to stretch arithmetic, and publishes side offsets through the scaled inverse-camera basis, retaining its discarded-Z zero terms. The actual argument-prefix/side-publication partitions have zero differences across1140 inputs and2280 explicit unit-direction side cases, versus1684 earlier differences (453 length-size products,1225 side components and6 unit-scale raw half-width values). C93 camera960 rows remain zero. C34/C35 numeric helpers/wrappers remain zero (585+6/15060 and1605/46440); their stale historical `halfSize*2` text assertions were corrected to the current pivot/simple-diagonal calls without changing expected. Both noEmit checks and runtime audit1438 pass.

This closes source-orthographic size/limit and side-basis arithmetic under the stated explicit setup/raw-size/viewport and identity outer-owner conditions. The audit does not replace normalization or claim a full worker invocation. Actual size/age producers, sprite dimensions, source co-occurrence, camera/Transform/owner mutation, complete camera position/tail/normal/material/geometry, bounds and mixed sorting remain **OPEN**. No tests, application, build or visuals.

### Non-Freeform camera velocity composition (BND-C93 / C94)

Reverse `223760858177031b3d9c613ffa23a01d669143e4` was verified, committed and pushed with clean remote `0 0` before consumption. `particle_stretch_camera_velocity.json` SHA256 `7BB3B89F8BE65E101FB0D60DFA99CE3850EF9F95E946B3C5DF7AE740A4E73998` executes actual12C814C..12C81F8 matrix composition and12C8C00..12C8CE4 non-Freeform velocity projection, fed by full12C7034 native gather, C36 camera and C81 runtime matrices. The stationary camera/identity outer-owner scope covers24 source matrix/Velocity configurations,240 calls and960 lanes.

Production now retains gathered simulation-space velocity and native runtime basis columns in internal render samples. Stretch composes the camera basis with those columns before the Float32X+(Y+Z) sum and stationary-camera subtraction. World velocity remains separately published. The actual update/samples/geometry-helper audit reports zero differences; previously90 cameraZ values were negative zero where native emitted positive zero. This follows the native matrix arithmetic rather than canonicalizing zeros. Size1728, worldVelocity960 and localMotion22752 rows remain zero; both noEmit checks and runtime integrity audit1438 pass.

The arithmetic gate uses the original source-system/camera cross-product and identity outer owner; current owner matrix construction/association for nonidentity owners remains **OPEN**, as do actual source co-occurrence and camera mutations. Full non-Freeform position, size limits, normal/UV/material streams, lifecycle/bounds/sorting and complete rendering remain open. The new optional fields belong to internal ParticleRenderSample; Public13/transport3 are unchanged. No tests, application, build or visuals.

### Complete lifetime SizeModule output (BND-C91 / C92)

Reverse `99f3153939c9331b5788fdf377bd831f12b7840a` was verified, committed and pushed with clean remote `0 0` before consumption. `particle_size_update.json` SHA256 `C584E42F6615A316E613D3496B64EF251BA9678E7DAE6B43717BF258CF05608C` binds full original105B848, original cache compiler and scalar evaluators to fresh1741 source roundtrips:903 enabled systems,108 configurations (94 uniform/14 separateAxes),432 native calls and1728 lanes. Native writes base672/704/736 multiplied by nonnegative lifetime factors into separate output768/800/832.

The independent auditor invokes the actual complete `samples()` and its curve/random/age/Float32 dependencies. All1728 rows match native `sizeBeforeTransform` output at executable8b1940d895d11ea18c15def89fa108f314723b6a; no production algorithm change was needed. Explicit1D storage checks only native writtenX, while3D checks all axes. Both use bound percentage-age vectors, four seeds, signed-zero/positive base-size lanes and identity/unit setup.

This closes the source-parameter lifetime-size arithmetic scope. Current allocation flags and actual age/base/seed producers, SizeBySpeed/Noise coupling, Transform scaling and complete lifecycle/rendering remain **OPEN**. No tests, application, build or visuals; documentation-only registration does not rerun compilation.

### Hierarchy scale correction (BND-C29/C32)

`particle_hierarchy_scale_consumption.json` binds the original `0x1089018` helper through runtime348/352/356 to render-record336/340/344 and geometry-input288/292/296. The production `particleSizeScale` now uses that helper's ordered Float32 quaternion composition, parent scale-sign adjustment, rotation/scale column products and final diagonal selection for Hierarchy mode. Local mode still copies the current local scale; existing per-ParticleSystem setup-scale ownership is retained. The scale is calculated once per concrete system/owner sample pass, without caching it across Transform updates.

Independent arithmetic audit uses all189 C29 native source-input outputs, then the actual production scale wrapper on1,741 fresh source systems at explicit setupScale1 (15 Hierarchy,1,726 Local). Both comparisons have zero bit mismatches. The previous production wrapper differs on three `skin02` skill particles: Perfect/Great x/y previously return`0x3F800000` instead of native`0x3F800001`; Good returns`0x3F3427A6` instead of`0x3F3427A7`. Expected values come from original instructions/serialized fields, never the product implementation. The separate Reverse auditor is available at`fab20c6f`; no product tests or visual captures are involved.

This closes the named scale-helper substitution only. C33 below additionally repairs the Local billboard basis consumer and covers four explicit setup multipliers for that domain. Current native Transform transfer, full quad/camera consumption, bounds publication, shared sorting and final rendering remain open. A corrected numeric helper does not close those consumers.

### Local billboard basis correction (BND-C33)

Authority: corrected `serialized_billboard_local_basis.json` at Reverse42124ae4, SHA-256`60678519D37C4F1D22D01274401DE5C5707756F90463E08FEDEC0F696B3625AB`; independent auditor atf5237d96. The initial59d06f85 numeric extraction is withdrawn because its first branch omitted the original CMP. Corrected extraction executes that instruction, checks the actual branch taken and requires each slice to finish. No product delivery was accepted from the withdrawn corpus.

Local billboard vertices now use the original parent quaternion composition with scale signs, ordered Float32 normalization and row-scaled rotation matrix. Hierarchy scaling with Local simulation selects the full Transform matrix and a unit additional scale. The simulation publishes `sizeBeforeTransform` before multiplying its existing size tuple; geometry consumes that raw size with the corresponding native basis, avoiding column scaling and duplicate hierarchy scaling. Normal-stream reconstruction remains independently OPEN; this position-basis correction does not change its existing calculation.

All172 independent native basis inputs and1,004 actual production wrapper references agree bit-for-bit. These references cover251 freshly decoded source systems with four explicit arithmetic setup multipliers1,0.5,1.25,2, not observed Play states. The previous rotation basis with native size scales differs on28 inputs, referenced by19 systems;20 have unequal numeric values and eight differ only in signed zero. The original hierarchy helper189 inputs and scale wrapper1,741 systems at setupScale1 still pass. Raw-size publication and real geometry call sites are checked statically; full samples/quads are not executed by this audit.

Still OPEN: original billboard scalar/3D rotation and pivot, current Transform transfer, normal stream, mesh/stretched consumers, bounds and mixed sorting. C34 below separately repairs Local billboard orthographic size limits. This closes the Local billboard basis substitution, not the complete renderer.

### Local billboard orthographic size-limit correction (BND-C34)

Authority: `simulator-particle-bounds-calculation-10-1-4/particle_size_limit.json` and its eleven complete FDE/CIE-bound bodies, reused byte-verified worker/handoff and original numeric extraction. Both standard and SRP camera context paths supply visible world width. The current automatic orthographic camera uses `(size + size) * aspect`; using viewport height as the limit dimension is incorrect.

Production publishes native `transformSize` separately from `sizeBeforeTransform`. Local billboard geometry divides min/max fractions by `max(transformSize.x,1e-5)`, multiplies by camera width, preserves native nonfinite/negative sentinel handling, then computes half sizes from `max(rawSizeX,rawSizeY,1e-6)`. This occurs before the existing basis/vertex construction. This branch no longer receives a second projected outer-box limit. C35 extends that raw-size limit to View alignment; complete billboard, stretched and mesh geometry remain independently OPEN.

Bounded independent comparison:585 distinct inputs from251 source renderer systems, four explicit setup scales, three explicit viewport inputs and five explicit raw size pairs; six additional arithmetic boundary inputs. All591 native comparisons and15,060 actual production wrapper comparisons match Float32 bits. These are original-instruction expected values with explicit arithmetic inputs, not captured gameplay or product-generated expected. C33 basis comparison remains172/1,004 with zero mismatches.

The differential executes the production width/half-size helper and wrapper and statically binds sample publication and geometry consumption. It does not close full pivot/rotation/quad/normal execution, camera mutation/custom projection, current Transform transfer, complete size-module lifecycle, bounds or mixed sorting. The downstream conversion from half size to the existing quad representation retains its separate open status.

### View billboard orthographic size-limit correction (BND-C35)

`simulator-particle-bounds-calculation-10-1-4/billboard_view_size_limit.json` freshly binds774 enabled View renderers and their registered Transform chains. Four explicit setup scales, three viewport inputs and five raw-size pairs produce9288 system/setup/viewport references to1605 numeric inputs. Original half-size instructions from simple/complex scalar and simple/complex3D workers agree bit-for-bit. Five full FDE/CIE bodies bind the dispatcher and additional workers. The simple scalar worker is a square-particle diagonal optimization; independent axes, significant pivot or sprite texture-sheet mode select the complex worker.

View geometry now consumes `sizeBeforeTransform` through the shared original width/half-size function before vertex construction. All mode0 billboards bypass the second projected-box clamp. The independent source auditor executes the actual production half-size wrapper with native expected and statically binds the View call:1605 native inputs and46,440 wrapper comparisons have zero bit mismatches. This closes View's raw-size limit substitution; C36 separately corrects its camera basis and scale placement. Full scalar/3D rotation, raw-size pivot displacement, sprite dimensions, normals, current Transform/camera state, complete quads, bounds and mixed sorting remain OPEN. No visual capture, app execution or product-generated expected is used.

### Ordinary full spawn and initial speed (BND-C89/C90)

Authority: Reverse `e001c0c65c39a1fed554efc8d40ddb5bf5b83c02`, verified/pushed with remote0 0 before consumption. `simulator-particle-bounds-calculation-10-1-4/particle_birth_speed.json` has SHA256 `017BA852E27057FE71B41DEB196F598752451182B708461B5A3613AF67736A59`.

Complete original1091C7C/103DB48 consumes native C61 stored particle seeds and all559 source Initial speed configurations (422 constant,137 two-constant). Actual complete production spawn, Initial SIMD draws/buildBirthRandomSample and native Shape directions agree for1,122 native calls/4,488 lanes: seed, inverse lifetime, source size/color/rotation fields, local position and speed-scaled direction. No additional algorithm change is required. This extends C61's property-expression gate to the full spawn method at initialAge0.

Each explicit lane starts with empty product SoA, respecting source capacities1..3 without overriding maxNumParticles; this does not establish four simultaneous live admissions. Native box/Initial combinations, identity/unit setup and source phase inputs are an explicit arithmetic domain. Capacity admission, complete108C5B8 birth scheduling, current phase/seed/owner overrides, inherited velocity, optional orientation and later module/render coupling remain OPEN. Source randomizeRotationDirection is0 in all559 configurations; arbitrary overrides are not asserted. No product expected/stubs/tests/app/build/visuals.

### World velocity publication (BND-C87/C88)

Authority: Reverse `f8752385494de549353ea8dd149ec0da0699987c` and auditor binding follow-up `6c05439b1d93a497bf8565e811638eebae870305`, both verified/pushed before consumption. `simulator-particle-bounds-calculation-10-1-4/particle_world_velocity.json` has SHA256 `F59D1EC08FF59052DB7E41C622E4E6A5F549259020D33C58EF77CC8D15FBB4E2`.

Complete native12C7034 merges (base+module)*speed; contiguous and identity-indexed gathers agree. The original12C87B4..12C8840 world-vector arithmetic uses worker128 columns in X+(Y+Z) order. Production samples now project with the same native forward matrix, replacing the sequential generic quaternion path. Actual updateParticle/samples matches all960 rows from50 source Velocity systems/24 configurations; the prior1,040 world-velocity component differences are zero. Local/gathered streams already agreed before this repair. Existing22,752 motion rows,2,528 birth positions, radial/sphere and analytic prewarm gates still agree; both noEmit checks and runtime audit1,438 pass as compile/integrity evidence.

The projection region belongs to the Freeform branch, which current serialized source renderers do not enable. This is a conditional world-velocity representation gate, not closure of the current non-Freeform combined camera matrix or complete stretched geometry. Current owner/setup/storage/index producers, camera motion/uniforms, final rendering/bounds/shared sorting and full ordinary birth/module coupling remain OPEN. Historical Shape auditors retain immutable-source transform checks while current audits bind actual local birth storage; native expected bytes are unchanged. No product tests/app/build/visuals.

### Local integration and runtime matrix publication (BND-C85/C86)

Authority: Reverse `60bc9b20589c32aceed2dba0f858b81058ed1b73`, verified and pushed before consumption. `simulator-particle-bounds-calculation-10-1-4/particle_runtime_transform.json` has SHA256 `675008DA1043A55EAEF46CE14B180824C00E3436D64DFBC79356632927B310B8`; corrected `particle_local_motion.json` is `AF6A9A8A9A3B4E757678A5253CE7622BB22D82C16BC5F01DB8EC737D3466E74A`; `particle_velocity_space.json` is `2A2BDA2E182E891FA57593EE9813F8D5EAA021E98CB34970AA39E10B63B802C5`.

Production retains source-local position/base/module velocity through integration, and projects position when publishing samples. Complete native108834C binds the forward matrix, EF6F98 affine inverse and scaling-mode scale. Gravity uses the inverse basis; world-linear velocity uses inverse columns scaled by runtime348. The126D318 orbital call passes literal module-space0, so source-local orbital motion stays local even when linear velocity uses inWorldSpace. Its displacement, speed division and refined reciprocal delta preserve the original operation order.

Corrected native1091C7C executes source speed0 against native Shape directions, retaining signed-zero base lanes.105FBF0 returns zero gravity for serialized scalar0;10612C4 modes0/1 skip accumulation, preserving those signs. The first C85 artifact used explicit positive-zero base inputs; its historical4,615 public and69,216 internal baseline differences apply only to that superseded input corpus. The corrected corpus exposed13,716 signed-zero fields before the gravity skip repair; these now all agree.

Actual complete spawn/updateParticle/samples matches22,752 native particle-frame rows across316 source matrix/gravity combinations and three consecutive steps, including optional registered Force co-occurrence probes. All11,060 matrix/scale values and960 source Velocity/integration rows agree exactly. C83's2,528 birth positions,316 origins,4,608 Shape rows,4,488 Initial rows, ordinary Rotation/BySpeed/Velocity/Clamp/Force and analytic prewarm gates remain zero-difference. Two noEmit checks and runtime audit1,438 pass as compile/integrity evidence only.

This closes the stated source-local arithmetic domain. Full birth/normal dispatcher coupling, age/death/current storage and seed producers, nonunit setup/reparenting/selector1/2, random gravity/Force and arbitrary orbital/radial/axis-limit overrides remain OPEN. The separate conditional world-velocity gate is recorded in BND-C87/C88; current non-Freeform camera composition remains OPEN. Normalized rotation/separate-scale fields, renderer vertices/material/bounds/shared sorting and HUD typography are independently OPEN. No app, recording, screenshot, framebuffer or product-generated expected is used.

### Birth-position matrix projection (BND-C83/C84)

Reverse `ebc899b339f06e50350f7d295433bdcea7fbce9e` was verified, pushed and confirmed remote0 0 before consumption. Original12CEDFC..12CEE68 now consumes C81 native matrices and C63 native box points. Two existing seeds on source box configuration13 supply eight XYZ points, explicitly crossed with316 source chains; this does not assert source co-occurrence. Full caller/gather bodies bind runtime68 -> worker128 and position SoA0/32/64; their execution and current producers remain separate.

Actual complete spawn now constructs the native mode0 scaled hierarchy matrix or mode1 unnormalized composed-quaternion matrix with self scale, then evaluates X+(Y+(Z+translation)). All2,528 birth positions agree bitwise, eliminating2,724 baseline component differences. Emitter origins316, radial Shape4,608 rows/2,016 RNG states, Initial4,488 rows/2,244 states/192 phases and prior analytic reconstruction/motion gates retain zero differences.

This is a zero-initial-age, unit-setup, pre-pivot world-position gate. At this historical gate production stored world position and transformed velocity before integration. BND-C85/C86 subsequently closes source-local integration and later position projection; BND-C87/C88 closes the conditional world-velocity representation. Current Transform mutation, selector1/2, camera-forward/pivot offsets, other renderer consumption and full lifecycle remain **OPEN**. No product tests/app/build/visuals.

### Source Transform emitter origin (BND-C81/C82)

Reverse `8b83a2d5966c9d493e37d2e42c526b28de33140b` was verified, pushed and confirmed remote0 0 before consumption. Fresh1,741 systems bind316 distinct serialized Transform chains/scaling modes. Complete108834C with explicit descriptor selector0 produces seven runtime fields;632 native calls verify unused fourth-lane padding invariance. Selector0 is not a direct simulationSpace enum or a current Shape source-object selection assertion.

Actual complete production spawn now copies self translation and follows the original parent-position arithmetic: mode0 uses scaled matrix columns; mode1 preserves quaternion delta-column subtraction and ordered Float32 additions. All316 emitter origins match native localToWorld translation, eliminating24 baseline component differences. Explicit unit setup scale, zero initial age and a registered InitialModule used to reach spawn bound this comparison; unrelated modules are disabled, without claiming source co-occurrence.

Later BND-C83..C88 separately closes the declared source-local matrix/integration/publication domains. Other runtime fields, current instantiated/reparented/setup-scale state, selector1/2 and full lifecycle/rendering remain **OPEN**. This repair closes the measured origin calculation only. Prior analytic reconstruction88 calls/164 rows plus104 queues, analytic motion16/74, ordinary Velocity190/760 and Force30/120 retain zero differences. Both noEmit checks and runtime audit1438 pass as compile/integrity information. No product tests/app/build/visuals.

### Ordinary constant Force ownership (BND-C79/C80)

Authority: Reverse `f53af19c4b36c47182acc1398f366af0fd5877f7`, `particle_force_update.json` SHA256 `92EB8AA3CF471B57BDC707FCFF3DF69C191966B793C152E9D9D6105576A0E33D`, verified and pushed before consumption. Fresh1,741 source roundtrips bindtwo enabled Force systems/one constant(0,5,0) configuration with randomizePerFrame=false. Complete103FB08/107D950 and three consecutive bounded108AF6C integrations produce30 calls/120 particle-frame rows; actual complete production updateParticle already agrees.

Ordinary Force directly adds force*delta to base velocity96/128/160 and leaves extra velocity192/224/256 intact. The former production comment describing an age-integrated transient owner was incorrect and is replaced; executable behavior is unchanged. Identity basis/unit scale and explicit seed/age/base-velocity/position inputs bound this gate. Current owner/Transform/scale/override producers, nonconstant/randomizePerFrame/analytic Force and full lifecycle/rendering remain **OPEN**. No product tests/app/build/visuals.

### Shared rotation-rate integration (BND-C77/C78)

Authority: Reverse `4749e63d9c2e78999186031613c7c5a105c1317d`, `particle_rotation_speed.json` SHA256 `1A26B39BA2D20ACB60D8610E259F6BAE5614A6C5B5D6AA3A52A4A3143CC74258`, verified and pushed before consumption. Fresh1,741 source roundtrips bind18 enabled RotationBySpeed systems/3 configurations, all mode0/3, with RotationModule disabled. The12 source calls/48 rows already agree. Separately labeled probes enable each system's serialized Rotation fields or select direction0.5/1;60 calls/240 rows expose90 baseline differences, including six at source direction0 with Rotation enabled.

Production now signs the BySpeed contribution using particleSeed+FF2BB1A4, accumulates Rotation and BySpeed angular rates, and applies delta once after the module pipeline. All72 calls/288 rows match full original1055940/1039274 and bounded108AF6C integration. Existing Rotation408/1632, Velocity190/760, clamp828/3312, analytic16/74, common88/164+104 queues and prewarm59/59/7/104 remain zero. Both noEmit and runtime integrity audit are compile/integrity information only.

The parameter probes are not current source overrides/co-occurrence. Speed-dependent curve normalization/modifier selection, nonzero separate axes, storage/current owner/seed/override producers, full dispatcher/lifecycle/rendering remain **OPEN**. No product tests/app/build/visuals.

### Persistent ordinary velocity clamp (BND-C75/C76)

Authority: Reverse `5fc7af94a7c8817cee143f8c0327a4f2d7841d4d`, `particle_velocity_clamp.json` SHA256 `558876CDAB36C05CE15954449C04A5C6044D16EB5A84A3C96B9F30FB944D86F5`, verified and pushed before consumption. Fresh1,741 source roundtrips bind452 enabled ClampVelocity systems/23 configurations, all constant total-speed limits and zero drag. Complete original104C0F8 and three consecutive bounded108AF6C integrations yield828 calls/3,312 particle-frame rows at explicit base/extra velocities and six deltas. The original powf symbol is ELF-bound to the registered libm; its runtime slot is not R0-observed. Three unused upper stack-load halves have explicit0/A5 invariance checks.

Production now normalizes total velocity even below the limit using twice-refined FRSQRTE, writes the clamped value minus extra velocity back into base velocity, and recombines both streams before position integration. Total-speed limiting does not apply an axis-space transform. Inactive dampen/drag bypasses the writeback. All6,532 baseline field differences are removed;3,312 native powf comparisons also agree in the admitted domain. C73 Velocity190/760, C71 Rotation408/1632, analytic16/74, common88/164+104 queues and prewarm59/59/7/104 remain zero.

Current owner/SoA/cache/seed/override producers, separate-axis limiting, drag, arbitrary pow inputs/system-library identity, complete module scheduling and lifecycle/rendering remain **OPEN**. The explicit extra velocity input is not a source co-occurrence assertion. Compile/integrity checks are not native equivalence evidence; no product tests/app/build/visuals.

### Ordinary velocity and orbital delta correction (BND-C73/C74)

Authority: Reverse `1fc165c9c157b67c9836ea463e270ecaea2ede32`, `particle_velocity_update.json` SHA256 `F43D01794046CF5A552D9488E8A0B765E5C38F883EDD7AEE439CE73DCB6EF87C`, verified and pushed before consumption. Fresh1,741 source roundtrips identify50 enabled Velocity systems/19 configurations. Complete original126D318 and its native callees feed the original108AF6C position-integration region. Explicit identity owner/unit scale, four seed/base-velocity/position rows, two age vectors and five deltas produce190 calls/760 rows.

Production now applies the original strict delta>1e-6 gate, twice-refined reciprocal estimate, and displacement/speed followed by inverse-delta multiplication. The source orbital system accounts for54 baseline module-velocity/position differences; complete actual updateParticle now matches all760 native rows. C71 rotation408 calls/1632 rows, C69 analytic motion16 cases/74 rows, C67 common88 cases/164 rows/104 queues and C54 prewarm59 selections/59 preparations/7 wrappers/104 steps remain zero. Both noEmit checks and runtime audit1438 pass.

This closes the declared source ordinary Velocity inputs, including speed1/2 and the single Z-orbital source. Mixed orbital axes/radial/current overrides, allocation/current owner/SoA producers, Force/Clamp/RotationBySpeed coupling, render-velocity publication and full lifecycle/rendering remain **OPEN**. No product tests/app/build/visuals.

### Ordinary rotation direction correction (BND-C71/C72)

Verified/pushed Reverse17d17c804a3618fd0ef2409e46a70bf521c5f6cb retains original1055940 and the actual-rate108AF6C rotation integration region. particle_rotation_update.json SHA2569714085C6AAF0C1177EB60E32A4510EE476AC46441BBA435638F03119B61F076 freshly roundtrips1741 systems and binds360 enabled Rotation systems/34 module configurations. Cached and noncached two-curve paths execute original curve samplers/compilers.

Production now applies the native particleSeed+FF2BB1A4 direction comparison before multiplying angular velocity by delta. Actual complete updateParticle agrees with408 original calls/1632 rows. Source direction0 contributes136 calls/544 rows with zero baseline differences. Separately labeled direction0.5/1 arithmetic probes contribute272 calls/1088 rows;736 baseline differences are corrected. These probes do not assert current source overrides. Both noEmit checks and runtime audit1438 pass; C69/C70 analytic-motion16 cases74 rows, common88 cases164 rows/104 queues and seven normal prewarm wrappers remain zero.

Explicit source curves, four seeds/initial angles, age/delta vectors and angular-velocity/3D storage bound this gate. Complete current flag/seed/module producers, ordinary Initial/Velocity/Force/Clamp/RotationBySpeed coupling, whole update/death scheduling and full lifecycle/rendering remain **OPEN**. No product tests/app/build/visuals.

### Analytic prewarm motion integration (BND-C69/C70)

Verified/pushed Reverse132da4a06e7fb238855b4af1ec55667c9dc893c5 and auditor1e9b5e79 bind original analytic Rotation105614C and Velocity126EE40/126F704 after the common queue reconstruction. particle_analytic_motion.json SHA2566DB753FD15D0990F91D937D03F673D5082340A5380D2E7DD9EFDA2BA6A496D0E retains32 calls/148 rows across eight source systems, two seeds and two inactive SIMD seed paddings. Original C47 curve compiler supplies cached coefficients; live outputs do not depend on those padding values.

All52 registered analytic source prewarms now use the native queue reconstruction. The eight motion systems additionally integrate cached curves from percentage age, preserving coefficient scaling and separate Float32 operations. Rotation applies its native seed-based sign and twice-refined reciprocal of inverseLifetime; Velocity divides integrated displacement by inverseLifetime and retains instantaneous module velocity separately from base velocity. The analytic call does not consume speedModifier. Snapshots clone the added module-velocity state. Ordinary updates retain their existing module-velocity computation.

Actual complete production entrance agrees for16 motion cases/74 live rows, including count, position, base/module velocity, age/inverse lifetime, seed, size/color, rotation storage and Initial/Shape states;94 baseline discrepancies are removed. Common44-system acceptance remains88 cases/164 rows plus104 queue comparisons. Normal birth1122 calls/4488 rows/2244 states/192 phases, age97 births/768 estimates/16597 updates/3701 samplers and source births, and seven normal-prewarm wrappers remain zero. Both noEmit checks and runtime audit1438 pass as compile/integrity information.

Separate-axis storage is an explicit input to C69. The prior original10900A0/109491C bodies establish its positive request/initialization branch; complete current allocation/producer reachability is still OPEN. Rotation storage rows are compared without asserting final renderer-axis interpretation. Current owners/transforms/seeds/SoA/overrides, noncached integral curves, nonzero gravity/Force, ordinary motion-module semantics, render-velocity publication, later size/color/render rebuilding and complete lifecycle/rendering/bounds/shared sorting/HUD remain **OPEN**. No product tests/app/build/visuals.

### Analytic prewarm common reconstruction (BND-C67/C68)

Verified/pushed Reverse0b001b479966cf7b332c65a290f6b43e6327027a retains original1097F98 entry through1098740, before Rotation/Velocity/Force and render-module rebuilding. particle_analytic_reconstruction.json SHA2568D7BE6876A9302F19F38210F897BA88E6A6E5711BE5C5EC85576E0F3C6189E8C binds104 source-seed cases/238 native rows; native InitialModule matches C56 independently. Source52 roundtrips add entrance startDelay/autoRandomSeed. Optional seed tail reads are confined to10984F8 outside liveCount and explicitly retained.

Production reconstructs the44 source analytic prewarms with zero gravity and no Rotation/Velocity/Force modules from the original fixed-step queue. Queue aging precedes each emission; burst and rate admission remain separate. Lifetime draws precede particle seeds and later Initial draws; an all-dead SIMD group skips those later draws. Shape consumes the complete published birth range after all Initial records, then native queue-derived motion ages reconstruct positions and velocities. Original analytic lifetime minimum1e-6 and percent-age initialization remain distinct from normal birth. C69/C70 extends this route to the eight integrated-motion source systems.

Independent actual-class createSystemRuntime/prewarm comparison removes619 baseline differences, including54 count differences:88 cases/164 live rows now match named count, position/velocity, age/inverse-lifetime, seed, base size/color, Z rotation and Initial/Shape RNG. An additional104 actual queue calls across all52 systems agree with C55 records, clock remainder/phase/cycles and emission state. Normal birth1122 calls/4488 rows/2244 random states/192 phase values, existing age arithmetic and seven normal-prewarm wrappers remain zero. Independent adapter additions at Reverseeda871e0 preserve all native expected bytes.

This is bounded to the declared source inputs, identity owner/unit current scale, initialized globals and empty initial particles. X/Y rotation storage producers, current seed/Transform/SoA/override producers, complete Play/deferred/module lifecycle, render-module rebuilding and rendering/bounds/shared sorting/HUD remain **OPEN**. Eight integrated-motion arithmetic gates are superseded by C69/C70 above. Both noEmit checks/runtime audit are compilation/integrity only. No product tests/app/build/visuals.

### Sphere volume distribution correction (BND-C66)

Verified/pushed Reverse78f3d43cd47b7bfc75f6af4467de4dac1c7717b7 binds16 source sphere systems/two configurations. particle_shape_sphere.json SHA256709715767B9118843DDCB3BFD314B32760F3F7B16301EB268B36B001D2006F31 retains full12357F0/1238F74/1241914 and original registered-libm log2f/exp2f/divzerof execution. Source radiusThickness1 reaches +0 -> -infinity -> +0; this explicit ELF library binding does not assert current-process GOT identity.

Production cube-root approximation now adds the exponent and linear term before the separately rounded higher-order term, matching12393DC..1239408. All28 full native calls/128 live position-direction rows/56 random-state comparisons agree;8 baseline position differences are eliminated both before postprocessing and after actual identity-owner consumption. This completes the named source Shape types0/4/5/8/10 numeric gates under their recorded entry conditions, not arbitrary/current owner/scale/SoA, optional orientation, analytic/full lifecycle/rendering/bounds/sorting/HUD. Those remain **OPEN**. No tests/app/build/visuals.

### Shape local matrix correction (BND-C65)

The committed C64 full native corpus and original12357F0/1241914 bodies at Reverse29341bf3 also bind local Shape rotation. Production now constructs the original ZXY quaternion from half angles, scales its separately rounded matrix columns and consumes position as X+(Y+(Z+translation)). Direct sequential Euler rotation produced70 final position/direction differences for the source circle x-rotation35.709999084472656 degrees.

All1008 complete source radial calls/4608 particle rows/2016 random states now agree bit-for-bit through actual sampleShape and spawn's identity owner-transform consumer. Raw geometry remains zero; the source box gate42 calls/168 rows/84 states and normalization9444 calls/512 estimate entries also remain zero. This closes the70 C64 local-matrix differences for these source inputs. Source rotations in this domain are zero except the named X rotation; arbitrary rotation combinations and nonidentity current owner/scale, optional orientation, sphere Shape, full modules/lifecycle/rendering/bounds/sorting/HUD remain **OPEN**. Both noEmit checks and runtime audit are compilation/integrity evidence only. No tests/app/build/visuals.

### Cone geometry correction before Shape postprocessing (BND-C64)

Reverse `afb4a91ce3a06681cddb31f396ca792d4dbd5fc6` was verified/pushed clean with remote `0 0`. `particle_shape_radial.json` SHA256 `C3E8B4ABC437A13024E2F5D33A948F52894CE80654A479F05BF80594B80ECD8F` freshly binds478 radial source systems/72 configurations and executes1008 complete native calls at counts1/2/3/4/5/8/9 and two seeds. Original raw geometry is captured at1241914 entry; final positions/directions and RNG states remain independently retained.

Cone and cone-volume direction x/y now include the sampled radial distribution. Position components multiply radius after the radial/trigonometric product; cone-volume longitudinal displacement uses original two-refinement normalization. The exact actual sampleShape prefix agrees on4608 source particle rows and2016 random states, eliminating4211 raw-geometry comparisons. Circle geometry already agrees. Box and common normalization gates remain zero.

The corrected full-consumer gate includes actual spawn applyTransform at explicit identity owner/unit scale and unit speed for direction, as registered by Reverse `29341bf3`. Complete radial consumption has70 position/direction differences after this correction, down from4080 at immutable product0ec7777f; all remaining differences belong to the one nonzero source circle x-rotation. Earlier4875/1450 counts compared local samples before outer owner consumption and are superseded. C65 above closes these70 matrix differences for the named source inputs. The geometry-only audit reports all remaining full-consumer mismatches. Current owner/scale/global/SoA/optional orientation and full analytic/lifecycle/rendering/bounds/shared sorting/HUD remain open. No tests, app, build or visuals.

### Complete source box Shape gate (BND-C63)

Reverse `5d50cc62` was verified/pushed clean with remote `0 0`. `particle_shape_box.json` SHA256 `489D1AC6827ED4F6235762187EDF76CF5CE1C45B19D7EB8053CE4F0DBF9D9618` freshly roundtrips1741 systems and binds547 enabled box systems/21 configurations. Complete12357F0/1241914 calls include real SIMD seed initialization, random position/direction generation, source transform construction, normalization and position/direction publication.42 calls/168 rows/84 initial-final RNG comparisons agree with the entire actual product sampleShape and random module; no additional production correction is required for these inputs.

Eight named getters, the native jump table and ELF initializer-array/RELA bindings retain field/global provenance. Explicit unit current scale/identity owner matrix/zero initial positions/four rows/initialized sign vectors and disabled optional orientation storage limit the gate. Source box rotations are zero; one configuration enables randomDirectionAmount1. Nonidentity current inputs, optional mesh/3D rotation publication, source/global mutation, other Shape types and full analytic/lifecycle/rendering remain **OPEN**. No tests/app/build/visuals.

### Shape direction normalization correction (BND-C62)

Reverse `f3b240379ee9011d927e7d7ae5ef1236bc1728b6` was verified/pushed clean with remote `0 0` before consumption. `particle_shape_normalization.json` SHA256 `BF2A0C4E9B3F4BAF87E64E020F9EF6637DFA9BEF81A11AA802C2D467309FB185` executes original1241914..124199C for3148 explicit finite vectors, including magnitude/sign/zero/threshold boundaries.512 original FRSQRTE bins match the existing production table. Full helper and12357F0 caller bodies retain the subsequent spherical and post-transform normalization context.

Production Shape initial, spherical and final direction normalization now use the original estimate and two FRSQRTS refinements with separately rounded FMUL operations. The independent auditor executes all three actual consumer helper bindings:9444 results and512 table entries agree, versus3219 baseline comparisons (1073 vectors across three consumers). The cone-volume intermediate helper and unrelated velocity radial normalization retain their separate status.

This is a bounded numeric gate. Current source vectors, direction/position random generation, matrix construction, spherical/random blending, complete Shape/SoA/rotation publication and analytic lifecycle/rendering/bounds/shared sorting/HUD remain **OPEN**. No product tests, app, build or visual capture.

### Normal InitialModule end-phase correction (BND-C61)

Reverse `926086004cecfbfcf207a6d5c605538a35df467b` was verified/pushed clean with remote `0 0` before consumption. `particle_initial_birth.json` SHA256 `D73601535DE36BB860D910DEC1400E88EACF0EF9412309680DEFC2A2BD09384E` binds1741 fresh system roundtrips/559 Initial configurations and executes1122 complete105FD50 calls. Original normal seed/lifetime/size/rotation/color ordering is checked independently from analytic C56. The caller chain1090584 ->108C5B8 ->105FD50 supplies the end-of-step normalized system phase. Its FRECPE/two-FRECPS arithmetic executes192 inputs across all12 positive source durations.

Production ordinary and normal-prewarm births now pass that end phase to Initial lifetime/size/rotation/color sampling. The only source Initial mode1 gradient previously sampled phase0 for every birth. Actual production declarations, SIMD initialization/draw schedule and spawnBatch phase expression now agree on4488 published rows,2244 RNG states and192 phase results; baseline16 Color32 rows differed. The later speed/motion phase is separately interpolated in the original caller and is not covered by this correction.

Explicit identity basis/zero translation, source3D storage flags/default overrides and initialized modulation guard/vector remain entry conditions. Positions/directions/additional arrays, current owner/global/override/SoA producers, capacity/timing integration, analytic prewarm reconstruction, Shape/other motion modules and rendering/bounds/shared sorting/HUD remain **OPEN**. No product tests, app, build or visual capture.

### Packed render color conversion (RENDER-C52)

Reverse `1f8c6ecccd28ea4504c9b21ae0572a654bc07dd2` was verified, pushed and confirmed remotely before production consumption. `simulator-particle-bounds-calculation-10-1-4/particle_render_color_space.json` (SHA256 `8EC211FDE6C1933B0D3CA49101785DE1E328D175A7AC5FF5B99CA33508B164BB`) executes complete original1096BB4 on both conversion states and every byte value in each RGBA channel. Original10806E4 binds Renderer+521;1079908 gates worker328 bit26 by that flag and active Linear color space, and107A33C consumes it. APK PlayerSettings serializes Linear(1); six true renderer profiles have87 references, including14 enabled skin_witch mesh renderers.

`currentLinearColor` uses the complete native256-entry byte mapping, then publishes Float32(byte/255). Original SIMD approximation and Color32 repacking replace the former continuous gamma formula; alpha and disabled conversions remain unchanged. The actual sample producer supplies packed bytes divided by255; C53 below carries these values through Mesh modulation to shader vertex attributes. All512 actual consumer calls match original output bits, removing256 differing converted colors.

RENDER-C54, Reverse `7e8151a452d9633722294f8550fcf31833b6f686`, separately executes complete1096BB4 with the real lifecycle ColorModule and conversion callees. `particle_render_color_chain.json` (SHA256 `535C5EB0A7B69F2158E7937F023B79656BB0C92AE0F48D83D48A9739B782151E`) roundtrips all1741 source systems: ColorBySpeed is always disabled;11 systems combine lifecycle color and Linear conversion, using four gradient configurations. All34 reused native groups/136 actual composed production results agree, and C60 retains5960 matching results. No further production change is needed for this composition.

C52 isolates conversion with lifetime/speed/UV modules disabled; C54 adds lifecycle color with explicit age/seed/base-color/cache-guard inputs and disables UV writing. Current live input/global/cache producers, runtime color-space overrides and final GPU/material integration remain OPEN; C53 separately covers source Mesh color modulation. These are color-domain results, not complete particle rendering. No product tests, fixtures, application or visual acceptance were added.

### Material fragment color and write mask (RENDER-C56)

Reverse `c670d103b44276ffbcf5e5aeaf4cf2af68325c04` was verified and pushed before
consumption. `particle_material_pass_states.json` (SHA256
`7E19052CD3C1014B3D3F5E0238E5BE53F924165C8D0747340AF632C30A16D168`) binds 102
materials to six exact Shader objects and 21 explicitly referenced GLES programs.
For serialized local keyword variants, seven Legacy Premultiply materials output
`(texture * particleColor) * particleColor.a` for all RGBA. The previous RGB-only
multiplication by combined alpha added texture alpha incorrectly and omitted the
second particle alpha in source alpha. The shader now follows the original formula;
blend One/OneMinusSrcAlpha remains unchanged.

The source masks are14 for13 Standard Unlit and7 Legacy materials, and15 for the
remaining82. The source catalog, preparation, validated primitive and Pixi ColorMask
effect carry these exact masks. The existing additive Game-clear material route
explicitly supplies its builtin shader's mask15. Pixi's effect pushes/pops the mask
around the mesh draw, preserving the enclosing mask rather than leaking state to
later objects.

The independent Reverse audit follows symbolic operations from original and actual
production fragment source: all102 color expressions and masks agree, with the
preparation/primitive/effect handoff present. This removes7 expression differences
and102 missing catalog fields. It does not run a GPU or establish precision,
interpolation, active global keywords or culling/front-face equivalence. These remain
separate open domains; no product tests, fixtures or visual acceptance were added.

### Mesh vertex Color32 modulation (RENDER-C53)

Reverse `0544835452c477fe4f31f13bd4f07964a85d24ed` was verified and pushed before consumption. `simulator-particle-bounds-calculation-10-1-4/particle_mesh_colors.json` (SHA256 `9F507C7BD7C7E3BD365C0E0F913D327BE046354ACE30704EB80E3324766A805F`) roundtrips all four source meshes. screwTowerLow/screwTower contain82/35 Color32 values with white RGB and nonuniform alpha; crossCylinder and Quad have no color channel. The semantic catalog now retains these fields, and validation requires exact byte arrays or explicit null.

Eight normal/inverse-normal writer blocks in12B6BB0/12B1150 agree on24576 native executions covering12 source colors and all particle alpha bytes. `currentVertexColors` applies floor((MeshByte+1)*ParticleByte/256) after C52 conversion. The primitive and Pixi geometry carry these values to a float32x4 attribute; the shader interpolates vertex colors before texture multiplication. Mesh destruction releases its owned color/position/UV/index buffers.

All1024 actual consumer calls and145664 vertex comparisons agree, removing four missing resource fields and4845 baseline vertex differences. C52 remains512/512 exact. Original numeric register/stack inputs establish the color writer arithmetic; complete worker/cache dispatch, enabled module combinations and final GPU/material integration remain OPEN. No product tests, fixtures, app or visual capture were added.

### Complete source ColorModule consumption (BND-C60)

Reverse `ec8f0786f4954e66dec5a50b4bc3a35d93aa49a2` was verified/pushed with clean remote `0 0` before consumption. `particle_color_module.json` SHA256 `BB715E6C1C48B1FD21FBC2A24EFD1A0D330B88D9E9EED83D21D19804A43A84DF` executes full103BD34, real cache construction,103C188, random hashing, age normalization and base Color32 multiplication. Fresh1741 system roundtrips bind1239 enabled ColorModules:1126 mode1/113 mode3,184 complete configurations.1490 original module calls cover four explicit live rows, percentage ages0..100, four seed words and two base-color layouts. Named original getters and1096BB4 bind the payload and caller.

Production mode3 now samples both native-style Color32 caches and interpolates their bytes with a truncated Float32 ratio*255 integer weight before base modulation. The independent auditor extracts the actual ColorModule consumer block and actual random/age/cache/packing/modulation functions:5960 particle results match full original module outputs, versus330 previous mode3 differences. C59 cache/legal-age checks remain zero; both noEmit checks and integrity audit1438 pass as compile/integrity information.

This closes the explicit source-parameter ColorModule numeric chain, including the source mode3 pairs (19 blend/blend and1 fixed/fixed configurations). Current gradient colorspace, source-to-runtime mutation, guard/global initialization, actual SoA inputs and full lifecycle/rendering remain **OPEN**. The C59 outside-domain SIMD probes remain separately open. Source coverage does not close analytic prewarm, complete Initial/Shape/other modules, renderer/bounds/shared sorting/HUD. No tests, app, build or visuals.

### Native ColorModule gradient cache (BND-C59)

Reverse `58ca32be4f60a5e0ffb035192b030298e3e8a368` and domain clarification `fd3b1949` were verified/pushed with remote `0 0`. `particle_gradient_cache.json` SHA256 `2DFE2DD2CB10733D010BC3B75A01F6111F8551A31F9C24448A3FACA84498D2D9` executes original EFB8D8 preparation and EFBDF4/EFBF60 byte sampling for202 source ColorModule gradient sides. All active cache time/color/reciprocal fields are native outputs. Three exact SIMD tail load sites allow only proved dead lanes; all live reads and writes remain guarded.

Production mode1 ColorModule now consumes generated cache times, sampled/quantized colors and native reciprocal refinements, preserving cached byte interpolation and fixed interval boundaries.202 actual cache tuples,5683 legal-age samples and5683 mode1 wrapper calls match original outputs; baseline2397 legal-age samples differed. C57/C58 remain zero; both noEmit checks and runtime integrity audit1438 pass as compile/integrity information.

The native corpus also retains709 inputs outside live normalized age0..1. Those are explicitly excluded from the scalar product gate: above1, native output can depend on other SIMD lanes, which the current scalar sampler does not represent. They remain **OPEN**, with no expected rows removed or synthesized. Cache colorspace/source-to-current ownership, mode3 cache mixing, full ColorModule RNG/age/base multiplication, analytic prewarm, complete modules/renderer/bounds/shared sorting/HUD also remain **OPEN**. No product tests, app, build or visuals.

### Native gradient time, key selection and interpolation (BND-C58)

Reverse `653a6d050f68fb90b0962f7cedbe163a2945a313` was verified and pushed with clean remote `0 0` before consumption. `particle_gradients.json` SHA256 `4036EADCC27B081DD97FB09E64973D87D37113EEE5E8DBDF19DC923CCB035D5A` covers1741 fresh complete source roundtrips,1469 used gradient-side references and250 distinct gradients (206 blend/44 fixed). Complete original EE9E64/EEA108 evaluates7820 mixed SIMD lane inputs at finite times, source key neighbors and interval midpoints.

Production now retains Float32 time*65535, clamps to each color/alpha key domain, selects the first key at or after time for fixed mode, and preserves native Float32 blend operations including endpoint interpolation.7820 actual gradient calls and15640 mode1/4 wrapper calls match every native Float32 component; baseline4001 gradient calls differed, with8002 corresponding wrapper comparisons. C57 remains zero; Reverse auditor follow-up `5a0d81e6c3a124d7301893403946619304b01c5c` removes only the obsolete-helper requirement. Both noEmit checks and runtime integrity audit1438 pass. These are conditional numeric field comparisons; gradient colorspace/cache preparation and two-gradient packed mixing remain open, as do current input/RNG/age producers, analytic lifecycle, complete modules/rendering/bounds/shared sorting/HUD. Compilation and integrity checks are not parity evidence. No product tests, app, build or visuals.

### Native Color32 packing (BND-C57)

Reverse `3ec532445c08cd33c66aaa55f022952cdbbcc8be` was verified, committed and pushed with clean remote `0 0` before consumption. `particle_color_packing.json` SHA256 `09F20EB84D036A703B4889BDF307EF8F54E17A4F79B75586C93B1A49D30037E0` executes both complete original1049194/1049600 bodies:827 input groups/1654 calls, including57 source mode0/2 Initial colors and finite half-byte/neighbor/clamp probes. Original mode2 SIMD registers supply the independent pre-packing inputs.

Production colorToBytes now clamps each Float32 channel, rounds the multiply255 and add0.5 separately, then truncates. The actual birth and lifetime color consumers retain this shared function.3308 actual packing calls and228 source sampling/packing calls match native bytes with zero differences; the previous implementation had512 mismatches. This closes the bounded packing arithmetic, not gradient evaluation, colorspace/cache/current input producers or full particle lifecycle/rendering.

Source-only C55/C56 evidence in Reverse `f413e68e7606cb01e70d511a45c1b1418424f8a9` is also verified/pushed:52 analytic prewarms/2164 fixed steps/103 queue records;104 explicit source-seed InitialModule scenarios/238 published rows. The product analytic branch is still pending complete Shape/motion/module reconstruction. Both noEmit checks and the runtime integrity audit are compile/integrity information only. Gradient, analytic lifecycle/current seed/owner/storage/padding, full renderer/bounds/shared sorting/HUD remain **OPEN**. No product tests, app, build or visual capture.

### Native prewarm selection and normal preparation (BND-C53/C54)

Reverse `0ac920a81dc3f601c88e1365959f9daec148fa2a` was verified, committed and pushed with clean remote `0 0` before consumption. `particle_prewarm_selection.json` SHA256 `66908A38BF0706557875851F09E11675C8C1E9C0DE85E0259E7EF7D46B7161A9` binds59 prewarm systems from1741 fresh source roundtrips:52 analytic eligible and7 normal. Full108E6CC/EF8B6C and named getter bodies establish the source predicate; current runtime33/34 mutation remains separate. The current portable module domain has no enabled ExternalForces, Collision, Noise, Trigger, SubEmitters or Trails in these source prewarms.

`particle_prewarm_preparation.json` SHA256 `4C5635E8EB7FCF6AA7749473E0B31D0031FC8C941A9CC76266FF8BB5EA5F1A6D` executes full108EC04, its actual Unity callees and an explicit named ELF fmodf binding to the registered Android13 system library. This is not a fresh process GOT observation or universal library identity. At Play time0, source lifetime modes0/3 supply the maximum lifetime, divided by max(simulationSpeed,0.001); negative start is shifted by whole Float32 durations before phase remainder.1601 scratch emission calls never write the real emission RNG. All59 source speeds are1. The old Duration expression differs on54 source preparation outputs.

Production now selects the normal path for seven source systems and consumes native maximum-lifetime preparation, initial phase, ordinary substep clock, update/death/emission/admission order and retained remainder. It skips prewarm for nonlooping systems. The52 analytic systems still retain their separate legacy path pending queued-birth and analytic-module reconstruction; they do not receive this normal-step substitution.

All59 actual selection and59 preparation calls match original outputs; seven actual normal prewarm method calls match104 native steps, final phase/cycle/remainder. These observers disable emission and inspect update timing only, so complete normal birth/module coupling is not closed. Existing C50 dispatcher1035/24997 and C51 emitter3042/birth21320/wrapper1626 comparisons remain zero. Both noEmit checks and runtime integrity audit are compile/integrity information only. Analytic prewarm, live flags/RNG/owners, padding/immediate birth deaths, complete particle modules, renderer/bounds/shared sorting/HUD remain **OPEN**. No tests, app, build or visual capture.

### Native system phase, delay and emission stop (BND-C52)

Reverse `ccb07b3127689d82572ac58ccac380a79ea821ff` and consumer adapters `7696e810978e36bdd83a28497b2da1a1bc904699` were verified, committed and pushed with clean remote `0 0`. `particle_system_clock.json` SHA256 `9C388CF50E5827238F95AD1A4628227C22030FFCA9253A3ECB4DBAECC16BEFC7` retains1741 fresh full-read/roundtrip source references and37 clock configurations. Six full FDE/CIE bodies bind original Play/reset, phase advance and clock owners. Original pre-module clock/stop and post-module delay slices execute4762 transitions with real phase/singleton callees, explicit normal flags0, pre-update live count1 and unchanged clock fields across the skipped module phase. Empty-system cleanup is excluded; the two slices do not constitute full module-loop execution.

Production now owns native phase elapsed, remaining start delay, cycle count and emission-stop state. It advances phase by step-minus-delay, repeatedly subtracts Float32 duration when looping, clamps/stops nonlooping emission at duration, and preserves the original frame-start elapsed condition for delay consumption. The clock supplies the adjusted emission window and effective birth delta directly to the normal emitter. Absolute cumulative time modulo/delay reconstruction is removed. Clock state is initialized and cloned; original reset provenance also corrects initial burst fraction to0. Prewarm selects its distinct source delay-initialization branch while its simulation algorithm remains unclosed.

All4762 actual clock transitions match native state, phase, stop and emission-delta outputs; the baseline elapsed-add expression alone differs on3720 inputs. C45/C50/C51 remain zero, including1035 dispatcher sequences/24997 steps,3042 emitter calls/21320 birth ages/1626 wrappers. Both noEmit checks and runtime integrity audit1438 pass as compile/integrity information. Full current frame/module/particle coupling, empty-system cleanup, clock-mutating callbacks, seeds/flags/current overrides, padding/immediate birth deaths, prewarm/deferred, complete renderer/bounds/shared sorting/HUD remain **OPEN**. No product tests, application, build or visual capture were generated/run.

### Normal-step emission aggregation and newborn age (BND-C51)

Reverse `3ead43438d1093e44951bb650ad18b9546d3ea6e` and consumer auditor `1e6d8b9d0b22f8fd7adca49f187702a6a9d44a58` were verified, committed and pushed with clean remote `0 0`. `particle_emission_steps.json` SHA256 `F80C613035045422BDFD1A0665AB5F4FE261C7CA56A6B5E2A455D57E75E3181E` retains fresh full-read/roundtrip references for1616 enabled source emitters,109 emission/duration configurations and1795 burst entries. All source rates/counts use mode0/3; bursts use cycle1/probability1; distance rate is zero. Four original complete functions execute3042 emission calls, and their outputs feed the original bounded birth-timing slice for21320 SIMD lane ages. Six complete FDE/CIE bodies, exact source hashes, explicit initial random/accumulator state and guarded data reads/writes delimit this evidence.

Normal production emission now calculates the original integrated rate, random transitions, inclusive-lower/exclusive-upper burst windows, shared last-burst fraction and aggregate count before capacity admission. Source rate10000000 no longer expands into candidate timestamp objects on this path. One substep produces at most one birth batch; source-native fractions assign rate ages by batch index and burst ages by the last matched burst, clamped to1e-6..1 before multiplying the step. The source-verified initial/shape SIMD admission and C48 publication still consume admitted rows only; actual native padding/immediate death integration remains separate. Burst fraction is retained and cloned per emitter.

Actual production emission3042 calls, birth age21320 values and normal wrapper1626 calls match with zero differences. The baseline legacy-events gate differs on1239 of5388 comparisons, explicitly excluding348 wrapping/out-of-duration/count>4096 windows to bound candidate expansion; the current arithmetic gate includes all native windows. The normal wrapper gate separately covers zero-delay, nonwrapping intervals strictly within duration. C48/C50 remain zero; both noEmit checks and runtime integrity audit1438 pass as compile/integrity information. The normal wrapper still derives phase from its existing absolute clock; native elapsed/start-delay/cycle producers, current seeds/flags, exact SIMD padding/immediate birth death, prewarm/deferred simulation and complete renderer/bounds/shared sorting/HUD remain **OPEN**. Prewarm retains its distinct existing scheduling path pending original Play/eligibility closure. No product tests, application, build or visual capture were generated/run.

### Normal-frame partition and remaining time (BND-C50)

Reverse `e1c446d0d8fb8032f9e6723e896ffc475d345bda` and phase-order auditor `14fbc9a964ef5e333a027d7e9c6b627c651201d8` were verified, committed and pushed with clean remote `0 0` before consumption. `particle_frame_steps.json` SHA256 `ADAE43F51DEFC83BED2AC91CED2BDE12E1317164EAB52D70604EBC0C46E77C9F` retains original APK TimeManager PathID8 bytes/roundtrip, named time getters, eighteen full FDE/CIE bodies and 1035 explicit native calls producing 24997 steps. The original owner slice executes the full selector, update loop and every reached helper with empty SoA, stopped emission, zero delay, disabled modules and normal flags0; no callee stubs supply outputs.

Production now retains the native time remainder, clamps speed before multiplication, uses source maximumParticleDeltaTime Float32 0.03 and original rounded ceil partition, skips sub-1e-5 frames and preserves sub-1e-6 residue. The original long-frame branches above remaining5/10 seconds retain their conditional previous-step/duration selection. Each substep directly updates existing particles, removes expired rows, then processes emission/admission, following original1097D34/58/78 ->1097DF0/EA0. It no longer derives the existing-particle delta by subtracting rounded cumulative times or splitting it at birth timestamps. The remainder is initialized and cloned with its owner runtime.

The independent auditor executes the actual production dispatcher/arithmetic with transparent update observers and disabled emission, comparing 1035 step sequences and final remainders: baseline531 calls differ; current mismatch0. It also binds the production update/death/emission/admission order to the exported original loop. C45/C46/C48/C49 arithmetic/order audits remain mismatch0; both noEmit checks and runtime integrity audit1438 pass as compile/integrity information only. Native elapsed phase/start delay, real job flags and manager mutation, emission grouping/newborn age/padded immediate deaths, prewarm/deferred lifecycle and full renderer/bounds/shared sorting/HUD remain **OPEN**. The observer does not numerically execute particle modules and cannot close those gaps. No product tests, application, build or visual capture were generated/run.

### Source gravity Y accumulation (BND-C49)

Reverse `a500ff03741b26e261711bbbd12ef9b8cd91e5f5` was verified, committed and pushed with remote divergence `0 0` before consumption. Its `particle_gravity_step.json` SHA256 is `94A565C5F5D04041DCFBB3D35EBB16CAD52BA82EE17E691C592749E3DE6BEC8E`. Fresh1741-system reads confirm144 constant-0.3 and1597 zero gravity modifiers, all gravitySource0. Seven complete native bodies execute the gravity module and real installed-interface/getter/singleton chain with the C08 source PhysicsManager vector.

Production now multiplies modifier by delta before multiplying physical gravity. The exact Y-velocity assignment agrees for352 inputs/704 native world and explicit identity-inverse-space paths; baseline58 input rows differed. Both noEmit checks and the1438-entry runtime audit pass. Native outputs retain X/Z and transient clearing too, but this production comparison closes only Y accumulation.

Source systems serialize local space; the world branch is an explicit arithmetic probe. Actual owner transforms, sixteen local signed-zero X/Z cases, current manager initialization/mutation, full caller timing/lifecycle and renderer/shared sorting remain OPEN. The installed interface and source manager are explicit entry conditions, not a live observation or fallback. No product tests, application or visual capture were used.

### Aligned birth-batch publication order (BND-C48)

Reverse `318c3e7c5ce3dba958450867c2bc4ccb1f3a3c81` was verified, committed and pushed with remote divergence `0 0` before consumption. Its `particle_birth_order.json` SHA256 is `F3662F40861948EB52A2BAE8A694F009F1316B248A3B080B2E0006F910A69909`. Four complete bodies bind birth admission's aligned start and execute the original finalizer, row copier and count publication at360 explicit count pairs across15/50-stream states (720 native paths).

Production captures the existing count before a birth batch and moves the last new rows into the native alignment gap after all batch births. This preserves object identity and the original published order: old[A], new[B,C,D,E,F] becomes[A,D,E,F,B,C]. Baseline210 layouts differed; all360 actual helper calls now agree with720 native paths. The auditor binds the actual append expression and the final helper call after the birth loop. C46's535 death layouts/2140 native paths remain identical. Both noEmit checks and the1438-entry runtime audit pass.

The explicit input contains already-surviving birth rows. Immediate birth deaths, actual capacity admission, emitter grouping, normal/deferred update timing, current optional flags and complete lifecycle/rendering/shared sorting remain OPEN. The numeric finalizer result does not close its whole upstream caller. No product tests, application or visual capture were used.

### Generic MinMax curve evaluation (BND-C47)

Reverse `4b46e6ab50e13081a1b87260cba273b4bb4b7e47` was verified, committed and pushed with remote divergence `0 0` before consumption. Its `particle_minmax_curves.json` SHA256 is `0254CE913C774D46E1471C2E1B8355EE492AA1FE844E8B2B1E94FA9F455E4A39`. Fresh original full-read/roundtrip covers1741 systems,2987 enabled-module field references and172 distinct mode1/2 parameter records. Fields can be inactive axes despite their module being enabled. Seven complete original bodies execute the cache selector/compiler and general/fast SIMD sampler.

Production uses native coefficient/Horner arithmetic, scales coefficients before fast evaluation and scales values after general evaluation. Mode2 applies the same scalar to both curves and selects fast only when both curves are cacheable. The prior Hermite/separate-minScalar implementation differed in3889 of10160 explicit native lane values. Current10160 actual calls and172 cache decisions have zero mismatches;155380 exact parameter-reference comparisons also agree, but are not repeated wrapper executions. Existing C44 UV and C45 birth/age comparisons remain zero. Both noEmit checks and the1438-entry runtime audit pass.

These source curves are unweighted with clamp infinity modes. Cache selection assumes unchanged source publication; explicit time/ratio inputs do not establish actual caller coordinates or RNG ownership. Sampled versus integrated module dispatch, current mutation, lifecycle, full rendering/bounds/shared sorting and HUD remain OPEN. No product tests, application or visual capture were used.

### Particle death scan and survivor order (BND-C46)

Reverse `3969052c216523ed0da4b6952e7f763ee34b9ba4` was verified/pushed before consumption. `particle_death_order.json` SHA256 `6CF879EE8B7E569B47A8BAB03FA19AAF93D3F76E4B77CCE9A312E4133A4A270D` executes both original death scanners, full swap-last row copying and count publication across535 explicit layouts and2140 native paths. All masks for counts0..8 plus selected12/16/32-row layouts are covered. Two explicit optional-array configurations retain15 and50 parallel streams, with callbacks and trail retention absent.

Production now captures each four-particle death mask, deletes high lanes first, fills gaps from the current last particle and rechecks the group. Surviving object identity is preserved. Stable filtering previously differed in346 layouts; for example removing A from[A,B,C,D] leaves[D,B,C] natively. All535 actual removal calls agree with all2140 native paths. C45's lifetime/age comparisons remain zero, both noEmit checks pass and the1438-entry runtime audit is current.

This closes survivor ordering at the existing removal consumers, not their complete invocation timing. Source ringBufferMode0 comes from C45; current callback/trail/optional-array flags, birth admission and scheduler, other module arithmetic, full renderer/shared sorting and HUD remain OPEN. Explicit padding outside count is masked by original indices. No product tests, application or visual capture were used.

### Particle lifetime reciprocal and percentage age (BND-C45)

Reverse `b252780a265697c0d97243e4b2dacc89b577c300` was verified/pushed before consumption. `particle_age_state.json` SHA256 `8E94EFF27A77B7573EB893834D22E179EB213B7167F2C26C1CD1B9D596F02C63` freshly binds all1741 registered source systems to ringBufferMode0 and lifetime modes0/3. Original birth clamps sampled lifetime at Float32 `1e-5`, computes its reciprocal with FRECPE and two FRECPS refinements, and initializes percentage age to zero. Each update adds `(delta*100)*inverseLifetime` to that state. The normal-mode cap is bits`42C80001`, already-over100 rows preserve their value, and death uses strict greater-than100.

Production now keeps the percentage and inverse-lifetime fields, uses their original update and normalized-age factor for both module/render consumers, and preserves the equality boundary in both expiry consumers. Elapsed seconds retained in the diagnostic sample are separate from the native percentage state. Independent comparison has zero mismatches across97 birth inputs,768 estimate buckets,16597 update/boundary calls,3701 source sampler calls and3701 source state constructions. The old expressions produced5437 differences in this explicit input set. C44's281 values/phases, four caches and559 frame calls remain identical. Both noEmit checks and the1438-entry runtime audit pass.

This closes these arithmetic/state substitutions for source ringBufferMode0, with explicit ratios/deltas and birth multiplier1. Continued-dead-row samples probe arithmetic preservation only. Current override/seed/scheduler/Play state, death-list removal timing/order, complete other modules, sample diagnostic field equivalence and full renderer/bounds/shared sort/HUD remain OPEN. No product tests, application or visual capture were used.

### Texture curve phase and cached/general evaluation (BND-C44)

Reverse `5742c10698b50f7407db951b4abfbacb17b90e42` and auditor dependency follow-up `0649e8280e6766c2c8a80ca7c9f4f5ce918b4e07` were verified/pushed before consumption. `billboard_curve_frames.json` SHA256 `933BBA9C73B8F9B84009E8699F953E0ADCB79199B0EBCC5B9C2324C4134B4320` executes the full original constant-start UV workers and unweighted general evaluator on the24 C43 curve systems:12 curve/scalar pairs, four native-cacheable and eight general-only. Source keys use clamp infinity modes and cycles1. Both native paths remain separately recorded for cacheable pairs.

Production now wraps time before evaluating the curve and uses the original coefficient/Horner order. Fast caches multiply each coefficient by the scalar first; general intervals multiply the evaluated polynomial afterward. The old production functions differed in92 evaluated values and104 actual frame-index calls across the explicit input set. The repaired comparison has zero mismatches across281 values,281 phases, four cache coefficient sets and559 actual source-wrapper calls. C43's150 constant/random inputs and1143 wrapper calls still agree. Both TypeScript noEmit checks and the current1438-entry runtime audit pass; they are compilation/integrity checks only.

These are source-parameter and explicit arithmetic-input comparisons. The auditor supplies the native normalized-age consumer value; current SoA age-percent production, lifecycle, seed/cache mutation and complete dispatch are not closed. The general evaluator's cold-cache sentinel is explicit, and fast selection is conditional on unchanged source cache publication. Source material/custom data, flips, normals, owner composition, full bounds/shared sorting and HUD remain OPEN. No product tests, application or visual capture were used.

### Texture frame Float32 wrapping (BND-C43)

Reverse `bfc1f2b95add885ccf074d0529b06424d16a673e` and auditor follow-up `0e2ee955589d2f7666199bb10fc762caa5040e07` were verified/pushed before acceptance. `billboard_frame_wrap.json` SHA256 `E19F81BEC2F2D387F8C3E6A7BCE9ADD453B6E960383FE48C63C287190C386C42` binds original constant/random frame interpolation, Float32 sum/wrap, tile multiplication and integer conversion. Production now wraps the Float32 sum before scaling to a frame cell. The old expression differed on two explicit numerical boundaries; for example `0.5 + 0.4999999701976776` with64 tiles gave63 previously and0 natively. These are arithmetic boundaries, not claimed observations of current source particles. All150 native inputs and1143 actual source-wrapper calls now agree, covering891 constant and36 random-constant systems. Source startFrame is constant and cycles=1. The24 curve systems and their native time phase/cache evaluation, current seed ownership and remaining renderer gaps stay OPEN. No product tests/app/visual capture were used.

### Source billboard integer-frame UV tiles (BND-C42)

Reverse `c2ba7e690e72655aae46d33346ea8c40ed5fc120` was verified/pushed before comparison. `billboard_uv_tiles.json` SHA256 `A9327A2810873C3E62A859FA806CAE172DF7FF2D845F86DA7E401BD3EC5961DE` freshly binds 1,025 billboard UV modules, four named getters, original effective-dimension/packed-flag preparation and UV0 stores. All active source grids use power-of-two dimensions and whole-sheet animation. Across 11 prepared states and 168 native integer frames, all 1,025 actual production tile bindings and 22,096 UV calls match bits; no production change is required at this stage. The UV comparison uses a neutral material, zero custom data and exact portable Y conversion. Disabled modules' effective 1×1 dimensions are verified, but their dormant default UV stream is not executed by this extraction. Frame curves/random/cycles and noninteger inputs, source material/shader/custom data, renderer flip, other streams/modes and full renderer composition remain OPEN.

### Complex billboard coordinate composition (BND-C41)

Reverse `d38ace5cc6f4da769f09ee1d82d9da0a48826376` was verified/pushed before comparison. `billboard_complex_vertices.json` SHA256 `8634465EFF4D369E96F39290F4047ED345A08D2641B1697156F76C8E356AE7FC` executes the original raw pivot, scalar/3D polynomial and basis, four offsets and center addition as one bounded chain. All 4,660 branch comparisons and 1,644 actual source-wrapper calls match Float32 bits. No additional production algorithm change is needed for this composition. The C37 pivot auditor now follows the actual basis consumer; its 60 native inputs, six boundaries and 200 wrapper calls also pass. Half sizes/raw sizes/angles/centers are explicit arithmetic inputs. Outer-owner transformation is excluded from this comparison; current SoA and curve evaluation, normals/flips, UV, mesh/stretch, bounds and shared sorting remain OPEN.

### Simple billboard diagonal and center arithmetic (BND-C40)

Authoritative source: Reverse `87b755cddd01df9b1124092efacb4ea59df0a770`, verified and pushed before production consumption. `billboard_simple_vertices.json` SHA256 `CEE74799594E8290A1DA5FC9ACCCCFCAAAB4191A2BBF27BD840437F8AC40346F` binds complete original scalar/3D workers and the UV helper through FDE/CIE records. Both simple paths generate two diagonal offsets, then publish `center+d0`, `center+d1`, `center-d0`, `center-d1`. The scalar path scales native polynomial sine/cosine by half sizes before rotating diagonals; the 3D path rotates its basis first and then forms `Y-X` and `X+Y`. Production preserves both arithmetic orders and center subtraction, including signed zero, instead of independently rotating four corners. The source grid UV stores require canonical perimeter reordering `[3,2,0,1]`.

The independent audit compares 4,560 native branch calls and 10,656 actual source-wrapper calls with zero Float32 mismatches. Its 2,280 explicit arithmetic inputs reuse 190 source/explicit bases and 12 angles; interleaved simple-worker trig also agrees with C38. C39 identifies 888 conditional simple systems (856 scalar,32 rotation3D). Half sizes and centers are explicit inputs, not observations of current particle state. Existing outer-owner transformation remains independently OPEN; the center helper consumes its resulting diagonals without claiming that transformation is native-equivalent. Current SoA37/38 and rotation evaluation, normal/flip, UV tile/material arithmetic, full complex vertices, mesh/stretch, bounds and shared sorting remain OPEN. No app, visual capture or product-generated expected is used.

### Size-axis requests select complex billboards (BND-C39)

Authority: `simulator-particle-bounds-calculation-10-1-4/billboard_complex_dispatch.json`. Fresh source reads/roundtrips cover1025 enabled PS/renderer pairs. Original dispatch produces137 complex source references under the registered module-requested SoA inputs: ten significant-pivot systems and127 additional zero-pivot systems with enabled Initial.size3D, SizeOverLifetime.separateAxes or SizeBySpeed.separateAxes requirements. All1025 serialize allowRoll true and UV mode0. Production now includes these positive size-axis requests in the same coordinate/rotation branch, so equal current size components or zero pivot do not erase a native complex-path requirement.

The independent audit compares1025 actual source gate calls,137 raw-pivot coordinate calls and1644 rotation wrapper calls against original dispatch/edge/basis expected. The source domain has zero enabled SizeBySpeed modules, so the production schema exposes only Initial and SizeOverLifetime size-axis requests; no unsupported module key is introduced. This closes the omitted positive size-axis branch only. A negative module requirement does not establish runtime38=0; runtime37/current SoA preparation remains separate. The888 conditional simple references, full vertex/UV/normal composition, outer Transform, mesh/stretch, bounds and common sorting remain OPEN.

### Complex billboard scalar and 3D rotation bases (BND-C38)

Authority: `simulator-particle-bounds-calculation-10-1-4/billboard_rotation.json`. Significant-pivot billboards now rotate the basis with the original Float32 polynomial and operation order before multiplying their edge coordinates. Scalar and3D branches remain distinct: they use opposite turn factors and cannot be merged when X/Y angles are zero. The production branch wrapper considers Initial rotation3D, Shape alignToDirection and both rotation modules' separateAxes requirements. In the ten C37 source systems, six request3D and four do not; all serialize allowRoll true and exclude sprite mode.

The original worker slices cover190 bases and2280 explicit angle triples. All2280 scalar/3D basis comparisons and22800 actual wrapper calls match Float32 bits. Named getters and eight full FDE/CIE bodies bind source flags and the positive native SoA2003 requirement path. This comparison is conditional on prepared source module state: current runtime37/SoA flags, source rotation curve evaluation and camera-roll correction are not proven by serialized requirements. Complete final vertices/UV/normals, zero-pivot simple or size3D complex branches, outer composition, mesh/stretch rotation, bounds and shared sorting remain OPEN.

### Significant billboard pivot before rotation (BND-C37)

Authority: `simulator-particle-bounds-calculation-10-1-4/billboard_pivot.json`. The original dispatcher uses the strict Float32 squared-norm threshold1e-5 with ordered `(x*x+y*y)+z*z`. All10 enabled source billboards with nonzero pivot exceed this threshold, and their serialized UV modules exclude sprite mode1. Both original complex workers use positive `(rawX*pivotX,rawY*pivotY,rawX*pivotZ)` offsets, then add/subtract the separately limited half sizes. Production now applies these pre-rotation coordinates through its real raw-size consumer, replacing subtraction of pivot multiplied by the clamped size for this confirmed branch.

The independent audit executes60 native arithmetic inputs, six explicit boundary inputs and200 actual production wrapper calls; Float32 mismatches are zero. Its first attempt stopped on a missing `f32` dependency before comparison; the corrected dependency closure was rerun and pushed. Full scalar/3D rotation and final vertices, the simple branch and current SoA dispatch, sprite offsets, normals, outer composition, mesh/stretch pivots, bounds and shared sorting remain OPEN. This scoped coordinate repair is not complete billboard equivalence.

### View billboard camera basis and scale placement (BND-C36)

`simulator-particle-bounds-calculation-10-1-4/billboard_view_basis.json` executes the source APK GameCamera/self/parent Transform chain through original inverse-Transform, Z reflection, NEON matrix multiplication and particle inverse-camera instructions. The View worker consumes inverse columns `(1,-0,-0)`, `(-0,1,-0)`, `(-0,-0,-1)` and applies Transform scale by rows. Production now uses these source-bound columns with the ordered Float32 row-scale operation, instead of scaling particle size before its existing rotation and applying a unit basis. The current billboard half-size correction remains before this basis.

The source extraction covers540 C35 source/setup scale inputs and binds six FDE/CIE bodies plus one hand-written NEON body with independently recorded adjacent export/RET boundaries. The latter has no FDE and its exported symbol has size0. Native expected comes from original instructions with initialized-read, bounded-write, completion and branch checks. All540 helper comparisons and3096 actual production wrapper comparisons match Float32 bits. This closes the conditional source-camera View basis substitution only. Current camera/Transform mutation, scalar/3D particle rotation, pivot, outer-owner composition, normal stream, complete quads, bounds and mixed sorting remain OPEN.

Authority: `simulator-particle-bounds-calculation-10-1-4/particle_bounds_calculation.json`, `serialized_bounds_curve_extrema.json`, `particle_bounds_size_state.json`, `serialized_bounds_source_domain.json`, `particle_bounds_gravity_input.json`, `serialized_bounds_curve_cache.json`, `serialized_bounds_active_motion_inputs.json`, `particle_bounds_space_transform.json`, `serialized_velocity_ranges.json`, `particle_bounds_system_math.json` `serialized_velocity_ranges_system_math.json` `particle_bounds_cache_read_publication.json`, `serialized_constant_motion_ranges.json` `particle_bounds_velocity_copy_flow.json` `serialized_velocity_caller.json` `particle_bounds_size_tuple.json` `particle_bounds_particle_metadata.json` `particle_bounds_size_writers.json` `particle_bounds_size_expansion.json` `serialized_bounds_union_extrema.json` `serialized_bounds_pivot_source.json` `particle_bounds_final_padding.json` `particle_bounds_runtime_scale.json` `particle_bounds_transform_selector.json` `serialized_bounds_hierarchy_scale.json` `serialized_bounds_size_axis_products.json` and `particle_bounds_mesh_cache.json`, BND-C01..C31. Original icall field loads and serialized Keyframe literals are bound independently of decompiler names. The bounded calculation bodies retain their direct-call dependencies; exporting them does not close every helper or global.

The original bounds-extrema instructions consume 25 distinct raw HAB curves (9,504 references across eleven MinMaxCurve fields in 432 byte-roundtripped systems). Native Float32 results include maxima `0x3F800001`, `0x3F800002` and `0x3F7FFFFF`; key-value maxima or a clamp to 1 are not equivalent. Disabled modules and inactive curve sides are inventory, not execution claims. The extractor's FPCR=0 is explicit, not a device observation. This bounds helper does not establish the separate live particle module evaluator.

SoA byte +2004 is not Main size3D's serialized byte. Enabled Main and separate-axis size modules request its allocation; the requirement finalizer clears it only when no local requirement remains and runtime +38 is zero. Enabling copies existing array data rather than merely toggling a boolean. EmitOld/EmitParams/SetParticles have conditional +38 writers, and the reset body clears +38 and float bits +436. These are positive source paths, not proof of current Play state, exhaustive aliases or a default-zero runtime size input.

The fresh ordinary/directional source union contains 1,741 systems across 27 resources, retaining historical 1,375 and HAB delta 366 separately. All serialized Lights/Trail flags are disabled and UV mode is 0, independently of UV activity. This narrows source branches, not later mutation reachability or Game-clear. Gravity is not uniformly zero: 144 systems have constant scalar bits `0xBE99999A`. The native 3D interface and named Physics.gravity getter read the same singleton fields; APK PhysicsManager10 supplies source gravity, but current manager state and its complete transfer/initialization remain open.

Native cached and general integrated-curve ranges are separate paths. The HAB compiler audit covers 62 curve/scalar pairs (59 cacheable) and only the 36 source-written cache bytes, without inventing padding. A separate fresh source sweep identifies two constant Force rows, eighteen constant Velocity rows and thirty-two curve-mode Velocity rows. Their active curve inputs contain two noncacheable two-key curves, so key count alone cannot select the fast path. Those compiler audits alone do not execute complete integrated ranges or prove current MinMaxCurve cache flags/live evaluation.

Subsequent extraction proves that two cached-range wide loads discard their undefined padding lane before use; no padding is supplied or marked defined. The original derivative-root helper imports system math. A registered R0 observation of an already-running original process binds its three resolved math slots, seven complete math bodies and 128 file-backed data bytes to one Android 13/SDK 33 ARM64 library. It uses no app launch/input, hook, remote call or memory write. With these original instructions, all eighteen cacheable velocity inputs and all twenty general-path inputs complete; fifteen shared inputs yield different intervals. General construction retains its native final endpoint `0x3F8147AE`, approximately 1.01, rather than normalizing to 1. Current cache publication therefore cannot be guessed or replaced by a supposedly equivalent branch.

These are conditional helper executions, not full MinMaxCurve caller/union execution or current owner state. The system-library identity is environment-specific; FPCR=0 and opaque stack-guard/address scaffolding are explicit offline ABI settings, not device observations. Nonconstant Force integration, complete caller execution and live evaluation remain separate gaps.

The binary-read publication follow-up binds seven complete bodies through original ELF FDE/CIE records. It verifies 29 positive compiler-argument/byte6-bit0 publication sequences, including the MinMaxCurve binary reader and the additional per-curve publications in Velocity/Force module readers. The particle binary-read owner passes the same payload-relative module bases as bounds. Named-field transfer code is kept distinct from binary reads; neither exported path nor positive publication proves current Play flags, complete deserialization/dispatch or absence of subsequent mutations.

The complete constant-mode velocity/force range callers execute sixty registered source-axis references (24 module-set/axis executions), without supplying or reading byte6, curve pointers or cache padding. Ninety-six nonconstant source-axis references are excluded from that execution. Force's constant interval uses the original Float32 half-scalar; this does not close lifetime/space scaling or current module values.

A separate static follow-up traces both velocity caller 48-byte copies. The twelve bytes outside the compiler-defined 36 bytes stay undefined through copies. The complete integrator only accesses bytes0..31 and kills incoming Q0 before arithmetic; local range accesses use coefficient selectors0/1, the four-byte split, and the two proven dead-lane loads. This proves local copy/access dataflow, not allocation/initialization or full caller execution with stack/register definedness tracking. It does not authorize supplying padding values or enlarge earlier extraction permissions.

The subsequent complete mode1 velocity caller extraction propagates byte definedness through those original copies instead of treating stored padding as initialized. All twenty inputs behind 96 source axes complete (eighteen cached, two general), with intervals bit-identical to the corresponding committed native helper results. Its cache bit is conditional on unchanged source inputs passing through the original compiler/publication path, not an observed current flag. Only the proved copy/dead-lane reads are permitted; other unknown reads reject. This closes that conditional mode1 caller execution, not mode2, current owner/Play state, lifetime/space scaling, nonconstant Force or full bounds.

The size-tuple follow-up binds eight complete bodies and named GetParticles/current-size3D APIs: SoA +672/+704/+736 map to particle +84/+88/+92 and ordered vector return slots 0/4/8. Actual SoA byte2004 controls distinct second/third components versus replication of the first. The enabled size-lifetime/size-by-speed applications remain visible in the complete code, but were not executed by this extraction. This corrects tuple provenance without assigning unproved animated/base identities to +768/+800/+832, proving current API reachability, or treating byte2004 as Main.size3D.

The raw APK metadata/ELF follow-up binds all seventeen Particle fields, the enclosing ParticleSystem/image and m_StartSize's Vector3 type. Registered instance/native sizes differ by sixteen bytes, independently corroborated by five named method-token/module-pointer bindings and their original unboxed getter/setter accesses. Together with the previous tuple transfer, particle +84/+88/+92 is m_StartSize.x/y/z; Vector3 x/y/z are offsets0/4/8, not the first three metadata fields (two static constants precede them). DummyDll was navigation only. This closes field identity, not all SoA writers, alternate arrays, current state or full bounds.

Positive size-module writer bindings now identify +768/+800/+832 as outputs of the original SizeLifetime/SizeBySpeed paths. Lifetime multiplies +672/+704/+736 into those outputs; Speed selects the preceding outputs or start-size arrays using the caller's lifetime-enabled flag. Four complete bodies retain native positive-zero modifier limits, cached/general evaluation and exact age-coordinate F32 factor `0x3C23D70A`; the existing complete pipeline slice was verified against original bytes. This is not an executed writer/lifecycle audit: later noise writes, allocation/current flags, seed ownership and live general evaluation remain open. The actual stretched-bounds branch explicitly reads +672, so a blanket substitution of module-output arrays is not authorized.

The shared bounds-tail binding distinguishes raw upper-extrema expansion from those live size writers. It binds the original unit-vector initializer/GOT, actual SoA2004 one/three-axis choice, upper start-size/lifetime/speed extrema products, mode4 coefficients, runtime436 comparison and renderer pivot496/500/504 absolute-maximum multiplication (not Transform scale). The native F32 subtract/add uniformly expands runtime min/max; algebraic cancellation before the later center calculation is not authorized. Complete existing bounds/initializer bytes were verified, but no current inputs or full bounds execution were supplied. Current component/cache/pivot values and globals/flags remain open. C21's preceding Vector3 static-literal attributes are now explicitly bound to original metadata/native-type bytes as well.

The raw curve-extrema corpus now covers the complete registered ordinary/directional union: 27 resources, 1,741 fully read/byte-roundtripped systems, 38,302 references, 479 reference sets and 130 raw curves. Historical 1,375 and HAB delta366 remain separate. All distinct raw curves execute the original extrema helper with stack byte write-before-read checks; emulator callee-save scaffolding is not a device/register-taint observation. Historical HAB 432-system references and 25 extrema results remain unchanged, and the old extractor still regenerates exactly. This covers source raw extrema, not current MinMaxCurve/scalar combinations, the shared size-expansion caller, full bounds or Game-clear.

The pivot follow-up explicitly reconciles those fields with C01's named original get_pivot_Injected binding. Fresh complete renderer/ParticleSystem read and byte roundtrip validates source pivots and same serialized GameObject associations for all1,741 systems. Historical1,375 contains1,305 positive-zero pivots,56 with negative-zero Y and14 nonzero Y pivots; HAB delta366 is positive zero. These are not current values, no-later-setter evidence or permission to eliminate F32 arithmetic for zero pivots. Any navigation label calling this triple Transform/hierarchy scale is rejected; no such extra scale has been added to production.

A distinct final padding stage follows pivot expansion. Original F32 `0x3F35C28F` (approximately0.71), not sqrt(0.5), multiplies the scalar; simulationSpace1/2 additionally use runtime348/352/356 absolute maximum. Four complete FDE/CIE bodies, named simulationSpace/UV.mode/Lights.enabled bindings and positive caller-pointer transfers separate this runtime triple from renderer pivot. The two rounded min/max expansions cannot be merged. Source union Lights.disabled/UV.mode0 does not establish current flags; runtime-triple producers/scaling semantics, current values and full bounds execution remain open.

Positive runtime-scale producers now bind named Main.scalingMode76 and Transform.localScale record fields. Preparation uses the original hierarchy helper for mode0, localScale record copies for mode1 (with owner/descriptor selection), and original unit writes for other values. Runtime348/352/356 and adjacent336/340/344 remain distinct. The complete Emit-count path saves both, performs temporary preparation and restores both: intermediate writes do not prove current values. Eight new full bodies and a byte-verified reused body establish positive provenance only; hierarchy-helper mathematics/current Transform/effective-space/lifecycle and complete bounds consumption remain open.

The preparation argument is now bound as a transform-descriptor selector, not a direct Main.simulationSpace enum: ordinary space0/1 maps to selector0, custom space2 to2, and enabled Shape source-object types13/14/20 to1. Six named icalls bind custom/source reference fields. Original object resolution conditionally writes a descriptor; a positive Emit-count caller initializes both pairs beforehand. This does not authorize invented fallback values, equating selector1 with Main.World, or assuming all callers/current object graphs match. Nine complete new bodies and three reverified reused bodies retain unresolved lookup/global dependencies and lifecycle boundaries.

The hierarchy-scale helper now executes all189 distinct serialized quaternion/scale chains behind the registered27-resource/1,741-system domain. Fresh full read/roundtrip covers1,741 referenced Transforms, maximum chain length3; historical1,375 and HAB366 remain separate. Two original named localRotation bodies and eleven literal vectors bind input layout/arithmetic. Fourth scale lanes stay undefined: only three exact source-proved dead-lane reads are permitted, all other unknown reads/native stores reject, and only three output F32 components are exported. This is conditional serialized-input execution, not native transfer/normalization, current Play/Transform mutation, a generic hierarchy product or full bounds/renderer consumption.

The original pre-coefficient size-axis region now executes5,223 explicit serialized axis references as458 distinct inputs. StartSize covers modes0/3; enabled Lifetime covers0/1/2/3, including nineteen distinct two-curve inputs;189 skip Lifetime. No source input enables SizeBySpeed, so that branch is retained but not numerically covered. Original interval/scalar/upper-lane products and bounded stack write-before-read checks are preserved. Execution stops before renderer coefficients, actual2004 axis reduction, runtime436, pivot/final radius or publication; retaining all source axes does not invent current axis-count flags or close full bounds.

The mode4 coefficient follow-up binds renderer764..784 as mesh-cache min/max through eight complete bodies, five named Mesh/Renderer icalls and a positive mesh setter→refresh→bounds path. Original four-slot lookup/readability/subMeshCount1 acceptance feeds tuple subtraction/addition and cached min/max; mode4 uses twice per-axis maximum absolute cached bounds, with separate actual2004 folding. Pivot496 and SoA768 are different owners/fields. No cache/coefficient numeric execution or current reference/global state was supplied; fresh mesh source accounting, all mutations and full publication remain open.

Named space getters bind the bytes tested by the motion bounds helpers. Their nonzero branches copy the supplied matrix, replace translation with a shared vector, and execute an eight-corner Float32 AABB transform rather than a center/extent shortcut. ELF initializer-array metadata and RELA bind original writes of positive-infinity and zero vectors used by these helpers. Positive initialization is not a current matrix/global-state observation or proof of no later writes; this transform was not executed by the extractor.

Production bounds and mixed ordering remain unmodified by this evidence-only batch. Remaining inputs include complete SoA identities, current lifecycle/mutation reachability, shape/helper/global and light/UV caches, Float32 padding/publication and concrete mixed-renderer ties. No source inventory or isolated curve arithmetic result closes those integration gaps.

## Acceptance boundary

The production route is connected: platform composition creates the deterministic particle backend and Pixi particle renderer; simulation samples flow through `buildCurrentParticlePrimitives` into mesh preparation and commit. No bypass to the old simulation has been found. That callgraph fact does not prove appearance or explain all missing particles.

Current ordinary scene/HUD and selected rendering/HUD/Skin gates remain `observational-gap`; Skin settings retains only its static portable resource-selection claim. All-Skin, final mixed composition and terminal particle presentation are not closed by old primitive digests. CS-V1 and Live Auto AP remain product semantics. Application/framebuffer execution is not part of this re-audit; TypeScript and contract checks are compile/integrity information only. No product tests, fixtures or harnesses are added or changed.

### BND-C125: current source Local mesh basis

Reverse `622557beb880e20a6a29ff0ca3fe8fe238f0773b` was verified and pushed before consumption. All146 source Local mesh objects join C109/C81 by resource, semantic identity and byte hashes. Their25 Transform chains, including nonidentity X rotations, feed original12AD7F4..12AD8C0 and complete12BC4AC through actual vertex/normal stores. All292 scalar/3D numeric cases (1168 vertices and1168 normals) match the complete sourceGeometry output; no algorithm modification was necessary. Corpus SHA `ADC87EDBB5610613A38F831F247CE52819FE580F9A99AE2C5B6EF3293A81BE37`.

This closes these source-unit Local inputs only. Generic axis rotation is not asserted equivalent for arbitrary transforms. Current dynamic owner/setup, actual angle/storage/stream admission, View, outer publication, full lifecycle/bounds/sorting/HUD and aggregate parity remain OPEN. No tests/app/build/visuals.

### BND-C127/C128: final mesh normal publication under an identity owner

Reverse `bd57a0b4401dd0aadbe13ead49ea92891a7f0186` independently executes actual complete buildPrimitive against immutable C117 normal stores. Under an explicit identity owner linear transform,748/896 cases and75519 normal components differed after the previously correct inner stage. The outer generic normalization replaced zero normals with fallback-Z and rounded native normalized values again. Mesh normals now retain their native bytes in this owner boundary, followed only by the portable Y sign-bit reflection. All896 cases/74368 final normals agree; C125292 source Local cases remain exact.

Nonidentity owner transforms and their inverse/scale ordering remain OPEN, as do current stream/format admission, View, full lifecycle/bounds/sorting/HUD and aggregate parity. Executed position/UV/color dependencies are not accepted outputs. Both noEmit checks and runtime-contract audit pass as compile/integrity information only; no tests/app/build/visuals.

### BND-C129: source View mesh matrix and geometry

Reverse `d4148ce39a69f5a91aaea48351ce857dc1c4cf1e` was verified, pushed and synchronized before consumption. Fresh14 View renderers retain source allowRoll=true; the original camera inverse-view columns enter the actual View worker, which negates its Z basis and clears roll offset. Complete12BD40C and original vertex/normal stores agree with sourceGeometry for all56 scalar/3D and age-boundary calls:18856 vertices and18856 normals. Corpus SHA `7B270EC1C335708A29B3DFFA37431F802C4AA49797C7F33E4B2E1956AA099588`. No production change was necessary.

Current CPU/GPU instancing selection, stream/format admission, dynamic owner/camera, outer position publication, complete lifecycle/bounds/sorting/HUD and aggregate parity remain OPEN. Explicit unit scale/zero center/no flips and numeric angle/size boundaries are retained.

### BND-C131/C132: mesh world-coordinate publication

Reverse `fed2d06017be110668fdd518aefdd094fc94e20b` was verified and pushed before consumption. The independent auditor retains actual buildPrimitive statements through worldVertices and compares immutable C109/C111/C115 Local plus C129 View CPU stores. Under an identity outer owner, three explicit screen maximum fractions expose689 differing cases/125146 coordinate components in2856 calls. The product applied an extra projected-dimension clamp after mesh construction; the original mesh matrix/vertex path has no such final clamp. That extra rescaling and its unused projection-size helpers are removed. All279672 final world vertices now match; all74368 C127 final normals remain exact.

Raw Billboard/stretched size limits still belong to their native construction paths. These numeric maximum fractions do not establish current renderer values or GPU admission. Nonidentity owner matrices, current stream/format routing, full lifecycle/bounds/sorting/HUD and aggregate parity remain OPEN. Both noEmit checks and runtime audit pass as compile/integrity information; no tests/app/build/visuals.

### BND-C133/C134: center and mesh pivot addition order

Reverse `7d041f56361b6b507caa946351f96d42274dc39d` was verified and pushed before consumption. Original complete12BC4AC plus vertex stores at three explicit nonzero centers expose33 differing cases/111 components in672 calls. The matrix combines center with transformed pivot before adding a transformed vertex. The product formerly added center after pivot-plus-vertex. Under an identity outer owner, mesh geometry now receives worldCenter when constructing its native matrix translation and publishes the resulting world vertices directly.

All55776 nonzero-center world vertices match, as do279672 previous world-position probes and74368 final normals. Numeric centers do not establish current position-producer or owner reachability. Nonidentity owner transforms, source streams/format/CPU-GPU routing, full lifecycle/bounds/sorting/HUD and aggregate parity remain OPEN. Both noEmit checks and runtime audit pass as compile/integrity information; no tests/app/build/visuals.


### BND-C135/C136: stretched per-vertex normals

Reverse `fc2f1e715ccd21fc9473820827debbe766393294` was verified, pushed and synchronized before consumption. Named normalDirection field484 flows through descriptor28 and the original coefficient preparation including Android13 cosf. Source direction1 yields B33BBD2E, not exact zero. Original writer12C39C4 separately normalizes world side and tail-minus-head using its Float32 sum/refinements and distinct +X/+Y degeneracy values. It combines their cross product and coefficient into four vertex normals without another normalization.

The product replaces its constant four -Z normals with that algorithm and native grid ordering. All792 live rows agree on position/UV/normal output, eliminating9066 normal component differences;168 age>100 rows remain separately retained. Corpus SHA `48E0C001D3786D874D0B81786A4A4AB0BF0A40008940530A9057DA23FA7E98C5`. This binds the source direction1, explicit current camera/unit owner/raw sizes and24 source Velocity configurations, not all cooccurring states or arbitrary cosf inputs. Other normalDirection values, Billboard normals, current source streams/owner/lifecycle/bounds/sorting/HUD and aggregate parity remain OPEN. Both noEmit checks and runtime audit pass as compile/integrity only; no tests/app/build/visuals.


### BND-C137/C139: Billboard normal inputs and coefficient

Reverse `67baeaaa8c16449cbbc71bd16053f521272673f4` was verified and pushed before consumption. Fresh1471 enabled renderers retain normalDirection0/0.07/1; Billboard mode0 uses the original cosine multiplied by binary32 3F3504F3. Simple workers pass two diagonals, while complex workers pass their first two native perimeter offsets, including raw pivot and rotation. Original complete12C39C4 outputs are the only expected normals. Corpus SHA `83090A0BC598ECA81413BD54CE650F750F94D07E7851DD36D406ACD72C4A13BA`.

The actual sourceGeometry suffix now passes those same two offsets to the shared native quad-normal arithmetic and applies the Billboard grid order. Its generic quaternion/-Z interpolation/final normalization is removed. All27660 simple/complex/scalar/3D/source-direction cases and110640 normals agree, eliminating311616 component differences. C135's792 live stretch rows remain exact. The native half-size/basis inputs are explicit partition boundaries; current producer/cooccurrence/stream admission, outer normal publication, owner/lifecycle/bounds/sorting/HUD and aggregate parity remain OPEN. Both noEmit checks and runtime audit pass as compile/integrity only; no tests/app/build/visuals.


C139 compile correction: the initial bcf3307c commit retained unused eulerQuaternion, so both noEmit checks reported TS6133. The initial compile-pass statement above was premature. The follow-up removes that unreferenced legacy function; both noEmit checks and runtime audit1438 now pass. Native expected and the zero-difference normal results are unchanged.


### BND-C140: all source stretch normal directions

Reverse `7fd39b9162e77d01c93712a8147b2c391267b1ac` verifies original mode1 field/coefficient/cosf/worker output for all three directions0/0.07/1 present in286 enabled stretch renderers. All720 calls/2880 rows reproduce; actual update/samples/geometry/UV agree on2376 live rows, with504 nonlive rows separate. No further algorithm change was needed. Corpus SHA `241906D758B15FD9A97069F1D6321A0983A8622EAC3E0454E14013BDB11FEC72`; current setters/cooccurrence/streams/owner/fullrenderer remain OPEN.

### BND-C141/C142: final Billboard normal publication

Reverse `7b232ec42544018d51eaf98866f2d1d48b1f06a7` was verified and pushed before consumption. The actual buildPrimitive final normal selection/normalization/buffer-write partition changes25074 of27660 native Billboard inputs, totaling279204 components, under an identity owner. Quad normals are not necessarily unit vectors, so generic re-normalization alters the algorithm. The identity-owner predicate now preserves native quad normals as it already did for mesh normals; portable Y sign-bit reflection remains the final coordinate conversion.

All110640 final Billboard normals agree. The896 complete mesh primitive calls/74368 normal buffers remain exact. These are explicit native-input publication checks; preceding current source/stream association, nonidentity owner/lifecycle/bounds/sorting/HUD and aggregate parity remain OPEN. Both noEmit checks and runtime audit1438 passed before this commit. No tests/app/build/visuals.


### BND-C143/C144: continuous Billboard world output

Reverse `767bd5d768d7a1f4fceb3fee11c81a6c5d79fd23` was verified and pushed before consumption. All four scalar/3D/simple/complex workers execute from entry through the real scalar/3D gather and complete native writer after107A0DC camera/matrix preparation. Explicit mixed rotations, matching raw sizes/storage flags and source motion/matrix/age inputs produce3840 native rows. Corpus SHA `73A9C106E7E6D04DC714E5E43E4917A1707C46BA3BB7F3C351C036EEE2DC102B`.

Actual updateParticle/samples/buildPrimitive through worldVertices/worldNormals agrees on all3168 live rows;672 nonlive rows are retained separately. No new product algorithm change was required. View/allowRoll/zero pivot/direction1/unit outer owner and conditional numeric renderer inputs bound this result. Source cooccurrence/dispatch/streams, Local/nonzero pivot/owner and full lifecycle/bounds/sorting/HUD remain OPEN. No tests/app/build/visuals; prior C142 compile/integrity results apply to unchanged production.


### BND-C145/C146: continuous Local/View and source pivot output

Reverse `0558ed9c572bd51ec9aa0b17aa6e02193f0e7783` was verified and pushed before consumption. Original camera/matrix preparation and all four Billboard workers cover22 combinations of View/Local alignment, scalar/3D storage and five source pivot bit triples across24 source Transform configurations. All5280 calls/21120 native rows reproduce. Corpus SHA `DC88EB83A60EC9A6EA9BD158329923CB1668D970BC07FD1092D3CDDBD4387FA1`.

The actual update/samples/buildPrimitive world-output chain agrees on all17424 live rows and69696 vertices/normals;3696 nonlive rows remain separate. No product change was required. Source scalingMode1/simulationSpace0, explicit numeric rotations/raw sizes/ages and unit outer owner bound this result. Local Hierarchy scalingMode0, current source cooccurrence/dispatch/streams, nonidentity owner, lifecycle/bounds/shared sorting/HUD and aggregate parity remain OPEN. No tests/app/build/visuals; prior C142 compile/integrity results apply to unchanged production.


### BND-C147..C155/C154: actual system bounds arithmetic and consumption

Verified/pushed Reverse sources: actual bounds `0fd6390c3ca49395da3a3ed553afcf45686af18f`, source-size tail `e5959e559a56dc9c996d2fc458b0724b045f2971`, source eligibility `43ffa113fe69a541b2bfde22287f37b1eb80f221`, world publication `857b69f1ce6aada32f83ee6f88db6e7511067be5`, identity publication `1440e497d0a85c731c2863e0b1420b8df6c741da`. The existing predicate agrees on599 source inputs/1741 systems:1280 eligible and461 ineligible. Runtime invalidation cannot make an ineligible source take the analytic branch. The source domain has local simulation space, disabled SizeBySpeed/Trails/Lights and UVmode0.

The product now computes actual particle-system min/max, stretch tails from unmodified base+module velocity, source upper-size extrema, optional mesh coefficient and runtime-size/pivot/radius expansion. It preserves the native two reciprocal-square-root refinements and Float32 grouping. World publication derives center/extents with the source matrix; Local-space View extents retain native max-scale adjustment. All14400 actual-bounds,2256 source-size and8640 world-publication numeric comparisons agree. The previous unit-quad primitive union differs in all960 compared configurations because it substitutes +/-0.5 XY and zero Z thickness for the original +/-0.71 system radius.

For source-ineligible gameplay systems, samples publishes one shared native renderer center/extent object. The identity-outer-owner culling path consumes that system bound instead of primitive union. Original reset runtime436zero is retained because this API does not admit EmitParams/SetParticles size overrides. The actual metadata wrapper agrees on3732 original Billboard/stretch publications;780 explicit numeric mesh-cache probes are excluded from this SHA-bound wrapper, while mesh arithmetic remains covered by the direct calculator and registered C109 cache. The actual samples field and culling-selection call sites are bound; final projection/frustum output is not promoted to numeric native acceptance.

The C143 audit loader now includes the actual new bounds dependencies and explicit newly read adapter fields; all3168 live world-position/normal rows remain exact, with672 nonlive rows separate. Both noEmit checks and runtime audit1438 pass as compilation/integrity only. No tests/app/build/visuals. Source-eligible analytic bounds, game-clear bounds, nonidentity outer owner composition, current overrides/group/stream/lifecycle, full camera culling/shared sorting/HUD and aggregate parity remain OPEN. The remaining primitive-union branches retain this explicit gap.


### BND-C157/C160: source linear analytic bounds

Reverse `0339d5e4b3c85df3a97fb67cf8f9d3b100b5d894` and auditor binding `16bd532d2458d4a18df6a0bc0ce1416e3471c2ac` were verified/pushed with exact remote handshakes before acceptance. The original continuous analytic branch covers392 enabled source renderers with source-eligible predicate, disabled Shape/Velocity/Force and zero gravity.128 source inputs produce512 native bounds and1024 ordinary world publications, including empty count0. Corpus SHA `9BCD091A44E8C64E08F4795F83FEA3FA47FE41633C847053A74E3C186F1D9170`.

The product now uses lifetime upper extrema and the start-speed interval for local analytic bounds, retaining origin inclusion. Stretched analytic extension uses the Initial.size3D-selected Y or X source-size upper extremum and the original strict speed threshold/grouping. It then shares the unchanged source size/pivot/radius expansion and renderer publication. Actual calculator512, world publication1024 and source-matching nonmesh simulation-wrapper484 comparisons agree; count0 does not take the actual-empty epsilon shortcut. The C158 extraction of the common tail was a separate behavior-preserving commit.

C151 predicate input data intentionally omits SizeModule; the independent auditor now joins its enabled/separateAxes fields from C07 by source resource/path/hash and its curves from C30. The original stores were unchanged. Prior14400 actual bounds,2256 source size,8640 publication and3732 wrapper calls remain exact; C1433168 live geometry/normal rows remain exact,672 nonlive separate. Both noEmit checks and runtime audit1438 pass as compile/integrity only. No tests/app/build/visuals.

This selects the linear path for the current immutable-profile Play API; it does not observe arbitrary native invalidation34/setter state. Source-enabled Shape/motion619, disabled renderers269 and source-ineligible461 remain explicit source partitions. Numeric native coverage uses local space/unit runtime and explicit mesh cache; current nonidentity Transform/outer owner, mesh association, game-clear, full flags/lifecycle/frustum/shared sorting/HUD and aggregate parity remain OPEN.


### BND-C161/C164: zero-rotation box/sphere/circle analytic bounds

Reverse `e0a9da5e8483fafa1da170fa80eba404ae9a34d9` passed native regeneration,880 registered hashes, staged policy and exact remote handshake before consumption.442 enabled source renderers of Shape types0/5/10 produce744 native full bounds and1488 world publications; corpus SHA `7E58AC597DAAE00BFD0F5D8AA19A56EC8E35D0E4A8AF42D165DD3C4A3CE15CD2`. Every source Shape rotation in this partition is zero. Native normalized quaternion/matrix results and eight-corner transforms are included; the direction matrix is identity in every case.

The product now preserves native Shape type bounds, all eight transformed corners, separate runtime336 scaling, directional upper-distance expansion and direct lower-distance interval union. The latter does not add Shape position again. Positive randomDirection makes the two lifetime-distance endpoints absolute before direction expansion. Circle bounds retain original0.1 Z half-thickness. Source zero rotation is a guarded specialization; other rotations/types remain an explicit gap. The independent calculator744/world1488/source-matching nonmesh wrapper496 calls agree. C81 separately confirms unit runtime336 in316 source selector0/scalingMode0/1 preparations; runtime348 must not substitute for it.

Prior linear512/world1024/wrapper484, actual wrapper3732 and C1433168 live world-vertex/normal rows remain exact;672 nonlive rows stay separate. Both noEmit and runtime audit1438 pass as compilation/integrity only. No tests/app/build/visuals. Cone4/8, enabled Velocity/Force, current flag/owner/setup/stream/lifecycle, mesh-cache/current renderer association, game-clear, frustum/shared sorting/HUD and aggregate parity remain OPEN. C162 common analytic-tail extraction was committed separately without behavior change.


### BND-C165/C166: source cone analytic bounds

Reverse `0d488310e75850263781d2cbeb578449df860e1e` plus math-consumer audit `5e0da504f49b4bd17de82b1556d673f87425e929` passed native regeneration,896 registered hashes, staged policy and exact remote handshakes.144 enabled source cone4/8 renderers/20 input combinations produce80 native full bounds and160 world publications. Corpus SHA `7833387DF947DBA4A7CF23F9F52573128B932F4AC05741E0A92E64C0BDC4D413`. Original libm sinf/sincosf imports, exports, tables and actual input/output stores are bound to the registered library identity.

The product now uses the original Float32 radians coefficient and double sine polynomial with exact fused multiply-add rounding, then converts to Float32. Exact finite significands accumulate before one nearest-even binary64 rounding. The registered cone-volume source angle is zero, retaining native sincosf zero/one. Source zero-rotation cone geometry, direction intervals, random-direction distinction, Shape corner transform and analytic/shared expansions match80 bounds/160 publications/64 complete wrapper calls; the actual private sine helper additionally matches all84 native sine results. Positive cone-base angles below45 and cone-volume angle0 are the guarded source domain.

Prior Shape744/world1488/wrapper496, linear512/world1024/wrapper484, actual wrapper3732 and C1433168 live vertex/normal rows remain exact;672 nonlive rows separate. Both noEmit and runtime audit1438 pass as compilation/integrity only. No tests/app/build/visuals. Velocity/Force combinations, current flags/allocation/owner/setup/stream/lifecycle, nonidentity transforms, source mesh/current renderer association, game-clear, frustum/shared sorting/HUD and aggregate parity remain OPEN.


### BND-C167/C168: source constant local Force analytic bounds

Reverse `1a5d7bfd8cb96a9132f76e4e98ae67d901e263a8` passed native regeneration,907 registered hashes, staged policy and exact remote handshake before consumption. Corpus SHA `77224DBE39DDD0C63173944C6FECBE24B06C51DC38AE0DBDF062AEF18631F613` binds two enabled skin02 swipe glow systems to local constant Force `(0,5,0)`, disabled Shape/Velocity and zero gravity. Complete original1044520/109AD90 compute the signed half-force interval, multiply each endpoint by lifetime maximum twice, and union its displacement into the existing bounds before stretch and size expansion. The product preserves every Float32 operation. A dead upper D lane in the original wide load is explicitly uninitialized and unconsumed; two byte patterns reproduce identical results.

Independent actual calculator16/world32/source wrapper16 calls agree, including fresh count0/4 and scalar/3D storage. Prior linear512/world1024/wrapper484, actual wrapper3732 and C1433168 live rows remain exact;672 nonlive rows separate. Both noEmit and runtime audit1438 pass as compilation/integrity only. The production guard admits only constant local nonrandom Force without Shape. Other Force domains, Velocity, current flags/owner/lifecycle/allocation/stream, game-clear, frustum/shared sorting/HUD and aggregate parity remain OPEN. No tests/app/build/visuals.


### BND-C169/C170: source constant Velocity analytic bounds

Reverse `a94d69a4824c2fa9cb0815c9e0147d3a1ee282f1` passed regeneration,925 registered hashes, staged policy and exact remote handshake. Corpus SHA `D98DDEB4D7E4EF80184B91CFC00484EF4F1661616A133513F2C24B33C6F31673` binds12 enabled source systems/6 inputs to full108D584/12705D4/109ABC0 constant-axis intervals, optional zero-rotation box/cone Shape and original76F720 world-velocity conversion. Each interval endpoint is multiplied by lifetime maximum; world-space intervals are transformed through eight ordered corners with matrix translation zeroed. Their union extends existing bounds before Force/stretch/size expansion.

The product consumes the current worldToLocal matrix for this operation.144 native bounds and288 identity world publications agree under explicit identity, quarter-turn and reflected nonuniform worldToLocal matrices, including nonzero translations; these probes do not prove full current transform setup.40 source-matching nonmesh identity wrapper calls agree. Baseline256 differences are eliminated. Prior Force16/32/16,cone80/160/64/math84 and actual wrapper3732 remain exact. Both noEmit/runtimeaudit1438 pass as compilation/integrity only. Curve Velocity18 eligible references, current flags/owner/setup/allocation/lifecycle/stream, game-clear, frustum/shared sorting/HUD and aggregate parity remain OPEN. No tests/app/build/visuals.


### BND-C171/C172: source curve Velocity analytic bounds

Reverse `eca1740e69720e371a6a4b221aab3e4dfdde469a` passed full regeneration,944 registered hashes, staged policy and exact remote handshake. Corpus SHA `7C823592CD3212F5B0AA5A9334B2DDCE9C67778251A27E707A4776D982276E71` binds18 enabled source references/11 bounds inputs to7 curve/scalar inputs. Six use the original36-byte cache; one uses general segments whose final endpoint is `0x3F8147AE`. Original48-byte cache copies retain undefined padding through the full caller; complete native cached/general integration, cubic roots and registered system math generate expected outputs.

The product preserves coefficient compilation/scaling, cached split integration or general cumulative integral, strict segment root admission and endpoint evaluation. Cubic roots use original binary64 operation order followed by binary32 deflation; source Float32 root outputs are checked directly. Host mathematical functions are not claimed universally equivalent to every intermediate system-libm double. The actual helper agrees with all3168 native root calls in this source domain;264 full bounds/528 worlds/88 actual wrappers also agree, eliminating4048 baseline differences. Prior constantVelocity144/288/40,cone80/160/64/math84 and actual wrapper3732 remain exact. Both noEmit/runtimeaudit1438 pass as compilation/integrity only.

The six disjoint analytic corpora cover392 linear+442 sphere/box/circle+144 cone+2 Force+12 constantVelocity+18 curveVelocity=1010 enabled source-eligible renderer references. A source-ID set comparison found zero missing or extra references. This closes the registered analytic arithmetic domains under their explicit ABI inputs. Current flag/cache invalidation, complete transform/outer owner/setup/allocation/lifecycle/stream, game-clear, actual current source storage, frustum/shared sorting/HUD and aggregate parity remain OPEN. No product tests/app/build/visuals.


### BND-C174/C175: GamePlayButton particle root reset

Reverse `91d2f586a0ccf5159a6bed070bf11e654d7ca667` passed native regeneration,961 registered hashes, staged policy and exact remote handshake before consumption. Corpus SHA `C30B313D6944E84981DAD57104343660313E316DF8DE8386A1B1D755F6E96294` binds the original vector initializer, static-field copy region and complete32BBB4C initialized nonnull call path to GamePlayButton.Setup. After SetParent, the helper passes zero to localPosition and one to localScale. External creation/accessor results are explicit ABI tokens; original setter wrappers and icall strings establish their meaning, without emulating a live Unity graph.

The product applies this rule only to the instantiated root of game-play-button owners, before ParticleSystem setup scaling. Child authored transforms remain source inputs. Birth emitter origin, world-module transforms, render positions, bounds matrices and hierarchy size scale consume the same root rule; each particle retains its owner rule through update/clone. Note-slide and game-clear paths do not inherit this Setup rule; current animated Transform updates are consumed by the separate game-clear plan.

All316 registered source chains are compared with native108834C reset and unreset outputs:632 actual private-function calls/22120 values agree, eliminating64 baseline differences. The affected source subset is21 skin02 effect_TapKeep systems. Prior316 raw runtime matrices/11060 values and curve Velocity264 bounds/528 worlds/88 wrappers/3168 roots remain exact. Both noEmit checks and runtimeaudit1438 pass as compilation/integrity only. Unit setup is the numerical proof boundary; complete owner parent/rotation conversion, subsequent transform mutation, current lifecycle/flags, sorting/frustum and aggregate remain OPEN. No product tests/app/build/visuals.


### BND-C176/C177/C178: complete gameplay owner matrix and particle center

Reverse `621bdd1127c6181208bf28d338212c5895c7df0e` and `0e224f8936f88bc887086e25d450ea4782f46df3` passed native regeneration, manifest verification, staged policy and exact remote handshakes before consumption. C176 corpus `C69A477D1D8CEAD19E5F77D85A8DC8387C2E6B1228B7BA88BE4F3200FF518B1C` binds fresh GamePlay/MusicObjects/Button1 serialized parents and the original SetParent inverse/normalization prefix. C177 corpus `AD6E73147C666B3753B0F1E8B18141576A3CF014DC1BC1FE82F6FCD03D41602A` additionally checks all13 source button transforms and publishes original pre-pivot world centers. Source buttons share identity rotation/unit scale/localZ15; MusicObjects has localZ-15. Collapsing these translations first changes66 native forward-matrix and67 inverse-matrix lanes on316 source inputs. Root reparent quaternion zero signs change277 inputs, but the currently consumed matrix/scale fields agree; intermediate quaternion publication is not claimed as product-equivalent.

Button particles now include GamePlay -> MusicObjects -> Button in their birth emitter origin, module-space matrices, sample positions/velocity/scale and renderer bounds. Sample metadata explicitly identifies this owner composition, so geometry preserves the native world center and uses the already owner-composed bounds without adding the button position again. Each particle retains its birth owner parents through cloning and updates. Current buttons require an explicit finite XY owner with identity rotation/unit scale/worldZ0. Non-button paths retain their separate owner consumption. Public Recipe13/transport3/sole entry remain unchanged.

The independent auditor compares actual private matrix preparation and actual geometry center consumption:316 matrices/11060 lanes and2528 original pre-pivot centers agree, eliminating3079 baseline differing lanes (698 forward,860 inverse,1521 geometry center). The source routing checks are separate static facts; this is a unit-setup/source-descriptor numeric composition, not full samples/lifecycle execution. Prior root632calls/22120values and actual bounds wrapper3732 calls remain exact. All four C143 workers agree on3168 live world-position/normal rows;672 nonlive rows are separate. Reverse `7d19d84f91c1d8798173857202970178ae19c569` fixes the older raw-descriptor audit adapter's nominal owner and missing bounds-only Initial speed without changing native expected; its remote handshake is exact. Both noEmit checks and runtimeaudit1438 pass as compilation/integrity only.

Current layout/setup mutation, deserialization/clone rotation normalization, moving-owner lifecycle, native flags/cache publication, actual stream/storage, slide/game-clear owners, full frustum/override/group behavior, shared sorting/final ties and aggregate parity remain OPEN. In particular C173's two product sort callbacks still have68 native-prefix differences each; this owner-center correction does not close sorting. No product tests/app/build/visuals.


### BND-C179/C180: two original ParticleSystem setup scale passes

Reverse `47de8778db60f17af1f13b74b1df15057ade4da9` passed native regeneration,979 registered hashes, staged policy and exact remote handshake before production consumption. Corpus `7FA00CAA3547338323D5050526ED620A15C0BF04D5C628692577AA5166EBD805` executes complete initialized3883074 with explicit scalar getter inputs and unrelated empty UI arrays: first3883D68 argument is widthRate; second is F32(normalizedNoteSize*safeAreaRatio). The separate noteSettingScale field is F32(widthRate*normalizedNoteSize). Complete3883E60 one-system paths read the first native setter values before the second multiplication. Original getter/setter icall strings, complete wrappers, FDEs and relocations bind these ABI observations; full Unity object graph/dispatcher traversal is not emulated.

All54 registered source scale triples/1741 refs cross180 explicit scalar/high-aspect probes, producing9720 original two-pass paths with identical0/A5 unused-upper-lane results. Product note-size80..150 admits120 factor probes/6480 scale calls;3240 original out-of-product-range clamp paths remain separate. Combining width, note size and safe ratio before multiplying the source scale produced2382 baseline differing lanes in the admitted domain.

Button scene owners and commands now retain two positive binary32 factors. Exact identity validation, restart comparisons and engine scale decoding preserve both values. Root reset, source self transforms and ParticleSystem-bearing parents apply them in order; non-ParticleSystem parents remain unscaled. Local billboard scale preparation consumes the same two-pass arithmetic. Legacy combined scalar metadata remains for existing scene compatibility and other owner paths, but no longer sets gameplay button localScale. Public Recipe13/transport3/sole entry remain unchanged.

Independent actual factor/helper checks pass for120 factor inputs and6480 local scales. Reverse `5c1440b10dc159b4fcd8c7851e8c63f894b87ce0`, also verified/pushed/exact, adds actual createParticleScene -> buttonInstance -> exact instance validation -> engine decoding checks:120 scene calls/1800 instances agree.6480 actual Local billboard self-scale inputs agree with original setter stores; its real basis dependency still executes and is transparently observed, without claiming final basis acceptance here. The previous unit owner316 matrices/11060 fields/2528 centers, root632 calls/22120 fields and C1433168 live world-position/normal rows remain exact;672 nonlive rows are separate. Both noEmit checks pass. Runtimeaudit remains1438 entries/zero pending classification after refreshing12 changed source line locations, as compilation/integrity only.

This closes the registered two-pass scale arithmetic and its identified factor consumers. Full current setup/lifecycle/flags/cache, deserialization/clone rotation normalization, other owner initialization, full renderer stream/storage/frustum/group/override, shared sorting/final ties and aggregate parity remain OPEN. C173 retains136 known comparator-prefix differences. No product tests/app/build/visuals.


### BND-C181/C182/C183: Game-clear native bounds consumption

Reverse `d57fb597ef665d58589959a845de3202e940006f` freshly reads and byte-roundtrips all58 game-clear ParticleSystems and their renderer/transform objects from the original APK. Of46 enabled renderers,40 require actual particle data and6 are source-eligible for analytic bounds. Original108E6CC predicates, not the older ordinary/HAB source union, establish this partition.

Reverse `78bbe29b084f509eee10461dbca0a4831f2c1638` passed native regeneration,984 manifest hashes, staged policy and exact remote handshake before consumption. Corpus `6EA98B0F8D6F25ACE7B6AFF00A79030DAFE9F5CF745D6E5FC83F83B12BC5B5C8` executes full108D584 and1076970 on5 distinct source parameter sets:90 bounds/world publication pairs across count0/1/4, scalar/3D storage and registered native SoA inputs. The original padding helper runs before either bounds branch; single-particle probes bind all selected streams and require original writes to padded lanes.

Production now admits game-clear to the same source-selected actual/analytic bounds wrapper, removing its unconditional early return. All46 actual source eligibility calls,90 calculator calls,90 world publications and414 source-matching wrapper calls agree with original output. The414 baseline wrapper omissions are eliminated; bounds arithmetic itself needed no change. Source game-clear SizeBySpeed is disabled, simulation space is local and scalingMode is1. Both noEmit checks and runtimeaudit1438 pass as compilation/integrity only.

This comparison uses explicit unit scale, identity runtime matrices, fresh native flags and crossed native motion inputs. It does not establish game-clear motion/lifecycle occurrence, full animated/instantiated owner matrices, current cache/SoA allocation, actual frustum output or sorting. The geometry owner's existing admission remains independent. C173 still has136 comparator-prefix differences; complete owner binding and shared sorting/final ties remain OPEN. No product tests/app/build/visuals.


### BND-C184/C185: Game-clear scene sorting order

Reverse `6f57b7285efd875bf230d6d8d04b35c5e7c01b97` passed fresh APK regeneration,987 manifest hashes, staged policy and exact remote handshake before consumption. Corpus `C4732495BDFCE5C141A9C8DF27014B0263959719AB836C7E4E88FE485689AC5F` uniquely joins all58 source ParticleSystems to their level3 scene instances. All ParticleSystem numeric/module fields and authored local transforms agree. FC/AP scene roots additionally belong to GamePlay/UI_Root/Animator. Renderer fields agree apart from relocated object/material references and the two effect_light_lay sorting orders: prefab5 versus scene50. All58 scene renderer sorting orders are50.

Game-clear bundle preparation now applies this scene value, while retaining the original prefab resource bytes and their source identities. The actual shipped JSON passes its actual semantic/profile parsers and complete bundle builder;58 renderer results/290 sort fields agree with the original scene values, eliminating2 baseline differences. Both noEmit checks and runtimeaudit1438 pass as compilation/integrity only. This is scene configuration consumption, not the dynamic NGUI/Animator sort-record publication or comparator algorithm. C173's136 comparator-prefix differences, full owner matrices/current lifecycle/frustum/shared sorting/final ties and aggregate parity remain OPEN. No product tests/app/build/visuals.


### BND-C186/C187: Game-clear owner matrices and particle centers

Reverse `8305455418fdb03afefbdbf62e65d62eac154b50` passed original native regeneration,990 manifest hashes, staged policy and exact remote handshake before consumption. Corpus `0A4137968D31574CFAA9D4B578816690497EEE323CF8C364A0413C2E0FFCB01B` binds23 distinct full scene Transform chains/58 systems to complete108834C runtime preparation and184 original pre-pivot world-center stores. Full and parent-truncated chains reproduce with0/A5 unused fourth-lane inputs. The source GamePlay/UI_Root/Animator prefix is shared by base/FC/AP. Source Local scaling mode applies parent scale to emitter origins within the native matrix; postmultiplying the complete particle center scales its displacement too.

Game-clear owners now contribute that three-parent prefix to birth, updates, sample runtime matrices and bounds. The typed owner supplies its positive uniform UI_Root scale; source zero position/identity rotation remain required. Sample metadata identifies native owner composition so the actual geometry center consumer preserves the already-composed center. Game-clear retains its authored root transform and unit ParticleSystem setup; the button-specific root reset remains separate.

Actual private owner/runtime preparation now agrees on805 matrix/scale fields and184 world centers, eliminating34 forward-matrix,35 inverse-matrix and392 world-center baseline differences. Direct complete-chain arithmetic805 fields already agreed. Prior gameplay owner316 matrices/11060 fields/2528 centers remain exact. Both noEmit checks and runtimeaudit1438 pass as compilation/integrity only. Frozen dev refs, canonical Reverse dirty state and the user's package-lock digest are unchanged; NUL scan is0.

The numerical audit uses the original serialized UI_Root scale, source-authored transforms and crossed native Shape points. Actual dynamic layout/Animator/motion/lifecycle occurrence, vertex offsets/sizes/normals, full bounds composition/current flags/SoA/frustum/shared sorting remain separate OPEN consumers. In particular the existing geometry offset owner-scale path is not accepted by this center correction, and C173 retains136 comparator-prefix differences. No product tests/app/build/visuals.


### BND-C188/C189: Game-clear vertex and normal owner consumption

Reverse `2d1625bf95bf6b9c2a3707bbce9fe97cb8536b8b` passed original worker regeneration,993 manifest hashes, staged policy and exact remote handshake before consumption. Corpus `88E30132E2C23CAE6D58B4299F6BAEC65D5854FF7D99F8E75C56F0ECED01DAB3` combines C186 full scene matrices, C184 enabled renderers, original107A0DC, size-limit/normal coefficient preparation and complete scalar/3D simple Billboard or non-Freeform stretched output.46 renderer inputs/138 calls publish552 particle rows. Native storage uses scalar size1, original integrated/gathered motion and age probes, mixed billboard rotations or zero stretch rotation, and explicit neutral color/UV/stream inputs.

Geometry now uses unit outer scale when the native runtime matrix already contains its owner. This prevents a second scale on billboard offsets, stretched side width/length and gathered velocity, and keeps native billboard normals instead of renormalizing them because of the already-consumed UI_Root scale. The original source owner identity remains attached to the sample; the native owner flag controls the existing geometry and camera-vector consumers.

Actual complete samples and buildPrimitive world vertex/normal output agree on460 live rows, eliminating4320 vertex and3384 normal component differences.92 nonlive rows remain separate. Prior four Billboard workers still agree on3168 live rows with672 nonlive rows separate. Both noEmit checks and runtimeaudit1438 pass as compilation/integrity only. This conditional native worker audit does not accept full game-clear size/rotation/color/UV/flip producer occurrence, current animated/layout ownership, flags/cache/lifecycle/SoA admission, complete bounds/frustum/shared sorting or aggregate parity. C173 retains136 comparator-prefix differences. No product tests/app/build/visuals.


### BND-C190: Game-clear bounds under complete scene runtime matrices

Reverse `a2fe5c971646aa3b1a84e30265930f53d0810960` passed original regeneration,994 manifest hashes, staged policy and exact remote handshake before consumption. Corpus `D738A2D737D7E48D2ADC213331BFD5A612902E1A02131C5F113CD04CB6AB0429` joins46 enabled source references to23 full native scene owner inputs and executes414 original108D584/1076970 pairs. Actual arithmetic414, world publication414, complete source-matching wrapper414 and eligibility46 calls all agree. Prior identity-domain90 arithmetic/publication and414 wrapper calls remain exact. No production arithmetic change is needed for these inputs.

This closes the conditional bounds composition on serialized scene matrices and the explicit native motion/count/storage inputs. Current animation/layout/motion occurrence, flags/cache/lifecycle/SoA allocation, frustum/group/override and final sorting remain OPEN; C173 still records136 comparator-prefix differences. This documentation batch does not use compilation as equivalence evidence. No product tests/app/build/visuals.


### BND-C191/C192: Slide TapKeep pool setup scale write boundaries

Reverse `afb60db07b309680ff5c4d4f6eca2ff50444b12f` passed original regeneration,998 manifest hashes, staged policy and exact remote handshake before consumption. Corpus `7B7BF9BE7DBDC778F35D53EC093B1AFF9F17D26CB203B66BB7A74DD826ABE831` executes original330F19C..330F424 eight-slot allocation/setup loop. Source width division and width<1 conditional precede the note-size write; each scale getter receives the previous native setter value unchanged.103 ordinary exact effect_TapKeep source references provide16 scale triples.84 numeric probes repeat with0/A5 unused upper lanes;28 out-of-product-note-size probes remain separate. Resource/clone/object access is an explicit ABI boundary.

Slide scene profiles and instance identities now carry width and normalized note-size factors separately. Engine and Local Billboard consumers use sequential Float32 scale multiplication, and command/Pixi validation and instance equality preserve both factors. The existing combined scalar remains compatibility metadata; it no longer replaces the two actual writes. At width>=1 the first factor is exact1. No safe-area scalar is introduced into Slide pool setup.

Actual scene56 calls,448 slot identities,7168 engine self-scale results and7168 Local billboard self-scale results now agree with original setters, eliminating2592 baseline component differences. Prior button120 factor/scene inputs,1800 instances and6480 engine/6480 geometry scale results remain exact. Both noEmit checks pass; runtime audit remains1438 entries with only six source line references refreshed. Compilation/integrity is separate from native equivalence. Actual collector ordering, clone/root reset/reparent/full owner matrices, current animation/layout/lifecycle/SoA/bounds/frustum, C173 sorting136 prefix differences and aggregate parity remain OPEN. No product tests/app/build/visuals.


### BND-C193/C194: Slide Play root transform overwrite

Reverse `af35a2ab2b0e78c0763b82f2e3cd7008ff0c9fea` passed original regeneration,1003 manifest hashes, staged policy and exact remote handshake before consumption. Corpus `23D0B5D96634D0D775AF2C09F793C500B4EA0DD2C7F0F2677C5D84E8559F2B97` executes complete321C4FC/3311660 acquisition on16 button/cursor inputs and complete108834C on71 ordinary TapKeep inner chains crossed with six C191 setup probes. Original Play writes zero localPosition and unit localScale to the acquired root after pool setup, while descendants retain their own prior setup writes. Reparent rotation conversion remains a separate ABI boundary.

Birth and samples now select a distinct slide-play root reset mode. Runtime updates retain that mode with each particle. Only the prefab root skips its earlier setup factors after the unit-scale overwrite; its children continue sequential source scaling. Button instantiate reset still precedes button setup. Slide inner-root reset does not mark its outer owner as native-composed.

Both actual birth/sample selector paths and private matrix preparation now agree on852 matrix calls/29820 fields, eliminating2338 baseline component differences. Prior button316 matrices/11060 values/2528 centers and Game-clear23 matrices/805 values/184 centers remain exact. Both noEmit checks and runtimeaudit1438 pass as compilation/integrity only. Canonical Reverse dirty state, frozen dev refs and user package-lock digest remain unchanged; NUL scan0.

This accepts conditional inner-graph root/scale matrix consumption. Complete current birth/sample/lifecycle/module occurrence, outer NoteSlide/MusicObjects hierarchy and reparent quaternion, final geometry/material, bounds/frustum and C173 sorting136 prefix differences remain OPEN. No product tests/app/build/visuals.


### BND-C195/C196: complete Slide owner matrix consumption

Reverse87da1cc9d6770923399b20505fae474237c530a8 and movement-auditor supplement99ef977e0f017a5fc4e59bfeb41a1a8b2bdf4856 were verified/pushed with exact remote0 0 before consumption. C195 corpusA8F70393472C931EB3D31673C5CCEE22EC0F4FD80C8E991AF4092F67CA1BA2EF binds fresh NoteManager1152.noteParentTrans538, GamePlay544 and the identity NoteSlide prefab to complete original108834C matrices and12CEDFC..12CEE68 centers. The source hierarchy is GamePlay -> NoteParentTrans -> NoteSlide; older MusicObjects ancestry speculation is superseded.

Slide owner position and scale now enter native runtime preparation before emitter-origin evaluation. Samples mark this composition so geometry preserves the native center and does not repeat outer scale. Actual moveOwner preflights the new parent chain and refreshes every live particle's saved parent reference; subsequent module matrix preparation uses the current owner. The immutable parent arrays remain shared safely, while birth emitter-origin diagnostics are unchanged.

Actual1278 static matrices/44730 fields/5112 world centers agree, eliminating15480 baseline components. Actual1278 owner replacements/44730 subsequent matrix fields agree, eliminating5134 stale-parent components. Prior button316 matrices/11060 fields/2528 centers and game-clear23 matrices/805 fields/184 centers remain exact. Both noEmit checks and runtimeaudit1438 pass as compilation/integrity only. The user's package-lock digest is unchanged.

The owner probes are conditional source XY/prefab Z and quaternion/native scale inputs. This does not accept native slidingMove trajectory or layout occurrence, clone/reparent quaternion conversion, complete birth/module/lifecycle/SoA execution, final Slide worker offsets/normals, bounds/frustum/group/shared sorting or aggregate parity. C173 retains136 comparator-prefix differences. No product tests/app/build/visuals.


### BND-C197: Slide bounds under complete native owner matrices

Reverse83b9270c711969320602ea67b8ee54b21059d38a passed original regeneration,1011 manifest hashes, staged policy and exact remote0 0 before consumption. CorpusB0F17DD69BA88B2F8C00BFBC008ADBFB762D6EDCD89E3358AF11C093138892DF binds73 enabled nonmesh ordinary TapKeep systems through fresh full source reads/byte roundtrips.69 source/owner combinations execute414 original108D584/1076970 pairs using complete C195 owner rows0/8/17,count0/4 and source-matching storage. Source eligibility, curve extrema, Shape, Velocity cache and native libm remain continuous.

Actual owner/setup/root/runtime preparation438 calls, complete bounds wrapper438 calls and73 eligibility calls agree. No production bounds correction is needed for this domain.14 disabled renderers and16 Mesh renderers with unbound current mesh cache remain explicitly separate. Current layout/slidingMove/module/lifecycle/SoA/flags/cache invalidation, frustum/group and sorting remain OPEN; C173 retains136 prefix differences. No product tests/app/build/visuals; compilation is not used as equivalence evidence.


### BND-C198: complete View billboard output with Slide owners

Reverse137247f4e5535656aa7f0345046094c0f4dc6239 passed original regeneration,1014 manifest hashes, staged policy and exact remote0 0 before consumption. Corpus38862D37009AD653AAE67187C232E5FAB3A05B1259546DA4F662E8E3345D34F5 executes423 complete original View/zero-pivot worker calls on47 source Slide renderer inputs and C195 complete owners. Actual complete samples/buildPrimitive world vertices and normals agree for1410 live rows;282 nonlive rows remain separate. No production arithmetic change is indicated.

18 Local-alignment and8 nonzero-pivot systems remain separate along with C197 disabled/Mesh exclusions. Explicit raw size and rotation probes do not accept actual module/color/UV/material producer occurrence. Native layout/slidingMove/lifecycle/SoA/flags/frustum/group/shared sorting remain OPEN; C173 retains136 comparator-prefix differences. No product tests/app/build/visuals.


### BND-C199: Local billboard evidence closeout

Reverse `a248d8bd7de5702243f6c1c96360d60ccc0fa63b` passed Local regeneration, unchanged C198 View regeneration,1015 manifest hashes, staged policy and exact remote0 0 before consumption. Corpus `E4129D46A132805CC83DD5054E090C7280F26860AE82D2BF153809674DAEB675` covers18 source Local/zero-pivot renderers and162 complete original worker calls. Actual complete samples/buildPrimitive world vertices and normals agree on540 live rows;108 nonlive rows remain separate. Prior47 View renderers/1410 live rows remain exact. No production algorithm change is required.

This closes the current candidate only: source alignment/quaternion/flag inputs are explicit ABI adapters, not complete dispatcher or source producer occurrence.8 nonzero-pivot systems,16 Mesh systems with unbound current cache, C173136 sorting-prefix differences, current lifecycle/module/SoA/flags/layout/frustum/shared sorting remain OPEN. Heavy investigation pauses at this boundary for workflow consolidation. No product tests/app/build/visuals or unrelated compilation reruns.


### BND-C200: Slide nonzero-pivot evidence closeout

Reverse `171c0d0e` was verified and pushed before consumption. Corpus `slide_pivot_worker_output.json` SHA256 `2DE544BBBCBBBC6E780DD23638C3F4629FA2541719C4AFF887BD943451D9CEFA` covers all eight C197 nonzero-pivot source renderers on complete C195 owner inputs. C39 source-bound native dispatch selects complex workers even for the two scalar-size systems; C145 supplies pivot/quaternion context before original worker/gather/stores. Three owner and three native motion inputs per renderer produce72 calls. Actual complete samples/buildPrimitive world positions and normals agree on240 live rows;48 nonlive rows remain separate. Old View/Local source corpora regenerate byte-identically.

No production algorithm change is required in this domain. This closes the eight-system conditional pivot gap reported in C198/C199. Raw sizes/rotations, neutral stream/material adapters and native SoA inputs do not prove current source producer or lifecycle occurrence. The16 Mesh systems, current caches, layout/slidingMove/lifecycle/flags/UV/color/material/frustum/shared sorting remain OPEN. No product tests/app/build/visual acceptance or unrelated compilation reruns.


### BND-C201/C202: Slide Mesh cache/bounds/world output closeout

Reverse `71861c802f2fa74846d9d88ada757fc9ee15701f` was verified and pushed before consumption. `slide_mesh_owner_bounds.json` SHA256 `BA578B1702F0CCBD7706AACB2ACB19F87474C84A34DA908AD1E2770AF8BD93D3` binds all16 source Mesh systems to fresh ParticleSystem/renderer identities, original C109 cache bytes and full C195 owner inputs. Native and actual bounds96calls/16 eligibility results agree. Old nonmesh C197 bytes and438 wrapper calls remain exact.

`slide_mesh_output.json` SHA256 `604FE90E6328046194227FE7C6636AD6E26CE528DE128D5BB784862EEA95D6C5` passes full C195 localToWorld to the original position-matrix argument, C195 quaternion to Local basis or native C129 View basis, and source Mesh/pivot/storage fields to complete matrix and CPU vertex/inverse/normal stores.192 original calls use three owners, four native age probes, source Shape points and explicit raw sizes/rotations. Actual complete samples/buildPrimitive agrees on144 live world-vertex/normal rows;48 nonlive rows remain separate. Both corpora regenerate exactly. No production arithmetic change is needed.

This closes the16-system conditional Mesh gap reported in C197–C200. Original bounds and matrix/CPU-store boundaries remain separate; a complete mesh dispatcher run is not claimed. Current cache invalidation, CPU/GPU path selection, source module/lifecycle/SoA/stream occurrence, UV/color/material/frustum and shared sorting remain OPEN. No product tests/app/build/visuals or unrelated compilation reruns.

### BND-C205: immediate newborn death and padded publication

Reverse `b5828886c129878af9413a7198155fdc57dbebc0` was verified, pushed and confirmed remote-exact before consumption. Original108CCE0..108CD48, real107D460/108CF80 and full108CDA4/108A7B0 establish the newborn-specific ascending swap-last scan before aligned publication. Unlike ordinary death removal, it processes each slot sequentially, including the complete four-row SIMD padding, and decrements the admitted counter while nonzero.

Production spawnBatch now materializes each complete birth group, removes expired newborn rows, retains the surviving admitted prefix and then applies the existing alignment compaction. Padded creation bypasses only the per-row capacity guard after batch admission has already applied source maxNumParticles. Exactly100 percent age remains alive. RNG still advances once per SIMD group, and padding may supply an accepted replacement row after a death.

The independent source auditor executes the actual cleanup and compaction and binds their call order plus padded spawn path.505 explicit finite-age/admission inputs across both native stream states yield1010 comparisons, eliminating920 baseline differences. Existing compaction, age/state, emission/birth-age, Initial properties, complete identity-owner spawn and normal-prewarm clock gates remain exact. Current generated padding ages and complete native birth/module/owner/seed coupling remain separately OPEN; these conditional suffix comparisons do not establish full lifecycle or rendering equivalence. No product tests, application or visuals were added/run.

BND-C206 extends the input binding through full original108C5B8 and its finalizer, from Reverse `8e59c56faa076bb3a31e92215ee2c2467cae713b`, verified/pushed/remote-exact before registration. Two source Initial records, capacities respected, explicit identity/local owner and disabled ancillary modules yield160 full calls. Actual complete spawnBatch/spawn/updateParticle matches1024 original padded rows,732 published rows and160 final RNG states. A transparent observer reads real post-spawn state without replacing the algorithms. No further production change is required in this input domain. Other modules, prior live rows, source/current timing, allocation and seed/owner producers remain OPEN; C205's arbitrary-age suffix corpus stays distinct.

BND-C207/C208/C209 extend that full chain to source Box21, cone/cone-volume/circle72 and sphere2 Shape configurations, from Reverse `ff9b624d832ec45d203f2a079eaba5ce84472979` and `00047227017fa8c48273318b7a432c3c642db8a3`, verified/pushed/remote-exact before registration. There are2648 calls,15104 padded rows and7148 published rows, all matching the actual complete production birth chain and both Initial/Shape final SIMD states. Sphere uses the registered original libm instruction bodies; no host math supplies expected. Source-capacity-limited counts exercise partial groups, short lifetimes and padding replacement. This is an explicit two-Initial/source-Shape cross-product with identity/local owner and disabled other modules; current source cooccurrence, allocation/seed/clock/owner producers and other module combinations remain OPEN. No additional production algorithm change, application or product tests are needed for these passing domains.

### BND-C210: construction respects the original playOnAwake gate

Reverse `06d1bf5ab2090460eb827cd2f13d576e84b1ce1b` was verified and pushed before consumption. The registered current getter binds config+55 to playOnAwake; original activation10892F0 bypasses Play eligibility and fresh Play when that flag is false. Its two original branch traces and120 default source systems are registered in `particle_awake_seed_gate.json`.

Production ensureConstructedOwner now consumes a construction auto seed only for playOnAwake systems. The120 source systems all disable this flag. Actual complete prefab groups and individual systems, each followed by reuse, expose137 baseline differences in274 calls; all are now zero. Explicit later Play still initializes its own seed. Full normal birth160 calls/1024 padded rows/732 published rows remains exact. Both noEmit checks and runtime audit1442 pass.

This closes the false-awake extra draw, not true-awake eligibility, exact scene construction/activation order or process-global history before Live. Full lifecycle, shared sorting and aggregate algorithm equivalence remain OPEN. No product tests, app or visual capture.

### BND-C211: initial inactive hierarchies do not draw construction seeds

Reverse `acf9c8ea7a578e098a45ece45bc4cd410f3374b3` was verified and pushed before consumption. The registered GameObject.activeInHierarchy getter executes the original recursive74C684; ParticleSystem activation1089308 exits before module or Play calls when it returns false. All58 Game-clear source chains are evaluated with their original self/ancestor active bits. Base40, FC6 and one AP system are initially inactive; the other11 AP chains do not establish outer activity or actual prefab creation time.

Game-clear preparation now publishes activeInHierarchySerialized from its complete branch graph, separately from each object's own activeSerialized. Validation requires the new field. Construction seed consumption also requires this hierarchy condition. The independent actual producer/consumer comparison clears58 missing input fields and47 unsupported draws;58 hierarchy comparisons and94 construction/reuse calls match. C210's274 calls remain exact. Both noEmit checks, runtime audit1443 and the existing nonvisual render.game-clear case pass.

The original active branch's Play eligibility, outer activity, AP creation/activation timing and global draw order remain OPEN. No new or modified product tests, app launch or visual capture.

### BND-C212: gameplay Play follows original Transform child traversal

Reverse `ee421593f704d1a3821f335578161c68e3a02e45` and default-consumer audit `51aba9a2bde835ed899940785a9b55430665e6d0` were verified and pushed before consumption. Original1098B2C plays the current component before recursively traversing Transform child pointers in ascending index order. Verified27 UnityFS resources,279 prefab trees and1741 systems define the independent traversal projection. Lexical source/component order is preserved as a separate identity.

Selected and exact-default gameplay preparation now publish nativePlayOrdinal from the registered resource/path projection. Native-semantic validation requires the field. playRootSystems uses it for gameplay Play; Game-clear Animator activation retains its separate sequence and legacy Schema1 retains its own contract. The actual selection expression clears235 baseline prefab-order differences, with1741 ordinal comparisons and279 calls exact. Actual upgradeDefaultBundle on the leased default profile also matches all120 original ordinals.

Both TypeScript noEmit checks and runtime audit1444 pass. The existing resources.default-particle-lease case stops before preparation because its application-snapshot revision is missing; its input and the rejecting revision guard are unchanged. That test is not counted as passing. No test/fixture edits, app or visual run.120 initially inactive descendants, live hierarchy mutations, actual Play eligibility/capacity/global history, Game-clear activation and aggregate equivalence remain OPEN.


### BND-C213: ordinary Play skips inactive descendant systems

Reverse `646e86500d36e879b68f084296a51be58dbe041a` was verified, pushed and confirmed remote-exact before consumption. Original1098B7C..1098B8C executes the full activeInHierarchy getter before own Play. Inactive systems jump to child traversal without entering their own Play/seed body. The1741 original source chains yield1621 allowed and120 skipped systems, with the prefab root active as an explicit entry condition. Affected source scripts and the external Animation owner are bound to serialized identities and original managed FDE bytes.

Both selected-skin and exact-default preparation publish nativePlayActive from the source projection. Schema2 validation requires the boolean; ordinary playRootSystems filters inactive descendants while retaining original traversal order. Game-clear Animator and legacy Schema1 retain their separate activity contracts. The actual selection expression clears44 baseline prefab differences; all1741 source inputs,279 calls and120 real default preparation rows match. Both TypeScript noEmit checks and runtime audit1446 pass. No product tests or fixtures were changed.

This closes initial descendant activity at ordinary Play. External hierarchy mutation, clone/activation timing, later Play eligibility, global seed history, Game-clear Animator state and aggregate algorithm equivalence remain OPEN. The same original getter's C211 outputs regenerate unchanged.


BND-C214 from verified/pushed Reverse `7799e8e90076d4797d84b1af0a25190f36e9bcfa` connects original108F26C own initialization to six complete module initializers and original833EA0. Actual selection and createSystemRuntime agree on assigned seed, manager state, emission scalar state and Initial/Shape SIMD states for3242 calls across279 source prefabs and two explicit global input states. The1741 original system inputs deduplicate to15 source configurations and60 native numeric records. No production arithmetic change is needed. Prewarm is neither called nor stubbed by this gate; full Play, sub-emitter tail, actual scene-global history and overall parity remain separate. Both source regeneration and source/consumer comparison pass; unchanged production compilation results from C213 are reused.

BND-C215 from verified/pushed Reverse `00e8e649a65bf28fa20e19be10626ad21bbefd11`
extends this to complete108F26C, including the original sub-emitter collection and
free(null) callees. `particle_play_seed_complete.json` SHA256
`D8A047FBFC266C166FC9664AC8B553B796842B06AD135CB17A00C27D9FD4AB24` binds all1741
serialized SubModule records: each is disabled with one null-emitter slot. Native
collection initializes no child state; all60 original output records remain equal
to C214, referenced by digest. Actual selection/createSystemRuntime still agrees
on3242 calls. No production algorithm change is needed. This closes the complete
seed/module initializer for those source inputs; full Play allocation, prewarm,
Transform work, actual scene-global history and overall parity remain open.


BND-C216 from verified/pushed Reverse `b3cfc7b66e73bd937dc3ae7b7b7756ecc8b001eb`
adds the fresh Play reset/start-delay handoff. `particle_play_handoff.json` SHA256
`8C854F8CB7D4571AADBC441B00E829B4617419CDBFE6FAC7945270D2EF7AC40B` reuses
registered source inputs and assigned seeds:149 native inputs cover3242 selected
calls. All1741 startDelay curves are constant. Actual createSystemRuntime elapsed
and delayRemaining match the original instructions, retaining the C214 seed
checks. The59 prewarm source systems loop; original Play skips delay evaluation
when prewarm is set and additionally gates prewarm on an empty particle store
and the caller flag. This gate has native source evidence; the audit does not
execute the complete product prewarm. Seven full function exports distinguish
capacity preparation from particle publication without claiming allocator-call
equivalence. No production algorithm change is needed for this handoff; current
manager/Transform state and paused/nonempty restarts remain open.

LIFECYCLE-C217 from verified/pushed Reverse `bd18a8313ff7fe2c63aa3cba43e4c65bd9f9c185`
binds the managed invalidation callers to original metadata/module tables.
`particle_managed_invalidation_callers.json` SHA256
`377FBD3C38DCF8206111BFBC5C2E5A7AE9A16C90BF883306616C9E4BCC98A25B`
retains20 complete methods and six direct branch candidates. The two external
SetParticles callers belong to Coffee.UIExtensions; none of the808 serialized
MonoBehaviour headers across27 particle resources, level3 and two Game-clear
prefabs references Coffee/UI-particle classes. One null script reference is
retained. This narrows source-attached direct invalidation callbacks and requires
no production change; runtime-created components, indirect/reflection calls and
complete native writer coverage remain separate.

RENDER-C219 from verified/pushed Reverse `2eaf1374294f5f4aafb6c15347b5b66bcb5b6a0f`
binds particle hierarchy and projection winding. `particle_winding_sources.json`
SHA256 `BAD90921595C460F7BC017D796027618535611AB5002BB8F058C170EAE134E27`
retains17 complete functions and564 original numeric calls. Local scale sign bits,
including signed zero, XOR into bit2; ancestor accumulation preserves this parity.
The particle Transform callback writes Renderer+244, node publication copies it
to node+180, and a per-node draw consumer forwards bit2 through device slot448.
Projection inversion toggles both its Y row and the flag supplied to Vulkan.
These source relationships constrain a future culling fix; current camera/global
inversion, actual draw invocation and final production culling remain open.

HUD-C218 from verified/pushed Reverse `96ab774d3b9ab43a9c56a2eb7df72ccf026be1cf`
corrects the Font runtime reader source binding. `font_cache_native_sources.json`
SHA256 `6812E8C80456DCBBF7BD5CD73EA22742D486C9FE680A5669EE6BE5F388E0F9B0`
retains22 complete functions: registration copies the template into descriptor
17F3F30, and TimeManager indexes the inline manager array without a second root
dereference. Two original accessor executions verify64-bit pointer preservation.
The bounded collector retains resident digit variants without assuming28px keys.
Its one corrected-descriptor attempt stopped at TimeManager before any glyph
read; the additional reader fix was verified offline, without repeating capture.
This repairs evidence tooling only. Native glyph metrics and current UILabel-to-
Font instance association remain open; no production metrics are changed.

HUD-C220 from verified/pushed Reverse `a14d9f6b8a81a1c9d4bf8397ac28c5bf96f06bc1`
adds the successful bounded Font observation and complete CharacterInfo replay.
`font_cache_runtime.json` SHA256
`6F2F4012E903E8BE343137675A0B79EC1065BF8FDA25D6360AE59B0E6D9F3153`
retains356 cache records and33 digit variants from one observed sgm Font.
`font_cache_character_info.json` SHA256
`E530FF72D0301586EC8888C6659D592F9D9A9A3639BD8DFDEB4AB07BB50DF16F`
executes complete GetCharacterInfo plus10 original callees against captured data.
All33 results agree with cache fields; the actual production profile parser and
layout calculator agree on31 supported-size records, including eight28px digits
with advance21. No production arithmetic correction is needed in that domain.
Digits3 and9 at28px are absent, not synthesized. The current UILabel-to-Font
association, missing glyphs, glyph placement and complete HUD remain open.

### Current score-label glyph spacing and Android shrinking

Verified/pushed Reverse `900c6d7d979f534ba2bc19c846609aea907f2d70` includes the UILabel1271 correction first published in `7bb802512c7607a3740e3a9f6bb7ab9b09036043`. Original spacingX is1. UpdateNGUIText publishes it; NGUIText.Update scales it; glyph advances retain spacing across gray/pink color boundaries. CalculatePrintedSize subtracts final spacing and takes ceil, while WrapText includes final spacing in its fit comparison.

Android treats serialized keepCrisp=OnDesktop(1) as false and uses pixelDensity1. The score consumer retains requested fontSize28, decreases a failed-fit candidate by2, and applies candidate/28 as Float32 fontScale to glyph advances, spacing and each glyph's scale. Every visible-glyph update sets scale, including1 when the text fits again. It does not request a fresh font at each candidate size. Nine-digit input selects26/28 with printed width183; ten digits select22/28 with width173 under the explicit existing advance ABI.

The independent actual-calculator audit matches80 fitting digit/color-boundary cases and7 nonnegative Int32 score cases. Original arithmetic executes float conversion/division, advance multiplication, accumulation, comparison/condition, decrement, trailing subtraction and ceil;26 failed-fit candidate transitions also reproduce. Both TypeScript noEmit checks and the1446-entry runtime audit pass. No product tests/fixtures were added or modified, and no application or visual capture ran.

This closes the bounded spacing and ASCII shrink recurrence. Source field/ASCII branch selection is static; the Pillow/FreeType glyph metrics remain explicit ABI rather than captured native CharacterInfo outputs. Full WrapText/ProcessText execution, actual glyph bearings/baseline, runtime property writers, renderer/raster integration and complete clipping remain OPEN. Compile or conditional arithmetic agreement does not establish overall simulator equivalence.
