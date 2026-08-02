# Resource and Pixi Rendering Runtime Contract 10.1.4

## Question

Which version-matched managed methods, type layouts and enums form the bounded static target set for reconstructing resource selection, Note presentation and in-game HUD rendering from `jp.co.craftegg.band` 10.1.4 / 230 on `arm64-v8a`?

## Result

The first offline batch closes only the method/layout/enum identity sub-gate. It resolves 673 managed methods by exact owner, method and signature, exports every current ARM64 method body as an independent TSV, and compares 32 complete instance layouts and 19 enums against the historical 10.1.3 migration baseline.

| Surface | Count | Result |
| --- | ---: | --- |
| Managed methods | 673 | all uniquely mapped to 10.1.4 and byte-pinned |
| Instance layouts | 32 | all field declarations and offsets unchanged |
| Enums | 19 | all members and values unchanged |
| ARM64 TSV files | 673 | each reconstructs one exact current ELF range |

The complete-owner slices are intentional. They cover `NoteImageController`, Note Sprite/mesh/sync-line and directional visual owners, `ButtonManager`, the HABAHIRO flash owner, Score/Combo/AddScore/Result/Life/Skill HUD owners, NGUI number/layout helpers and their visible-state coroutines. Nine bounded helper methods add `NoteManager.setupNoteSkin`, the multi-range construction gates, `AssetBundleNames.get_HabahiroBundleName` and the Note/Field/Tap skin name builders without widening unrelated owner coverage.

The locked package files observed on the connected device are byte-identical to the local-only package inputs. The verifier pins:

- `base.apk`: `D3A6005BB1F7341E39016521390DCEB987E56A0E5D16B6BA73568837A3026413`;
- `split_config.arm64_v8a.apk`: `3D846C0AA18CCBA4BFC48B5E6B82C2EED92A999D653057F0766198C1AEA1D9DD`;
- `libil2cpp.so`: `815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F`;
- `global-metadata.dat`: `298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F`.

## Evidence

- `resource_pixi_rendering_static_contract.json` records sample identity, method migration rows, exact method boundaries and hashes, field layouts and enums.
- `resource_pixi_rendering_resource_contract.json` records the current cache index, all 57 cached `ingameskin/*` bundles, exact Sprite/Texture/Material/NGUI atlas rows and 100 selected APK resource rows.
- `resource_pixi_rendering_hud_asset_profiles.json` reruns bounded scene/atlas/font parsers on the current APK and excludes historical HTTP and auxiliary JSON inputs.
- `resource_pixi_rendering_skill_animation_profiles.json` decodes four current Skill clips and all three current controller assets; the scene Life controller assignment remains runtime-only.
- `resource_pixi_rendering_note_animation_profiles.json` decodes current Flick/Directional Flick and Long Note flash clips/controllers.
- `resource_pixi_rendering_score_up_profile.json` re-derives the current five-way ScoreUp route, jump table, strings, scene and atlas from 10.1.4 inputs.
- `resource_pixi_rendering_instruction_migration.json` conservatively compares all 673 methods while preserving instruction order, registers, instance offsets, arithmetic constants and internal branch shape.
- `resource_pixi_rendering_portable_contract.json` records the backend-neutral resource/identity/command/component mapping draft without authorizing production.
- `resource_pixi_rendering_fixed_case_status.json` classifies PR01-PR40 from current evidence.
- `habahiro_degraded_approximation.json` records the explicit dual-track decision: exact HABAHIRO parity remains open, while two visibly labelled degraded preview profiles are accepted with HA-D01-HA-D12 differences.
- `habahiro_degraded_scene_oracle.json` freezes the diagnostic approximation surface: 179 technical Sprite keys, current maxNoteCount 731, current static pool capacity 60 and same-frame lane-swap approximation; it deliberately contains no original frame oracle.
- `resource_pixi_rendering_runtime_hook_targets.json` derives 55 minimal observation-only hooks directly from the current static contract.
- `runtime/ordinary-rendering-r1.trace.json.gz` records 87,364 contiguous observation-only events from a natural ordinary Auto Live, including all eight locked anchors and eight categories; the static four-byte `NoteBase.OnStart` no-op is explicitly classified as unhookable and its lifecycle is covered by 510 same-alias mesh Activate/Deactivate pairs.
- `resource_pixi_rendering_setter_targets.json` byte-pins ten current Unity `Mesh`/`Material`/`LineRenderer`/`Transform` setter wrappers used only as observation points; each identity is resolved by exact managed name/RVA and full ARM64 SHA-256.
- `runtime/ordinary-rendering-geometry-r2.trace.json.gz` adds 87,037 privacy-minimal setter events across 636 relative frames without return replacement, memory writes or managed invocation. It preserves exact Float32 bits for 22-vertex mesh arrays, indices, UV, colors, material threshold, line endpoints/equal widths and owner-scoped transforms.
- `resource_pixi_rendering_geometry_oracle.json` rebuilds a compact exact oracle from R2: 510 mesh lifecycle owners, 80 line owners, invariant init topology and selected lifecycle/line/field trajectories. The full R2 remains the authoritative trajectory source.
- `resource_pixi_rendering_line_profile.json` reparses the current APK NoteSyncLine prefab and SyncNoteLine material, then joins them only with the current R2 setter trajectory. It closes the portable single-segment textured-quad inputs: two world-space endpoints, equal width, View alignment, Stretch UV, zero cap/corner vertices, white color, no mask interaction and explicit non-parity raster boundary.
- `resource_pixi_rendering_projection_profile.json` binds APK build index 3 to `RhythmGame.unity`, reparses its orthographic `GameCamera`/`GamePlay` hierarchy, and validates all 24,470 R2 line endpoints against the fixed 1600x720 physical-frame viewport. It closes the ordinary world-XY/width to Pixi top-left projection without extending the profile to HABAHIRO.
- `resource_pixi_rendering_note_geometry_profile.json` consolidates the next producer implementation wave from current evidence: 17 exact current methods, all 13 authored button transforms plus Launcher, fixed ordinary motion/scale formulas, the R2 22/60 base mesh, sync-line margin/update lifecycle and the 1600x720 projection. `NoteMesh.GetMeshWidthRate` remains current-specific at its changed static-field offset rather than being mislabeled relocation-only.
- `resource_pixi_rendering_note_child_lifecycle_profile.json` joins 17 existing static-contract methods with 13 separately byte-pinned current `NoteLong`/`NoteManager` methods without changing the established 673-method contract hash. It authorizes only the fixed ordinary Long + normal tail + base 22/60 mesh lifecycle; Flick/Directional tails, Slide chains, Multiple reconnect/back-line, advanced mesh and threshold remain false.
- `resource_pixi_rendering_hud_runtime_profile.json` compacts the committed ordinary R1 into a producer-facing HUD/animation boundary: all 23 HUD targets, 14,084 HUD and 1,452 HUD-animation caller entries, first-judged AddScore→Combo→Show→Result order, and both observed life-heal calls before Life UpdateView/updateLifeText. Five static-only routes remain explicitly unauthorized rather than inferred.
- `resource_pixi_rendering_hud_setter_targets.json` and `hud-setter-arm64/` byte-pin 22 current UILabel/UISprite/UISlider/UIProgressBar/UIWidget/NGUITools/GameObject/Animator/Renderer/SpriteRenderer/Transform observation points for HUD R3. The capture plan exports only technical strings, scalar/vector Float32 bits, integer state hashes/depth/order and anonymous aliases under RPH-030..055 owner stacks; it forbids return replacement, writes, managed invocation, raw pointers and display strings.
- `resource_pixi_rendering_note_family_r4_targets.json` adds 30 byte-pinned current owner targets for Flick/Directional icons, Slide state/children, Multiple side/back-line/reconnect and NoteMeshAdvanced. `capture_resource_pixi_rendering_note_family_r4.py` starts a natural Live, waits for bootstrap, then launches a device-loopback-only Frida server and correlates one bounded Flick/Slide/Multiple owner group with the existing geometry/HUD setters. Any server already running before scene entry is excluded because Live bootstrap terminates it even without an attached session. The collector retains the same no-write/no-invoke/no-pointer/no-display-string policy. `build_resource_pixi_rendering_note_family_r4_profile.py` compacts only grouped traces accepted by the dedicated runtime verifier and keeps every unobserved owner route false.
- `runtime/ordinary-rendering-note-family-r4-{flick,slide,multiple}.trace.json.gz` contain three confirmed natural Live observations totaling 118,152 events and 1,258 aggregate relative frames. `resource_pixi_rendering_note_family_r4_profile.json` authorizes front Flick/Directional icons, observed Slide activate/update/move/stop/after mesh+line, and observed MultipleDirectional activate/deactivate/connect/back-line. Long-after Flick, Slide Wait runtime, add-Long/add-Slide/after Multiple visuals, Advanced mesh and threshold remain false.
- `runtime/ordinary-rendering-hud-r3.trace.json.gz` records a natural 631-frame Demo Live with 19,888 caller-correlated setter events. `resource_pixi_rendering_hud_visible_profile.json` joins those events to frozen HUD/skill/note/resource profiles and authorizes only ordinary bitmap score/combo/life, score-skill overlay, serialized field/sudden mask hierarchy, combo/GameJudge restart-at-zero and portable combo/life-heal curve sampling. Unobserved Guard/NeverDie/Judge/Flick/Multiple routes remain false.
- `runtime/resource-pixi-rendering-delivery-frame-manifest.json` locks seven privacy-reviewed physical-device ordinary PNG anchors at the observed 1600×720 viewport. Crops exclude identity-bearing Skill/pause text; no generated HABAHIRO frame is represented as original.
- `habahiro_current_external_resource_profile.json` records the user-authorized Bestdori fallback: 12 live explorer/export assets, 179 Sprite rows and hashes whose 2026-03-31 release timestamps align with MasterMusic 786. Production remains offline and consumes only host-local hash-verified bytes.
- `resource_pixi_rendering_delivery_oracle.json` and `delivery_closure.json` close the explicit `ordinary-exact-habahiro-degraded` delivery gate while retaining original HABAHIRO bundle/runtime/frame parity as open and unclaimed.
- `runtime/resource-pixi-rendering-r1-plan.json` and `runtime/resource-pixi-rendering-frame-plan.json` retain the two exact natural-Live scenarios and 13 physical-frame anchors for future original parity.
- `verify_resource_pixi_rendering_runtime_trace.py` and `verify_resource_pixi_rendering_frame_manifest.py` reject absent, partial, non-contiguous, mutation-capable or privacy-invalid evidence.
- `build_resource_pixi_rendering_runtime_oracle.py` refuses to emit an oracle until S01-S03 all exist and pass their verifiers.
- `offline_closure.json` classifies H01-H28 and D01-D18 and proves that every remaining blocker requires game-server-backed resource or natural Live access.
- `resource_inventory.tsv` is the compact current resource/hash index; the HABAHIRO row remains explicitly `evidence-required`.
- `targets.tsv` is the compact 10.1.4 managed target index.
- `arm64/*.arm64.tsv` contains one contiguous four-byte instruction row per current method word.
- `static_closure.json` records the exact closed sub-gate and preserves every resource/runtime blocker.
- `SHA256SUMS` pins every tracked sibling artifact.

The source target set is derived from the bounded H01-H24 investigations named in the GarupaEditor stage task plus complete visible-state owner slices. Historical addresses are used only to find candidate managed identities. Current addresses, boundaries, signatures and bytes all come from the locked 10.1.4 dump and ELF.

## Confirmed

- Every selected managed identity has one exact 10.1.4 owner/method/signature match.
- Every exported range ends at the next global managed entry and reconstructs exactly from its TSV.
- The selected instance layouts and enum definitions did not change between the two package samples.
- The local-only APK pair matches the currently installed package pair byte for byte.
- The method/layout/enum rebaseline sub-gate is closed with no unknown target.
- The connected-device `AssetBundleInfo` is 1,974,128 bytes, hashes to `D026CAE3740DB87AA777C2FDAE40B141FF16464BC2C839ACEF3C820E06850AC6`, declares resource version `10.1.0.230`, and contains 11,026 unique records.
- All 57 current `ingameskin/*` records were pulled from the existing device cache and size-checked before parsing; no resource download was requested.
- Current standard Note bundles expose 45 exact Sprite rows, directional bundles expose 16, default Judge exposes eight NGUI rows, and default Field exposes its two line Sprite rows.
- The current APK contributes 100 selected Note/HUD resource rows and eight current HUD scene/atlas/font/animation profiles; original binary assets remain local-only.
- The current managed route still maps multi-range notes through `_habahiro`, but the current cache index contains zero HABAHIRO bundle records. Its bytes therefore remain fail-closed rather than inherited from the historical Bestdori export.
- Conservative instruction normalization classifies 652 methods as relocation-only equivalent and 21 as current-review-required; dedicated current profiles close the required ScoreUp/resource surfaces without upgrading normalization into a behavioral claim.
- H01-H28, D01-D18 and PR01-PR40 are fully classified with no unknown delivery work. 55 hook targets、2个exact R1 scenarios与13个exact frame anchors remain locked for parity auditing.
- The ordinary delivery path is confirmed by 87,364 contiguous R1 events and seven physical-device frames. `ordinary_runtime_gate=closed` and `ordinary_frame_gate=closed`.
- The follow-up natural ordinary R2 closes the implementation-time payload omission in R1: all ten byte-pinned setters were observed, all 510 mesh initializations share one exact 22-vertex/60-index/22-UV/22-color topology, all runtime mesh vertices keep Z=`00000000`, and 12,235 line-width writes have equal start/end bits. This is semantic geometry evidence, not Unity GPU shader/raster parity.
- Current 10.1.4 serialized bytes independently confirm the sync-line primitive has two positions, no loop, no caps/corners, View alignment, Stretch texture mode, unit texture scale, opaque white gradient and zero mask interaction. The portable mapping is an explicit camera-facing quad and does not claim backend-specific half-texel or Shader LOD parity.
- The consolidated ordinary producer profile closes one implementation wave without another device run: Note motion, perspective scale, authored lane/Launcher geometry, base NoteMesh interpolation and sync-line margin/update formulas are tied to 17 current ARM64 slices, current scene bytes and R2. It explicitly excludes advanced mesh, multiple-directional back line, threshold shader mapping and HAB exact.
- The child lifecycle profile closes the ordinary Long normal-tail path from current ARM64 call order plus the existing 510-owner R2 mesh trajectory: front Activate precedes after Activate, after starts at launcher position in Wait, transitions at `LauncherMusicPos >= after absolute position`, reuses the Float32 Move producer, and owns one base NoteMesh. It does not authorize Slide, icon or Multiple behavior.
- Natural HABAHIRO Live cannot currently be reached. Bestdori closes only the current portable resource-delivery part of S01; it does not manufacture S02 runtime identity/order/phase or S03 original framebuffer.
- By explicit user request, the `ordinary-exact-habahiro-degraded` delivery profile is closed and production-authorized. Its preferred `current-external-portable-atlas` source uses the pinned live Bestdori export; historical/current-ordinary proxies remain lower-fidelity alternatives. All require `Approximate HABAHIRO`, forbid silent fallback and remain outside original parity tests.
- `rendering_delivery_gate=closed` and scoped `production_authorization=true`; `habahiro_exact_parity_gate=open-not-claimed` remains independent.

## Boundary

This batch does **not** claim that a method body is behaviorally unchanged because its managed identity and signature map. `differing_word_detail` is retained for every changed word and explicitly separates PC-relative from non-PC-relative changes.

The delivery closure does not claim Bestdori exports are the game's original Unity AssetBundle bytes, and it does not claim original HABAHIRO runtime/frame parity. It authorizes only an explicit fidelity profile: ordinary current rendering plus visibly labelled HABAHIRO approximation backed by pinned portable atlas bytes and HA-D01-HA-D12 disclosures.

Both runtime captures were observation-only: no return replacement, memory write, APK modification or managed invocation was used. R2 hooks only exact byte-pinned managed setter entries while an already-running natural Live calls them; exported identities are anonymous technical aliases. Local-only APKs, binaries, dumps and Bestdori binary downloads remain ignored and are not committed; production and tests cannot fetch the network.

The ordinary Note geometry producer profile authorizes only its named fixed 1600x720 subset. It does not authorize 42-vertex advanced mesh, multiple-directional back line, HAB exact projection or threshold shader clipping.

R2 closes mesh/line/owner-transform payloads only. It does not infer Graphics cap/join defaults, SpriteMask inside/outside semantics, NGUI glyph layout, font hinting, animation clocks or shader binary behavior. Those surfaces must consume separate static/runtime evidence or remain fail-closed.

## Unresolved

The delivery gate is closed. Only original HABAHIRO parity remains unresolved:

1. obtain and hash the game's original current `ingameskin/noteskin/habahiro` AssetBundle bytes if they become available;
2. naturally enter HABAHIRO Live for original runtime identity/order/phase evidence;
3. capture original HABAHIRO physical frame anchors.

These exact-parity items do not block the explicit degraded delivery profile and cannot be silently substituted. Ordinary runtime/frame and all delivery contracts are closed.

## Reproduction

From the repository root on Windows:

```powershell
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\extract_resource_pixi_rendering_static_contract.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\extract_resource_pixi_rendering_resource_contract.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\extract_resource_pixi_rendering_hud_asset_profiles.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\extract_resource_pixi_rendering_skill_animation_profiles.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\extract_resource_pixi_rendering_note_animation_profiles.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\extract_resource_pixi_rendering_score_up_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_instruction_migration.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_habahiro_degraded_approximation.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_runtime_plans.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_habahiro_current_external_resource_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_delivery_oracle.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_setter_targets.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_geometry_oracle.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_line_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_projection_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_note_geometry_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_note_child_lifecycle_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_hud_runtime_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_hud_setter_targets.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\capture_resource_pixi_rendering_hud_runtime.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_hud_visible_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_note_family_r4_targets.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\capture_resource_pixi_rendering_note_family_r4.py --device-address 127.0.0.1:27042 --owner-group flick --output artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\runtime\ordinary-rendering-note-family-r4-flick.trace.json.gz
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_note_family_r4_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_offline_closure.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_static_contract.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_resource_contract.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_habahiro_degraded_approximation.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_habahiro_current_external_resource_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_runtime_trace.py artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\runtime\ordinary-rendering-r1.trace.json.gz --plan-id ordinary-rendering-r1
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_frame_manifest.py artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\runtime\resource-pixi-rendering-delivery-frame-manifest.json --delivery-profile explicit-degraded-habahiro
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_runtime_plans.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_delivery_oracle.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_geometry_runtime.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_line_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_projection_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_note_geometry_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_note_child_lifecycle_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_hud_runtime_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_hud_setter_targets.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_hud_runtime.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_hud_visible_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_note_family_r4_targets.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_note_family_r4_runtime.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_note_family_r4_profile.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_offline_closure.py
```

The extractor reads only ignored local package inputs. The verifier fails closed for sample hash mismatch, ambiguous mapping, stale method boundary, ELF/TSV byte mismatch, layout/enum change, stale target row or directory hash mismatch.
