# GarupaEditor Simulator

`src/simulator` is an autonomous, source-neutral rhythm-game module. Original behavior claims are limited to verified, committed and pushed Reverse evidence for `jp.co.craftegg.band` 10.1.4 (version code 230, ARM64). GarupaEditor extensions are identified by stable product semantics and are never presented as original-game facts.

The current Reverse fixture baseline is `e7e419bcc91433bf058d06b9548fa9729e6e49e1`. Production code never reads Reverse, `tmp/` or `testing/fixtures`.

## Public boundary

The only business entry point is:

```ts
launchSimulatorModule(
  request: SimulatorModuleLaunchRequest,
): Promise<SimulatorModuleLaunchResult>
```

The request root is exactly `{ chartData, presentation, config }` after owned semantic projection:

- `chartData`: parsed Garupa JSON `chart`, BGM bytes and explicit `isFullLength`;
- `presentation`: song/difficulty text, jacket PNG, required standard-stage backdrop and nullable host-supplied MV bytes;
- `config`: Live/Rehearsal × Manual/Auto, original Live settings, Skin selection, visual values and audio gains.

The recipe is Schema 13. Desktop/mobile transport is internal Schema 3 and preserves six Float32 values by bit encoding; it adds no Public fields. Resource IDs, providers, URLs, paths, hashes, snapshots, leases, surfaces and backend objects are not Public business data. Extra caller metadata is ignored by the owned projection; malformed required semantics or corrupt bytes reject only the current launch.

Garupa chart lanes may use any finite continuous position. Projection always uses the original seven-track spacing and the field always renders the fixed `0..6` seven lines; there is no variable lane-count domain.

## Architecture

```text
src/simulator/
├─ public/      # request/result/launch contracts
├─ runtime/     # autonomous scheduler, input and session lifecycle
├─ assembly/    # frozen recipe and atomic resource/backend assembly
├─ platform/    # neutral production surface/resource capabilities
├─ scene/       # unified ordinary/particle/manual/HAB layout ownership
├─ host/        # engine host and whole-engine replay
├─ engine/      # chart, state, judgement, notes and command producers
├─ backends/    # Recording, Pixi, WebAudio, movie and particle adapters
├─ resources/   # source-blind leased package views and decoders
└─ testing/     # capability suites, independent expected values and fixtures
```

`engine/` does not depend on React, Pixi, Tauri, DOM, editor chart types or window protocols. Simulator production does not import the application resource manager. The app adapter creates one immutable Snapshot/Lease and exposes only the neutral capability in `platform/resourceContracts.ts`.

Required resources are prepared and decoded before backend, scene or engine mutation. Missing or incompatible resources make the action unavailable; unsafe paths, corrupt bytes, ownership violations and non-rollbackable consistency failures remain fail-closed. Silent media, white textures, nearest-name aliases, stale revisions and default-Skin substitution are forbidden.

## Current capability boundary

| Capability | Product status | Claim boundary |
| --- | --- | --- |
| Public recipe, chart construction, scheduling and lifecycle | `closed-portable` | Schema 13, four modes, Retry/MoveTime/Pause and deterministic cleanup within current evidence |
| Manual/Auto judgement, score and life | `closed-portable` | Original judgement evidence plus product scoring contract [`scoring-contract.md`](./scoring-contract.md); product scoring is not an original score claim |
| Ordinary notes, HUD, Lane effects and Pixi composition | `closed-portable-product-regression` | Primitive stream and actual framebuffer gates are both required; original Unity/GPU pixel equivalence remains open |
| Ordinary judgement particles | `closed-portable-product-regression` | Eight roots, full serialized system graph, current type-5 local `+Z` direction and product-visible framebuffer coverage; native random/GPU exact remain open |
| FC/AP presentation | `closed-portable-product-regression` | `text-in -> text-out -> alpha-zero terminal`; base-clear callback and additional animation owners remain separate |
| Startup direction/audio | `closed-portable` | Four ordinary mode routes, prepared BGM, Live-only Gaya and absent public SD/voice resources; tutorial, CRI/HCA and speaker exact excluded |
| Original Live settings and Skin switching | `closed-static-portable` | Schema 13 settings, aggregate resolver, selected resource composition and browser rendering; non-default original-device frame parity not claimed |
| Live/Rehearsal × Manual/Auto and Pause controls | `closed-portable` | Explicit mode identities, Life-zero behavior, ±5 rehearsal controls and serialized Pause/countdown |
| Gameplay MV | `closed-portable` | Live Manual/Auto, strict MP4/WebM, signed delay, darkness, pause/resume and cleanup; standalone MVView/Star3D/CRI excluded |
| HABAHIRO current external path | `closed-portable` | Complete pinned portable resource/scene/consumer route; original physical-frame parity remains observational |
| Garupa/ExGarupa lanes, SV, TimingGroup and extended Slide graphs | `closed-product-extension` | Explicit GarupaEditor semantics only |
| Desktop/mobile composition | `closed-product-integration` | Public Schema 13 over transport Schema 3 and application Snapshot/Lease |
| Fixed-device physical exact | `open-not-claimed` | Native random, GPU/driver raster, calibrated visual onset, CRI/Android/speaker output and real adaptive cadence are not equivalent claims |
| Character/card/deck skills, Fever, multiplayer, Live2D and Star3D | `excluded` | No Public or production dependency may imply support |

Original natural Auto clear status is `1`. GarupaEditor Auto AP presentation is separately authorized product behavior and cannot be used as an original terminal oracle.

The historical particle simulation fixture with local `+Y` is retained as `historical-superseded`; current native evidence and corrected oracle use local `+Z [0,0,1]`. Tests must select these identities explicitly rather than rewriting or deleting the historical bytes.

The B.B.K single-width regression is product semantics `simulator.bbkk-single-width-ordinary-particle-visible-regression-v1`. It requires complete Pixi particle publication, bilateral fine and large visible features, and additive composition that never decreases opaque-backdrop RGB. It does not transfer component thresholds, random tuples or single-root attribution from a different original capture.

## Evidence and authority

- Reverse is the only authority for original fields, thresholds, order, component graphs and state transitions.
- Only verified, committed, pushed evidence is consumed. Fixture provenance is recorded in `testing/fixtures/manifest.json`.
- Independent expected code under `testing/expected/independent` cannot import production implementation.
- Product-derived snapshots live under `testing/product-samples` and explicitly declare `derivedWithProductionCode: true` and `originalBehaviorAuthority: false`.
- Evidence gaps are internal notices. Reachable product behavior requires an explicit `productSemanticsId`; gaps are not launch failures or user-facing terminal states.

See [`evidence-workflow.md`](./evidence-workflow.md), [`../runtime-contract-policy.md`](../runtime-contract-policy.md), [`original-live-settings-contract.md`](./original-live-settings-contract.md), [`skin-settings-contract.md`](./skin-settings-contract.md), [`mv-live-contract.md`](./mv-live-contract.md) and [`garupa-extension-contract.md`](./garupa-extension-contract.md).

## Stable verification commands

```powershell
npm.cmd run simulator:test             # development profile
npm.cmd run simulator:test:portable    # complete portable profile
npm.cmd run simulator:test:browser     # serial WebView2 profile
npm.cmd run simulator:test:release     # portable + browser release profile
npm.cmd run simulator:test:release:clean
```

The suite manifest is the single owner of every case/check. Each profile compiles the Simulator and TypeScript test tree once. WebView2 cases run serially, and the runner terminates only the exact process tree it spawned. Development success does not replace portable, browser, build, desktop or real-window release gates. See [`testing/README.md`](./testing/README.md).
