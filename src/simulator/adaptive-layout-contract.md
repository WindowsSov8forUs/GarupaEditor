# Adaptive landscape layout contract

## Runtime policy classification

Reverse evidence owns original-layout claims. During a session, the browser host fits the existing canvas to the available CSS area while preserving the initial logical viewport, safe area and engine state. This product display adaptation does not reproduce Unity resize internals; evidence status remains internal capability metadata under [`../runtime-contract-policy.md`](../runtime-contract-policy.md).

## Authority and status

- Reverse commit: `9167dce77d0472a000b509f993b0e66e44e4797f`.
- Investigation: `artifacts/investigations/simulator-multiaspect-layout-runtime-contract-10-1-4/`.
- Locked sample: `jp.co.craftegg.band` 10.1.4 / 230 / `arm64-v8a`.
- Initial landscape surface: `closed-portable`.
- Mid-session original parity: `observational-gap`; product runtime: `GE-PS-SURFACE-CANVAS-FIT`.
- Initial portrait layout, Unity GPU/framebuffer exact, physical-device raster and Stage 9 remain outside this contract. A later portrait CSS host fits the already initialized landscape canvas.

The old 1600×720 delivery frame is now only one regression sample. It is not a logical-canvas constant or a source of production coordinates.

## Platform boundary

Viewport and safe area are platform capabilities, not Public business request fields. Public Schema 13 remains exactly `{chartData,presentation,config}` and accepts neither `config.visual.highAspectRatio` nor caller-authored startup-character/voice fields.

The platform supplies exactly one initial state:

```ts
interface SimulatorSurfaceState {
  readonly revision: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly safeArea: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly origin: "bottom-left";
}
```

The viewport is positive integral render pixels with `width >= height`. The base safe-area Rect uses exact finite binary32 values, is positive and lies wholly inside the viewport. It corresponds to the original `getSafeAreaBaseData` boundary. Simulator then executes `getHighAspectAndroidSafeArea`, `calcNotch` and downstream StarUI formulas; it does not infer an OS notch or master-device identity.

Portrait, NaN/Infinity, fractional viewport dimensions, out-of-bounds safe areas and repaired/clamped inputs fail at the copy boundary.

## StarUI and camera formulas

All scalar operations follow ARM64 binary32 order (`Math.fround` after each operation):

```text
ScreenWidthBase       = 1334
ScreenHeightBase      = 750
AspectRatioBase       = 1.778666615486145
HighAspectRatioMax    = 2
AndroidFullSafeRatio  = 0.8999999761581421

AspectRatio = width / height
IsHighAspectRatioDevice = AspectRatio > AspectRatioBase
HighAspectRatio = clamp(
  (AspectRatio - AspectRatioBase) /
  (HighAspectRatioMax - AspectRatioBase), 0, 1)

ScreenRatio = (width / 1334, height / 750)
VerticalFitScreenRatio = height / ((width / 1334) * 750)
```

A full base safe area on a high-aspect surface is narrowed to 90% and centered. `calcNotch` symmetrizes each axis using the larger opposite inset. Final `SafeAreaRatio` is final-size/screen-size.

`ScreenToSafeAreaRatio` is:

- full final safe area: `VerticalFitScreenRatio` on high-aspect, otherwise 1;
- inset final safe area: `min(SafeAreaRatio.x, SafeAreaRatio.y)` and additionally multiplied by `VerticalFitScreenRatio` when `ScreenRatio.x >= ScreenRatio.y`.

Current GameCamera is full normalized viewport, orthographic size 1, world center 0 and Z -15:

```text
cameraHalfHeight = 1
cameraHalfWidth  = width / height
pixelsPerWorldUnit = height / 2
worldX = (screenX - width/2) / pixelsPerWorldUnit
worldY = (screenY - height/2) / pixelsPerWorldUnit
```

There is no fixed center or PPU.

## Gameplay, input and particles

```text
screenWidthAdjustRate = cameraHalfWidth / 9.578571319580078
normalizedNoteSize    = noteSize / 100
noteSettingScale      = screenWidthAdjustRate * normalizedNoteSize
particleTransformScale = noteSettingScale * ScreenToSafeAreaRatio
```

`particleTransformScale` is not one final world scalar. Original `setupParticleScale` multiplies every include-inactive ParticleSystem component's own Transform localScale. The source-bound per-system hierarchy records which ancestor Transforms own ParticleSystem components; local-to-world consumes emitting self then immediate parent through root, applying `g` only at those exact owners. Inventory size is derived from the selected ordinary/directional bundles and is never fixed to the old default-only count 104.

Regular GamePlayButton, original NoteSlide and product Slide carry distinct typed outer transforms. NoteSlide displacement uses live target-button scale × outer `n`; copied ParticleSystems retain their separate setup `g`, and Local billboard size consumes only the emitting system's post-setup scale. Product continuous X remains a product adapter and cannot redefine either scalar.

Game-clear serialized transforms remain in authored UI units. Its only outer scale is `screenToSafeChildScale / pixelsPerWorldUnit`, with zero position and identity rotation; shared native primitive projection then runs once. A hard-coded 375 displacement, birth-origin split or HUD-owned second simulation is forbidden. These current particle/owner formulas are `closed-native-algorithm-equivalent`; initial layout as a whole remains `closed-portable` and arbitrary mid-session resize remains a product rebuild semantic.

Button/launcher positions, seven original lane goals, thirteen full/half tap-lane-effect owners, note starts, manual inverse projection, Long/Slide width and particle projection consume this state. Garupa continuous/outside lane remains its approved affine product extension over the resulting original seven-lane world spacing. It never creates extra field lines or snaps authored lane values.

## NGUI, HUD and Rehearsal controls

Current `UI_Root` is serialized as Constrained FitWidth at 1334×750:

```text
pixelsPerAuthoredUnit = viewportWidth / 1334
screenToSafeChildScale = pixelsPerAuthoredUnit * ScreenToSafeAreaRatio
```

Ordinary information/HUD descendants compose this scale. Score and Life additionally use their serialized Left/Right+Top safe anchors. Authored widget, panel, NineSlice, atlas, font and animation values remain original resource facts; they are not screenshot measurements.

MoveTime uses the committed current prefab:

- Left/Right+Center safe anchors;
- child offsets `+72/-72`;
- button UISprites `104×104` with exact atlas rows;
- `StarUIScreenToSafeArea` scaling;
- `ButtonBase.radius = 0.12` world units;
- `searchPressedUIButton` compares squared world distance with radius squared.

The hit shape is therefore a circle of pixel radius `0.12 * height/2`, not the removed synthetic 100×100 rectangle. Time background uses the serialized Right+Top hierarchy and 172×32 widget. Rehearsal Auto `デモプレイ` and Live Auto `オートライブ` use the serialized Left+Top scene root, `(130,-135)` content offset, `(0,1)` prefab background offset and 206×38 widget; the Live caption consumes exact `label_round_white`, serialized pink tint and white 24-point label. Actual atlas textures/NineSlice borders are used; screenshot alpha bounding boxes are not consumed.

## Startup, standard backdrop and MV

Startup information consumes the current GameStartInfo hierarchy under `screenToSafeChildScale`: title base, line-star, difficulty-colored jacket backing, jacket/frame, separate difficulty label, title, band, fixed-position prefixed credits and Full Live label. Missing credits hide their own authored label and do not trigger invented reflow. DifficultyLabelObject retains white outlined text, original X offset and letter spacing; its optional Frame is hidden during startup, and no extra level number is drawn.

Jacket remains a strict 360×360 RGBA resource. Standard backdrop accepts positive intrinsic RGBA PNG dimensions and draws the original 1920×1440 UITexture at local Y=-170. UIRoot FitWidth and Stage's high-aspect root transform precede the TRSRoot three-second OutQuad transition from position (0,111), scale 0.7 to position (0,0), scale 0.92. A separate 0.75-second linear gray-to-white color transition starts with the stage intro; alpha is not a substitute for these transforms. Source: Reverse `705049d2890812828f36f3874fd130f0e13748de`, `simulator-entry-flash-consumption-10-1-4`. This is source-level application presentation alignment, not GPU acceptance.

On natural Game Clear, StandardBackgroundModule invokes the Stage outro: the current TRS pose returns to the authored start over four seconds with OutQuad. The scene owner publishes eased transform progress during the same completion frames as HUD/particles; Pixi only applies the pose. Standard WaitForFinish does not delay exit for this tween, and MV OnGameClear is empty. Source: Reverse `3baf2930d24de0169dfd69f7f3fc967a663b8101`, `simulator-entry-flash-consumption-10-1-4/stage_clear_native.json`; current method-token bindings and IDA regions were checked against the original APK/ELF.

Current InGameMovie prefab owns a 1334×750 UITexture plus `StarUIVerticalFitScreen`:

- UIRoot first applies FitWidth;
- high-aspect surfaces additionally apply `VerticalFitScreenRatio`;
- the resulting widget is centered;
- browser video is stretched into that widget, permanently muted and non-looping;
- BGM remains the only audible music owner.

The prior `(160,0,1280,720)` statement is only the approximate 1600×720 sample result; production uses the parameterized serialized widget formula.

## Surface revision disposition

Reverse proves no complete original arbitrary-resize refresh route:

1. StarUI getters poll Screen dimensions and recompute StarUI fields.
2. Arbitrary `setScreenSize` does not call the complete `RefreshSafeArea` component enumeration.
3. `RefreshSafeArea` reinitializes ScreenToSafeArea/SafeAreaToScreen/FullScreenTexture, but not `StarUIVerticalFitScreen`.
4. `ButtonManager.execMultiResolution` and particle setup run at gameplay startup and have no arbitrary resize caller.

Therefore Reverse authorizes only the initial revision as an original-parity claim. `GE-PS-SURFACE-CANVAS-FIT` replaces the former rebuild/replay policy: the browser retains that initial backing store and logical surface for the session, including Retry and MoveTime. Resize, orientation and safe-area events change only the canvas CSS placement and uniform display scale. Both the whole canvas and its logical safe area must fit the corresponding host regions; differing aspect ratios leave unused space. The canvas dimensions come from the actual initial surface, never a fixed 1600×720 constant. Pointer events use the displayed canvas rectangle to map back to the unchanged logical viewport.

No resize creates an engine, restarts media, advances a simulation clock or replays terminal particles. Minimized zero-size hosts hide the canvas until usable dimensions return. The obsolete surface-rebuild purpose and replay route are removed; Live no longer retains per-frame or input-resolution history for resizing. Rehearsal retains its existing explicit MoveTime replay data. A platform that changes the logical surface during a session violates the host contract; ordinary physical resizing through the browser adapter does not change it.

Validation uses actual fitting/adapter methods for ten aspect/safe-area/input mappings and four resize/minimize cycles, plus Live/Rehearsal replay-owner checks and TypeScript compilation. This verifies the coordinate mapping and unchanged state ownership without an application run or device-raster claim.

## Provenance gate

Note-line clipping uses the current initial surface, not a captured pixel threshold.
`ButtonManager.SetupSudden` (`0x3882974`) projects the serialized NoteLane bottom
and top; `InGameCalculatedData.GetSuddenPos` (`0x32f1b1c`) interpolates them.
For the supported SuddenRate=0, the bottom-left cutoff is
`height/2 + (-240 + 610) * screenToSafeChildScale`: -240 and 610 are the level3
NoteLane Transform/UITexture values, while the scale and viewport are runtime
inputs. The existing committed resource-rendering ARM64 slices and multiaspect
level3 bytes own this rule. Long/Slide meshes, SyncLine and MultipleDirectional
lines share it, including Garupa extension consumers; repeated line geometry
updates retain the same mask. CSS resizing still preserves the initial surface.

Production layout scalars must be one of:

- `original-serialized`;
- `original-static-code`;
- `original-runtime-state`;
- `resource-metadata`;
- `approved-product-contract`.

Screenshots, fixed-device frame manifests and WebView2 raster digests are `observation-only`. The release gate requires zero unclassified values, zero screenshot-derived production consumers, zero fixed-frame layout authorities and zero unknown formula/order claims.
