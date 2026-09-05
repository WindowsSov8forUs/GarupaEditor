# Simulator Original Skin Settings Contract

## Runtime policy classification

Reverse owns original Skin selection claims. A valid but unavailable selection makes only the Skin-change/player-launch action unavailable and retains the prior stable selection; evidence gaps are internal notices, never runtime failure codes. No default/nearest bundle substitution is permitted. See [`../runtime-contract-policy.md`](../runtime-contract-policy.md).

## Scope

This contract is locked to `jp.co.craftegg.band` 10.1.4 / code 230 / ARM64. Master/package selection remains based on Reverse `977f5e7153257e5bb4cabb2904790408f5452aa7` plus reachability correction `4312a8ad5a755b28cb40366f6160771dbf79637e`; current particle numeric/control coverage is bound by `dccbfab9`/`d707d922`/`c52355e9`, native core `1ea7e35b1584809ffb695a2033e4e8f38579f443` and renderer/Slide authority `e43dded8890260806001fbcb5ab519cfb019a379`.

Public Schema 13 owns the semantic projection `{ chartData, presentation, config }`. `config.skin` copies only original persisted normal settings, one aggregate special selection and seven component states. Caller metadata outside that projection is discarded rather than rejected or consumed; it never becomes a URL, bundle name, SHA, store key, server/rip name or independent Judge identity.

## Public shape

Normal setting domains are exact:

| Setting | Values | Internal master key |
| --- | --- | --- |
| Note | 0..6 | `setting + 1` |
| Field | 0..14 | `setting + 1` |
| TapEffect | 0..4 | `setting + 1` |
| JudgeSE | 0..3 | `setting + 1` |
| DirectionalFlick | 0..4 | `setting + 1` |
| DirectionalFlickEffect | 0 or 1 | normal/light |
| IsFixedBG | boolean | frozen original setting |

Special selection is `none`, `collabo + seasonSpecialId`, or `limited + limitedSkinId`. Component state strings are `on`/`off`; this avoids reversing original `On=0, Off=1`. Judge has only a component switch. Its resource identity always comes from the selected aggregate master.

Expired Collaboration `seasonSpecialId=36` is a known master row but its six legacy `skinapril2019` resources are unavailable. The whole package rejects `skin.special-package-unavailable` even when all components are Off or the session is Practice. Reissued `skin_april2019` is not an alias.

## Component resolution

Resolution is frozen before backend creation:

- Live Manual: each aggregate component follows its own master flag/state.
- Live Auto: special Note, Field, TapEffect, Background, TapSE and Directional remain eligible; Judge uses default.
- Practice Manual/Auto: aggregate components are disabled. Rehearsal Auto remains Practice+Demo, not Auto Live.
- HAB: Note, Field, Judge and standard background use HAB resources. TapEffect, TapSE and Directional remain independently selected; HAB change-flash is an additional resource.
- MV: video owns background; special/standard backdrop is still validated but is not attached or used as fallback.
- Directional effect combines selected visual identity with normal/light. Directional SE remains fixed `directionalflickskin00`.
- Structural `stageskin/{key}` belongs exclusively to `BackgroundModuleType.Live2D -> Live2dBackgroundModule -> InGameV2StageController`. Current Public Standard-backdrop and MV routes do not create that owner, so structural stage is absent from the current recipe and store inventory; it is not silently drawn as a Standard background.

The resolved recipe has a deterministic canonical identity. Retry and MoveTime fresh builds must match its identity/fidelity; Pause, MoveTime, GameOver and natural completion never change it. No gameplay hot-switch command exists.

On the MV route, browser media derivation remains one pending immutable preflight resource, but production completes selected Skin whole-pack/embedded-file validation and the full render/audio/particle assembly before constructing or preparing `PixiMvLiveBackend`. A Skin assembly rejection releases only that pending media resource and cannot create a Movie backend, mount a scene or start the scheduler. A later Movie prepare rejection disposes every prepared assembly owner before releasing the still-untransferred media resource.

## Interaction with original Live settings

Schema 13 Live settings are frozen independently from the Skin recipe. NoteColor chooses normal/normal16 inside the selected Note atlas; SyncLine uses the selected simultaneous-line material and edge margin. The common four-Sprite GamePlayButton lane-effect pack is not the selected TapEffect particle pack: VisibleTapLaneEffect controls only that fixed lane Sprite owner, while selected TapEffect continues to control judgement particle resources. MvDarkness controls the movie black cover and never selects a Skin identity.

All identities participate in the same pre-backend resource assembly. Retry/MoveTime compare both canonical Skin and original-Live-settings identities; Pause changes neither.

## Portable resource packs

The full Reverse source profile contains 133 whole packs / 635 embedded files. The Standard/MV catalog continues to exclude only the three Live2D structural-stage consumers. Every launch leases the exact resolved packages. The default effect pair uses the explicit built-in `portable/profiles/default-particle` route; non-default pairs consume their complete selected source packages. Both are normalized into the same source-bound Schema-2 profile and validator, then merged with the Game-clear domain before either particle backend is created. This is an explicit resource route, never a missing/default fallback.

Each selected semantic row retains logical resource, application snapshot revision/file receipts, official UnityFS and serialized-asset digest, ParticleSystem/renderer PathID and byte digest, root→immediate parent chain, all renderer/material slots, mesh and texture identities. Encoded PNG expected SHA comes from the application receipt; decoded RGBA identity comes from committed source evidence. Simulation and Pixi consume one cached immutable prepared token. A package-byte replacement, semantic sidecar mismatch, missing PathID/material/mesh/texture or unknown current signature rejects the whole launch before mount.

Selected Note, Directional, Judge, Field and reachable special Background assets are converted to strict render profiles. Original Sprite bottom-left Rects are converted once to portable PNG top-left rows. Selected `noteSyncEdgeMargin` replaces the former fixed scene scalar. Special background replaces the already validated prepared stage backdrop only on the standard route.

Selected Tap/Judge SE replaces exactly six semantic cues. Directional SE replaces the same three fixed directional cues from its fixed pack. WebAudio still owns decoded metadata validation and all loop/one-shot lifecycle.

Garupa/ExGarupa directly consumes selected Note/Directional bindings and selected TapEffect texture. Continuous/outside-lane projection remains `closed-product-extension`; Skin evidence does not upgrade it to original behavior.

## Fidelity and exclusions

`closed-native-algorithm-equivalent` covers original selection/lifecycle, all 27 current particle resources, 1,375 concrete systems, 1,147 enabled renderers, 114 renderer signatures, four source meshes and all 152 reachable ordinary/directional combinations. It includes native Shape/TRS/random/module/time/capacity, Slide pool/outer ownership and GPU-pre primitive/material handoff. It does not claim browser/GPU driver raster, original framebuffer, CRI/Android/speaker output or fixed-device exactness.

CutIn, Fever, character skill, multiplayer, Stage 9 and runtime Skin hot-switch remain unauthorized. Production does not import editor `skinLoader`, Bestdori services, rip maps, React or Tauri.

Actual Pixi consumes selected Note, Field, Judge and reachable special Background assets; default and Limited-3 production composition validates 58/59 static-store resources respectively. WebView2 executes three fresh processes for each of default and Limited-3 and hashes the complete RGBA output, rather than accepting non-null binding booleans.

The default and non-default routes retain every current serialized system, enabled module, renderer/material/null slot, mesh and texture relation. Runtime random state is allocated per concrete `(owner generation, ParticleSystem component)` from the recovered global manager/manual-seed rules; canonical path/name hashes are forbidden. Shape 0/4/5/8/10 and no-Shape use the recovered `+Z` handoff, Shape TRS and self→immediate→root order. Renderer geometry, UV/custom data, color-space/blend, sorting metadata and aggregate bounds are prepared before Pixi, which executes immutable primitives. This architecture is not a native-equivalence claim: mode-1 non-Freeform head/tail consumption is corrected by the later worker re-audit, while complete camera uniforms, normal stream and ordinary/particle mixed sorting remain open; see `rendering-consumption-contract.md`.

Reverse `50170414da613b15dd1064addc7cceed0bb991fd` remains the color-space source: encoded Skin PNGs are sRGB, particle colors are handled in the current linear path and material blend factors remain source-bound. The two authored mip chains still differ from leased base-level PNG input and final browser/GPU quantization remains outside the algorithm claim. Stable command/object/digest results cannot upgrade that raster exclusion.
