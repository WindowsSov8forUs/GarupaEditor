# Adaptive landscape layout contract

## Runtime policy classification

Reverse evidence owns original-layout claims. Missing original resize evidence is an internal notice, not a production terminal condition; GarupaEditor must use a separately registered atomic product surface-rebuild semantic without claiming original equivalence. The production runtime now contains no `evidence-required` resize failure path; evidence status remains internal capability metadata under [`../runtime-contract-policy.md`](../runtime-contract-policy.md).

## Authority and status

- Reverse commit: `9167dce77d0472a000b509f993b0e66e44e4797f`.
- Investigation: `artifacts/investigations/simulator-multiaspect-layout-runtime-contract-10-1-4/`.
- Locked sample: `jp.co.craftegg.band` 10.1.4 / 230 / `arm64-v8a`.
- Initial landscape surface: `closed-portable`.
- Mid-session original parity: `observational-gap`; product runtime: `GE-PS-SURFACE-ATOMIC-REBUILD`.
- Portrait, Unity GPU/framebuffer exact, physical-device raster and Stage 9 remain outside this contract.

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

Startup information consumes the committed GameStartInfo hierarchy under `screenToSafeChildScale`: line-star, jacket/frame, difficulty, title, band, nullable fixed-position credits and Full Live label. Missing credits hide their own authored label and do not trigger invented reflow.

Jacket remains a strict 360×360 RGBA resource. Standard portable backdrop accepts any positive intrinsic RGBA PNG and fills the current surface; intrinsic resource size is no longer conflated with viewport size. This backdrop mapping remains the existing portable presentation contract and is not claimed as original stage/GPU parity.

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

Therefore Reverse authorizes only the initial revision as an original-parity claim. GarupaEditor separately registers `GE-PS-SURFACE-ATOMIC-REBUILD`: before the next input frame, it constructs a fresh deferred-mount generation against the newly observed valid landscape surface, replays the current timeline with physical audio suppressed, disposes the previous mount, publishes current BGM/visual state, then atomically updates surface/control ownership. A failed candidate is not published; the session releases and returns to the editor without an evidence error page. This product behavior does not claim original resize equivalence and never letterboxes to a fixed 1600×720 frame.

## Provenance gate

Production layout scalars must be one of:

- `original-serialized`;
- `original-static-code`;
- `original-runtime-state`;
- `resource-metadata`;
- `approved-product-contract`.

Screenshots, fixed-device frame manifests and WebView2 raster digests are `observation-only`. The release gate requires zero unclassified values, zero screenshot-derived production consumers, zero fixed-frame layout authorities and zero unknown formula/order claims.
