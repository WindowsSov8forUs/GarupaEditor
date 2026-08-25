# Simulator Original Live Settings Contract

## Runtime policy classification

Reverse owns original-setting claims. Valid product actions outside that proven scope continue through registered product semantics and internal notices rather than `evidence-required`; malformed settings or inconsistent state remain typed action/integrity failures. See [`../runtime-contract-policy.md`](../runtime-contract-policy.md).

## Authority and scope

This contract is locked to `jp.co.craftegg.band` 10.1.4 / code 230 / ARM64 and Reverse commits `bba194684529b62b443b3d12d538f45adf5e0a29` plus the positive-counter coroutine correction `50bc40b641e32a4f70ca84d7d0d5f7e332d3a906`.

Evidence lives only in `artifacts/investigations/simulator-original-live-settings-runtime-contract-10-1-4/`: OLS-E01–E37, OLS-R01–R06, OLS-P01 and OLS-C01. HUD/AP correction evidence is Reverse `341749d90e3c68cc9fd85d16fbc501f733378623`. The implementation does not consume Reverse, `tmp/`, test fixtures, network, wall clock or ambient settings at runtime.

## Public Schema 12

The owned root projection remains `{ chartData, presentation, config }`. Field order, plain/frozen prototype and unrelated host metadata do not affect validation; the copy reads only the following mandatory `config` semantics and drops additional fields:

```ts
judgementAdjustValue: number;      // integer -30..30
judgementAdjustValueB: number;     // integer -5..5
syncLine: boolean;
noteColor: boolean;
visibleTapLaneEffect: boolean;
mvDarkness: number;                // 0,10,20,30,40,50,60,70
```

They coexist with mandatory `sessionMode`, `inputMode`, `highFrequencyMode`, `skin`, `visual` and `audio`. There are no aliases or defaults. Legacy metadata such as `judgeOffsetFrames`, `offsetMs`, `effectEnable` and `mvAlphaPercent` is discarded by the owned semantic projection and never overrides the mandatory current fields.

The immutable internal snapshot separates LiveCore fields (HighFrequency, A, B, MvDarkness) from Live fields (SyncLine, NoteColor, VisibleTapLaneEffect). Its canonical identity participates in initial, Retry and MoveTime fresh-build comparison. Pause/Resume does not reload it and there is no hot-switch command.

## All Perfect Combo display product semantics

The original `コンボ状態表示` setting is real, but Public Schema 12 has no field for it. The simulator therefore registers `simulator.ap-combo-display-fixed-on-v1`: the omitted setting is fixed ON for every autonomous session. This is an explicit product choice, not an inference from caller metadata and not a claim that Schema 12 restores the original setting UI.

With that fixed setting, the original internal status owner still applies: Perfect preserves AllPerfect; Great and below clear it. Rendering owns two persistent parallel graphs:

```text
normal ComboNumber: icon_number_big_* + combo
AP overlay:         icon_number_big_AP_* + combo_AP
```

Both visible child graphs restart the one-second `0.8→1.1→1` scale clip on changed Combo and independently hide after one second without another change. The AP parent continues its 0.8333333-second `alpha 1→0.5→1` loop above the normal graph. The AP texture is never substituted into the normal owner.

## Primary and Secondary judgement adjustment

Primary A is an audio/gameplay phase owner, not a chart offset:

- `A > 0`: the startup music edge yields exactly A outer updates, incrementing `fastCounter`, then commits BGM resume;
- `A = 0`: music starts without an intentional phase delay;
- `A < 0`: music starts first, then `slowCounter` blocks gameplay time, input, Note, judgement, Score/Life and gameplay particles for exactly `abs(A)` outer updates;
- Pause freezes the counters; Retry creates a fresh owner; MoveTime reconstruction explicitly bypasses the startup adjustment with zero counters;
- MV signed-delay routing and the Primary owner share the same startup edge. Negative MV delay continues from PlayingSound independently while negative A may still block gameplay.

Secondary B remains the independent `-5..5` axis used by the existing music-position, manual geometry, Auto and Slide consumers. Neither axis rewrites authored positions, BPM/SV, visibility windows or judgement constants.

## SyncLine and NoteColor

`SyncLine=true` retains the current fixed 80-slot NoteSyncLine pool, selected Skin material, geometry updates and shared teardown. `false` retains the pool and paired endpoint identity but never publishes or activates line geometry. It does not alter judgement, Combo, Score, Life, SE or particles.

`NoteColor` is not a tint switch. Only:

```text
FrontNoteType.Normal && noteColor && shortRhythmUnder8beat
```

selects `note_normal_16`; all other Normal fronts select `note_normal`, while Skill/Flick/Long/Slide keep their own families. Ordinary, selected Skin, HABAHIRO and Garupa product rendering use their exact normal/normal16 atlas bindings. Missing bindings fail before scene mutation; no gray/tint or nearest-Sprite fallback exists. The unrelated white render color is named `noteTint`.

## VisibleTapLaneEffect

This setting controls only the GamePlayButton lane Sprite, never particles, Judge HUD or sound.

The owner creates thirteen full/half-button slots and binds four current APK sprites in this order:

```text
_1,_1,_2,_2,_3,_3,_4,_4,_3,_3,_2,_2,_1
```

Manual Began/Ended is preflighted in the same input transaction. Auto and Manual judgement use the judged button-span center. Long and Slide phases reuse their recovered judgement/button routes. OffReserve is two outer updates. Fade uses ten nominal frames from the committed serialized clip: XY scale 1→0.7 and RG 1→0, with B/A retained, then Disabled. Pause, MoveTime, GameOver, Retry and dispose clear every active slot.

Four PNGs are selected and hash-validated with all ordinary-visible resources before renderer preparation. A missing or tampered byte rejects before scene publication, Movie preparation, mount or scheduler start. `visibleTapLaneEffect=false` still creates the fixed owner but publishes no visible updates; particle/audio/judgement/Score digests remain independent.

## MvDarkness

MvDarkness owns a black gameplay-MV cover, not video opacity. Pixi creates one `GarupaSimulatorMvLiveDarkCover` Graphics sibling after the video Sprite inside the MV stage. The video Sprite alpha is always 1.

Before Movie Play, all signed-delay branches start a Float32 0.8-second tween:

```text
fromAlpha = 1
targetAlpha = mvDarkness / 100
```

Pause freezes the tween. PlayingSound continues negative-delay/movie/cover updates even after startup presentation is complete. Movie end, Stop, terminal fault and dispose hide or destroy the cover. Standard background sessions construct neither movie nor cover backend.

## Product projections

Primary A/B and MvDarkness are global owners shared without product substitutes. The following are explicitly `closed-product-extension`, not original continuous-lane parity:

- Garupa/ExGarupa profiles freeze same-position visible-node `syncPairs` in authored order. Both endpoints use their own continuous projection each frame; there is no clamp, rounding or nearest lane.
- Product NoteColor uses the same short-rhythm predicate and selected normal/normal16 atlas.
- Product tap-lane sidecars use the recovered `_4` Sprite at the exact continuous span center and authored width. The existing product judgement effect remains independent when the setting is false.
- HABAHIRO reuses the original NoteManager/normal16/SyncLine and fixed tap-lane owners. External field/effect geometry differences remain product-disclosed; original HAB parity stays open.

These projections do not change CS-V1, fixed Rank, timeline revision, authored lanes or the seven fixed reference field lines.

## Acceptance and exclusions

The dedicated semantic/static leaf is `simulator:test:original-live-settings`; actual browser acceptance is `simulator:test:original-live-settings-webview2`. The latter decodes all four current PNGs and exercises a 13-slot on/fade/disabled lifecycle in three fresh WebView2 processes. Ordinary and MV browser leaves independently cover full-session composition and dark-cover output.

This closure does not authorize Stage 9, standalone MVView, 3D, CRI/USM exactness, fixed-device framebuffer/speaker exactness, charter, a global effect kill switch, arbitrary millisecond chart rewrite or runtime setting hot-switch.
