# Frame-rate control flow

This investigation closes the static frame-rate chain from managed startup code
through the Android Surface implementation. It uses the locked 10.1.3 ARM64
`libil2cpp.so`, Il2CppDumper metadata, exact string-literal addresses, and the
APK's original Smali. No AVD, hook, APK modification, or process-memory write is
required.

## Confirmed

- `DeviceUtility.RefreshRateInit @ 0x3B03A48` reads
  `Screen.currentResolution.refreshRateRatio`, divides its unsigned numerator by
  denominator, rounds the double to one decimal with `Math.Round(..., 1,
  ToEven)`, and stores the float in `initDisplayRefreshRate`.
- Initialization passes
  `max(initDisplayRefreshRate, Application.targetFrameRate)` to
  `PluginInterface.RefreshRateInit`.
- `DeviceUtility.SetTargetFrameRate @ 0x3B03BF8` first writes the requested
  integer to `Application.targetFrameRate`, then passes
  `max(initDisplayRefreshRate, requestedFrameRate)` to
  `PluginInterface.SetRefreshRate`.
- Both PluginInterface paths construct
  `jp.co.craftegg.band.lib.SetDisplayRefreshRate` and call the exact static
  methods `setRefreshRateInit` or `setRefreshRate` with one boxed float.
- The APK initializer finds `unitySurfaceView` on the UI thread, creates one
  `RefreshRateSetter`, registers a `SurfaceHolder.Callback`, and applies the
  requested rate immediately when the Surface is valid.
- `RefreshRateSetter` retains the requested float while the Surface is absent,
  reapplies it from `surfaceCreated`, clears the Surface from
  `surfaceDestroyed`, and calls `Surface.setFrameRate(rate, 0)` on Android API
  level 30 or newer.
- The exact High Frequency option callback at `0x38FF100..0x38FF128` only writes
  `value & 1` to `LiveCoreSettingsProtoData + 0xA0`. Neither it nor its exact
  initializer directly branches to the recovered DeviceUtility/PluginInterface
  frame-rate functions.
- `LiveCoreSettings..ctor(data) @ 0x3A8856C..0x3A88AB8` copies the persisted
  byte from `LiveCoreSettingsProtoData + 0xA0` to runtime
  `LiveCoreSettings + 0xA9` at `0x3A88A08..0x3A88A0C`.
- `InGameDirector.Awake @ 0x32F8668..0x32F8BB8` reads the runtime byte at
  `0x32F8790`, selects `60` when disabled or `120` when enabled at
  `0x32F87B0..0x32F87B8`, and directly calls
  `DeviceUtility.SetTargetFrameRate` at `0x32F87CC`.

## Inference

- `Surface.setFrameRate(rate, 0)` is a platform hint. The physical display or
  compositor can choose a different mode, so this call alone does not prove
  achieved cadence.

## Unresolved

- Actual device display-mode selection and frame pacing remain runtime and
  platform observations; the low-cadence translated AVD recording cannot decide
  them.

Regenerate and verify:

```powershell
python artifacts\investigations\frame-rate-control-flow\analyze_frame_rate_control.py
python artifacts\investigations\frame-rate-control-flow\verify_frame_rate_control.py
```
