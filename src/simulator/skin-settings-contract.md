# Simulator Original Skin Settings Contract

## Scope

This contract is locked to `jp.co.craftegg.band` 10.1.4 / code 230 / ARM64 and Reverse `977f5e7153257e5bb4cabb2904790408f5452aa7`.

Public Schema 11 keeps the root request exactly `{ chartData, presentation, config }`. `config.skin` carries only original persisted normal settings, one aggregate special selection and seven component states. It never carries a URL, bundle name, SHA, store key, server/rip name or independent Judge identity.

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
- Structural stage is mode-derived and is `normal` for current SingleNormal/Practice.

The resolved recipe has a deterministic canonical identity. Retry and MoveTime fresh builds must match its identity/fidelity; Pause, MoveTime, GameOver and natural completion never change it. No gameplay hot-switch command exists.

## Portable resource packs

The simulator selects internal static-store keys only. The current manifest pins 133 whole packs and 635 embedded PNG/MP3 files. A whole pack is checked by byte length/SHA before JSON, metadata, base64 or backend decode. Every embedded file is checked again. Missing/tampered/extra packs reject before scheduler start; resource faults never fall back.

Selected Note, Directional, Judge, Field and Background assets are converted to strict render profiles. Original Sprite bottom-left Rects are converted once to portable PNG top-left rows. Selected `noteSyncEdgeMargin` replaces the former fixed scene scalar. Special background replaces the already validated prepared stage backdrop only on the standard route.

Selected Tap/Judge SE replaces exactly six semantic cues. Directional SE replaces the same three fixed directional cues from its fixed pack. WebAudio still owns decoded metadata validation and all loop/one-shot lifecycle.

Garupa/ExGarupa directly consumes selected Note/Directional bindings and selected TapEffect texture. Continuous/outside-lane projection remains `closed-product-extension`; Skin evidence does not upgrade it to original behavior.

## Fidelity and exclusions

`closed-static-portable` means static original selection/lifecycle plus current official UnityFS-derived portable bytes. It does not claim a non-default special device trace, original framebuffer, GPU, CRI/Android/speaker output or fixed-device exactness.

CutIn, Fever, character skill, multiplayer, Stage 9 and runtime Skin hot-switch remain unauthorized. Production does not import editor `skinLoader`, Bestdori services, rip maps, React or Tauri.

The selected TapEffect and Directional-effect packs construct dynamic ordinary/directional particle bundles with their original serialized systems, enabled modules, renderers, materials and textures. The portable backend derives each auto-random stream deterministically from canonical resource/system/profile identity; this is a named portable policy, not an original device-random or frame-parity claim.
