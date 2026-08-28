# Simulator Original Live Settings Contract

> **2026-08-28 second re-audit status: `closed-evidence-equivalent`.** The failed `630a676d` claim remains withdrawn. Reverse `1bff69eb` revoked blanket authorization and added exact consumer chains; `c5223b25` corrected the full B.B.K timeline. The implementation now passes the required four-way original-node→production-consumer→independent-primitive→fresh-frame gate for Lane/AP/Auto/Pause/terminal and the adjacent ordinary scene. This remains portable evidence equivalence; fixed-device Unity/GPU output is outside the claim.

## Runtime policy classification

Reverse owns original-setting claims. Valid product actions outside that proven scope continue through registered product semantics and internal notices rather than `evidence-required`; malformed settings or inconsistent state remain typed action/integrity failures. See [`../runtime-contract-policy.md`](../runtime-contract-policy.md).

## Authority and scope

This contract is locked to `jp.co.craftegg.band` 10.1.4 / code 230 / ARM64 and Reverse commits `bba194684529b62b443b3d12d538f45adf5e0a29` plus the positive-counter coroutine correction `50bc40b641e32a4f70ca84d7d0d5f7e332d3a906`.

Evidence lives only in `artifacts/investigations/simulator-original-live-settings-runtime-contract-10-1-4/`: OLS-E01–E37, OLS-R01–R06, OLS-P01 and OLS-C01. HUD/AP correction evidence is Reverse `341749d90e3c68cc9fd85d16fbc501f733378623`; complete HUD component/logic基础为`879fcec25d02969b31a86b9972225f9ea27d5093`，五项消费纠错为`c2187fe31eeedc0f288dfd29c25f741f93732ea8`，Score最终字体与NGUI UISpriteData可见闭环为`818b8db6149bedf9f816a1935d171fbccdf6dbbc`。The implementation does not consume Reverse, `tmp/`, test fixtures, network, wall clock or ambient settings at runtime.

## Public Schema 13

The owned root projection remains `{ chartData, presentation, config }`. Field order, plain/frozen prototype and unrelated host metadata do not affect validation; the copy reads only the following mandatory `config` semantics and drops additional fields:

```ts
judgementAdjustValue: number;      // integer -30..30
judgementAdjustValueB: number;     // integer -5..5
syncLine: boolean;
noteColor: boolean;
visibleTapLaneEffect: boolean;
allPerfectStatusDisplayMode: boolean;
mvDarkness: number;                // 0,10,20,30,40,50,60,70
```

They coexist with mandatory `sessionMode`, `inputMode`, `highFrequencyMode`, `skin`, `visual` and `audio`. There are no aliases or defaults. Legacy metadata such as `judgeOffsetFrames`, `offsetMs`, `effectEnable` and `mvAlphaPercent` is discarded by the owned semantic projection and never overrides the mandatory current fields.

The immutable internal snapshot separates LiveCore fields (HighFrequency, A, B, MvDarkness) from Live fields (SyncLine, NoteColor, VisibleTapLaneEffect, AllPerfectStatusDisplayMode). Its canonical identity participates in initial, Retry and MoveTime fresh-build comparison. Pause/Resume does not reload it and there is no hot-switch command.

## All Perfect Combo display setting

`allPerfectStatusDisplayMode` is the Public projection of original `LiveCoreSettingsProtoData.isAllPerfectStatusDisplayMode`. The application exposes a “コンボ状态显示” ON/OFF setting and persists that choice. Reverse confirms both original branches but not the original new-account default. The application therefore follows the same pre-adaptation pattern as other Simulator settings: new settings and legacy caches without a boolean receive the explicit product default `true` under `app.simulator.all-perfect-status-display-default-on-v1`, preserving the pre-Schema-13 product behavior. Public/transport/engine still receive one resolved boolean; this product migration default is not claimed as an original default.

OFF initializes ordinary status to None and suppresses the AP graph. ON initializes AllPerfect; Perfect preserves it and Great or below clears it. Rendering owns two persistent parallel graphs:

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

The owner creates thirteen full/half-button slots and binds the four serialized level3 GamePlayButton sprites (independent of selected field-line Skin resources) in this order:

```text
_1,_1,_2,_2,_3,_3,_4,_4,_3,_3,_2,_2,_1
```

Manual Began/Ended is preflighted in the same input transaction. Auto and Manual judgement use the judged button-span center. Long and Slide phases reuse their recovered judgement/button routes. OffReserve is two outer updates. Fade uses the committed 0.1666667-second serialized clip: XY scale 1→0.7, RGB remains white, alpha 1→0, then the renderer is disabled. The former RG-only fade that retained blue was a binding-decoding error and is forbidden because it falsely tinted the correct resource cyan. Pause, MoveTime, GameOver, Retry and dispose clear every active slot.

Reverse `c2187fe3`后的入口纠错确认一项产品桥接缺陷：product-extension的scoring source按设计使用`ButtonType.None`以隔离NoteManager，但此前Lane owner也错误读取该值，导致含负/零SV的整张谱即使使用整数0..6 lane也完全不显示beam。当前只为整数、连续且完整位于0..6的product node按`noteIndex`恢复authored span并送回同一13槽owner；每槽直接消费Reverse `1bff69eb`的Button/half-Button Transform，不再以相邻full midpoint重算。Score/判定source仍保持None，fractional/outside节点不获得原作Lane-effect声明。

Four PNGs are selected and hash-validated with all ordinary-visible resources before renderer preparation. Reverse `f3fde602` remains the lifecycle source, while `1bff69eb` supplies the missing exact per-slot Transform consumer oracle. A missing or tampered byte rejects before scene publication and `visibleTapLaneEffect=false` publishes no visible updates. The ON branch now compares all thirteen positions, resource route, bottom pivot, additive blend, On/OffReserve/fade/retrigger/cleanup mutations, actual Pixi bounds, three-fresh Browser output and Windows full-chart frames before capability restoration.

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

The dedicated semantic/static leaf is `simulator:test:original-live-settings`; the browser leaf is now a regression/discovery harness only. Its four-PNG and 13-slot checks do not authorize visible equivalence because they did not compare original same-state component mutations, placement and lifetime.

This closure does not authorize Stage 9, standalone MVView, 3D, CRI/USM exactness, fixed-device framebuffer/speaker exactness, charter, a global effect kill switch, arbitrary millisecond chart rewrite or runtime setting hot-switch.
