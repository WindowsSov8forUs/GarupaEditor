# Simulator Original Skin Settings Contract

## Scope

This contract is locked to `jp.co.craftegg.band` 10.1.4 / code 230 / ARM64 and Reverse resource baseline `977f5e7153257e5bb4cabb2904790408f5452aa7` plus Field/structural-stage reachability correction `4312a8ad5a755b28cb40366f6160771dbf79637e`.

Public Schema 12 keeps the root request exactly `{ chartData, presentation, config }`. `config.skin` carries only original persisted normal settings, one aggregate special selection and seven component states. It never carries a URL, bundle name, SHA, store key, server/rip name or independent Judge identity.

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

Schema 12 Live settings are frozen independently from the Skin recipe. NoteColor chooses normal/normal16 inside the selected Note atlas; SyncLine uses the selected simultaneous-line material and edge margin. The common four-Sprite GamePlayButton lane-effect pack is not the selected TapEffect particle pack: VisibleTapLaneEffect controls only that fixed lane Sprite owner, while selected TapEffect continues to control judgement particle resources. MvDarkness controls the movie black cover and never selects a Skin identity.

All identities participate in the same pre-backend resource assembly. Retry/MoveTime compare both canonical Skin and original-Live-settings identities; Pause changes neither.

## Portable resource packs

The full Reverse source profile contains 133 whole packs / 635 embedded files. The current Standard/MV simulator manifest deliberately removes the three Live2D-only structural-stage packs and pins exactly 130 reachable packs / 576 embedded PNG/MP3 files. Every launch, including `default-current`, loads its resolved 8–10 packs; there is no default-Skin assembly bypass. A whole pack is checked by byte length/SHA before JSON, metadata, base64 or backend decode, and every embedded file is checked again. Missing/tampered/extra packs reject before any renderer/audio/particle/Movie backend prepare, scene publication, mount or scheduler start; resource faults never fall back.

Selected Note, Directional, Judge, Field and reachable special Background assets are converted to strict render profiles. Original Sprite bottom-left Rects are converted once to portable PNG top-left rows. Selected `noteSyncEdgeMargin` replaces the former fixed scene scalar. Special background replaces the already validated prepared stage backdrop only on the standard route.

Selected Tap/Judge SE replaces exactly six semantic cues. Directional SE replaces the same three fixed directional cues from its fixed pack. WebAudio still owns decoded metadata validation and all loop/one-shot lifecycle.

Garupa/ExGarupa directly consumes selected Note/Directional bindings and selected TapEffect texture. Continuous/outside-lane projection remains `closed-product-extension`; Skin evidence does not upgrade it to original behavior.

## Fidelity and exclusions

`closed-static-portable` means static original selection/lifecycle plus current official UnityFS-derived portable bytes. It does not claim a non-default special device trace, original framebuffer, GPU, CRI/Android/speaker output or fixed-device exactness.

CutIn, Fever, character skill, multiplayer, Stage 9 and runtime Skin hot-switch remain unauthorized. Production does not import editor `skinLoader`, Bestdori services, rip maps, React or Tauri.

Actual Pixi consumes selected Note, Field, Judge and reachable special Background assets; default and Limited-3 production composition validates 58/59 static-store resources respectively. WebView2 executes three fresh processes for each of default and Limited-3 and hashes the complete RGBA output, rather than accepting non-null binding booleans.

The selected TapEffect and Directional-effect packs construct dynamic ordinary/directional particle bundles with their original serialized systems, enabled modules, renderers, materials and textures. The portable backend derives each auto-random stream deterministically from canonical resource/system/profile identity; this is a named portable policy, not an original device-random or frame-parity claim.
