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
- H01-H28, D01-D18 and PR01-PR40 are fully classified with no unknown static work. `offline_work_gate=closed`, while `rendering_gate=open` and `production_authorization=false`.

## Boundary

This batch does **not** claim that a method body is behaviorally unchanged because its managed identity and signature map. `differing_word_detail` is retained for every changed word and explicitly separates PC-relative from non-PC-relative changes.

The offline resource batch closes the present cache-index identity and promotes current Note/Directional/Judge/Field atlas metadata plus bounded APK Note/HUD assets. It does not close the absent current HABAHIRO bytes, naturally selected skin identity, remaining Skill/ScoreUp static semantics, runtime object identity, caller order, pause behavior, frame output or backend failure behavior. It does not authorize GarupaEditor production code.

No game process was started. No game server was contacted. No Frida session, hook, return replacement, memory write, APK modification or managed invocation was used. Local-only APKs, binaries, dumps and bulk assets remain ignored and are not committed.

## Unresolved

The offline-work gate is closed. Only three blockers remain:

1. obtain and hash the current `ingameskin/noteskin/habahiro` bundle through the game resource service or a proven current cache;
2. naturally enter ordinary and HABAHIRO Live scenes and capture R1 object/resource/caller/lifecycle traces;
3. capture privacy-safe 10.1.4 physical frame anchors at fixed viewport and event points.

All three require game-server-backed resource or natural Live access. They remain explicit in `offline_closure.json`; none may be replaced by historical bytes, synthetic events or production defaults.

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
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\build_resource_pixi_rendering_offline_closure.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_static_contract.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_resource_contract.py
py -3.14 artifacts\investigations\resource-pixi-rendering-runtime-contract-10-1-4\verify_resource_pixi_rendering_offline_closure.py
```

The extractor reads only ignored local package inputs. The verifier fails closed for sample hash mismatch, ambiguous mapping, stale method boundary, ELF/TSV byte mismatch, layout/enum change, stale target row or directory hash mismatch.
