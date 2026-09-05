# GarupaEditor Simulator

`src/simulator` is an autonomous, source-neutral rhythm-game module. Original behavior claims are limited to verified, committed and pushed Reverse evidence for `jp.co.craftegg.band` 10.1.4 (version code 230, ARM64). GarupaEditor extensions are identified by stable product semantics and are never presented as original-game facts.

The current test-fixture baseline remains `343c09cc06ee97f3f2532518eff6192913de2b19`; later native-equivalence evidence is consumed through source-bound production profiles rather than copied into fixtures. Production code never reads Reverse, `tmp/` or `testing/fixtures`.

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

Required resources are prepared and decoded before backend, scene or engine mutation. Particle semantics retain exact application revision/file receipts, official UnityFS/component identities and independent encoded/decoded texture digests; ordinary, directional and Game-clear enter one cached immutable prepare token shared by simulation and Pixi. Missing or incompatible resources make the action unavailable; unsafe paths, corrupt bytes, ownership violations and non-rollbackable consistency failures remain fail-closed. Silent media, white textures, nearest-name aliases, stale revisions and default-Skin substitution are forbidden.

Frame mutation uses detached backend capabilities. Potentially failing portable/physical commits run before OneFrame, score/life, particle, audio semantic, HUD and tap-lane owner publication. Physical AudioNode effects and GPU/context scene mutation cannot be rolled back and are reported as external side-effect boundaries; they never authorize a claim of cross-device physical atomicity.

## Current capability boundary

**Rendering re-audit is OPEN.** The Score runtime-anchor regression is corrected, but particle cross-scene sorting and stretched-billboard consumption remain open. Earlier resource/primitive audit passes do not close these production paths. See [`rendering-consumption-contract.md`](./rendering-consumption-contract.md); its dispositions supersede historical aggregate closure statements.

`closed-native-algorithm-equivalent` means that the current 10.1.4 ARM64/serialized state transition, Float32 formula, random ownership, source resource relation and GPU-pre primitive handoff are closed for the named scope. It does **not** claim Unity/GPU driver raster, fixed-device pixels, CRI/USM or physical speaker equivalence.

| Capability | Product status | Claim boundary |
| --- | --- | --- |
| Public recipe and autonomous host | `closed-portable` | Public Schema 13, transport Schema 3 and the one source-neutral launcher remain product architecture |
| Live/Rehearsal × Manual/Auto lifecycle | `closed-native-algorithm-equivalent` | Independent mode axes, startup/gameplay/pause, Life-zero, terminal and Rehearsal MoveTime owner order; physical A/V output remains external |
| Ordinary command scene and current particles | `observational-gap` | Source-bound resource/core work is retained; projected stretch direction and ordinary/particle final ordering are not closed |
| Original Slide particle owner | `closed-native-algorithm-equivalent` | Eight-slot pool, target-button transform, outer `n`, per-ParticleSystem `g`, Stop/Clear/Play and current-node movement are separate owners |
| Score/ordinary HUD presentation | `observational-gap` | Runtime safe-area anchor restored without moving authored child nodes; full final glyph/clip consumption remains under audit; score input remains product CS-V1 |
| Original Live settings and current Skin switching | `observational-gap` / `closed-static-portable` | Static package selection and identity reuse are retained; selected render/HUD/Skin output gates remain open |
| HABAHIRO current external path | `closed-native-algorithm-equivalent` | Three leased packages, exact Root_effect Sprite graph/curves, frame-25 resource mutation and frame-60 no-callback lifecycle |
| Base clear / FC / AP | `observational-gap` for rendering | Shared particle world and Animator/callback work is retained; the shared geometry/composition gaps also prevent terminal rendering closure |
| Frame publication | `closed-native-algorithm-equivalent` | OneFrame, score/life, product-reflect, particle, audio semantic state, HUD and tap-lane owners publish only after all detached backend commits succeed |
| Startup direction/audio | `closed-portable` | Prepared BGM, Live-only Gaya and null SD/voice route; tutorial, CRI/HCA and speaker exact excluded |
| Gameplay MV | `closed-portable` | Live Manual/Auto portable media, signed delay, darkness, pause/resume and cleanup; standalone MVView/Star3D/CRI excluded |
| Garupa lanes, SV, TimingGroup, continuous input and extended Slide | `closed-product-extension` | Explicit GarupaEditor chart/scoring semantics only; native presentation primitives may be reused without relabelling the chart domain |
| Desktop/mobile composition | `closed-product-integration` | Public Schema 13 over transport Schema 3 and application Snapshot/Lease |
| Browser/GPU/fixed-device output | `open-not-claimed` | Browser font raster, GPU/driver quantization, context loss, fixed-device framebuffer and physical audio are outside algorithm equivalence |
| Character/card/deck skills, Fever, multiplayer, Live2D and Star3D | `excluded` | No Public or production dependency may imply support |

Original natural Auto clear status is `1`. GarupaEditor Live Auto AP presentation (`clearStatus=3`) remains a separately identified product semantic and is not an original terminal oracle. CS-V1 likewise remains `PRODUCT_ONLY` even where it consumes native-equivalent HUD algorithms.

Particle semantics are source-bound to application snapshot revisions and independent receipt digests. A single immutable prepared token contains ordinary, directional and Game-clear bundles; simulation and Pixi share it. Runtime state is per concrete `(owner generation, ParticleSystem component)`, parent transforms are stored root→immediate and consumed self→immediate→root, and current no-Shape/type-5 direction is `+Z [0,0,1]`.

The historical particle fixture with local `+Y` remains `historical-superseded`; it is not deleted or rewritten. GPU/driver raster and actual framebuffer remain independent gates and cannot be inferred from command count, object count or a stable digest.

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
