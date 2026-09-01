# Simulator capability test suite

`src/simulator/testing/suite/manifest.mjs` is the single owner of Simulator cases and checks. The suite is grouped by product capability rather than historical investigation or wrapper name.

## Layout

```text
testing/
├─ cases/                 # substantive chart/gameplay/session/render/media/resource/platform cases
├─ checks/                # static, provenance and independent-observation checks
├─ expected/independent/  # expected projections that cannot import production code
├─ fixtures/              # manifest-managed Reverse snapshots and immutable payloads
├─ product-samples/       # product inputs and production-derived non-oracle snapshots
├─ support/               # test-only adapters, profiles and observation helpers
└─ suite/                 # manifest and one runner
```

Every case/check has exactly one manifest owner, capability, profile set, authority tag, timeout and dependency list. Duplicate ownership, orphan files, unknown dependencies/profiles/authorities and dependency cycles fail before execution. Thin nested aggregate wrappers are not retained.

The manifest currently owns 95 cases/checks across nine capabilities. The default release profile runs 94; `product-chart.external` is the remaining explicit opt-in case because it requires caller-supplied chart paths.

## Profiles

```powershell
npm.cmd run simulator:test
npm.cmd run simulator:test:portable
npm.cmd run simulator:test:browser
npm.cmd run simulator:test:release
npm.cmd run simulator:test:release:clean
```

- **development**: fast contract/unit/static coverage. It is suitable for iteration but is not release evidence.
- **portable**: complete source-neutral and actual-Pixi portable coverage, including full charts, particles, HABAHIRO and independent observation checks.
- **browser**: real WebView2 decode, Pixi/WebGL, WebAudio and lifecycle cases. All WebView2 cases share one exclusive group and run serially.
- **release**: portable plus browser coverage. `release:clean` also removes each ignored harness Cargo target before rebuilding it.

Each invocation compiles `src/simulator` once and the complete TypeScript test tree once. Child cases consume the same fresh read-only output. The runner records every spawned PID; on timeout it terminates only that exact process tree (`taskkill /PID ... /T /F` on Windows, a detached process group elsewhere).

For inspection or focused diagnosis, invoke the runner directly:

```powershell
node src/simulator/testing/suite/run.mjs --list
node src/simulator/testing/suite/run.mjs --profile portable --capability render-hud-particles
node src/simulator/testing/suite/run.mjs --profile release --case platform.ordinary-rendering
node src/simulator/testing/suite/run.mjs --case product-chart.external -- ../charts/chart-a.json ../charts/chart-b.json
```

A focused success does not replace its containing profile.

## Authority boundaries

Fixture roles are defined by `fixtures/manifest.json` Schema 2:

- `reverse-contract`
- `reverse-oracle`
- `reverse-resource`
- `reverse-observation`
- `historical-superseded`
- `product-input`
- `product-probe`

`checks/verifyTestingFixtures.mjs` validates every path, remapped source commit, byte count, SHA-256 and `sourceRelation`. The pre-rewrite metadata tuple is retained only as a legacy baseline because it contains old commit IDs; a separate payload-only tuple proves that all 225 immutable payloads survived provenance remapping. Historical particle `+Y` and current native `+Z` fixtures are both required and have mutually explicit consumption identities.

Code under `expected/independent/` is scanned with the TypeScript AST and may not import production implementation. Production code may not import anything under `testing/`. The Auto Live grouping snapshot under `product-samples/` declares:

```json
{
  "kind": "product-derived-regression-snapshot",
  "derivedWithProductionCode": true,
  "originalBehaviorAuthority": false
}
```

It is a product regression snapshot, not an original oracle.

## Visible and browser gates

A visible capability is not closed by command existence, object count, nonzero pixels or a digest alone. Primitive/scene observations and actual framebuffer observations are separate required gates.

Every ordinary actual-framebuffer capture records a complete scenario identity:

- mode and input;
- chart identity/hash and timeline position;
- score and rank;
- session/render/particle/world owners;
- effect or clip phase;
- terminal status;
- viewport and DPR.

Browser digests lock the current portable product observation only. They are not Unity/GPU, native-random, CRI/HCA, physical-speaker or fixed-device exact oracles.

## Project-level entry points

```powershell
npm.cmd test          # app + chart + resources + runtime audit + development Simulator
npm.cmd run test:release
```

`test:release` does not replace `npm run build`, `npm run desktop:build` or a real release-window acceptance. Build output must be regenerated before `resources:verify-production-assets` is used.
