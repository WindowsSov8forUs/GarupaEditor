# Simulator test tiers

The simulator tests have two deliberately separate execution tiers.

## Development regression (default)

```powershell
npm.cmd run simulator:test
# equivalent:
npm.cmd run simulator:test:quick
```

This compiles the isolated simulator and the complete TypeScript test tree once, verifies fixture provenance and source-level dependency/contract boundaries once, then runs 10 development groups spanning compiled unit/contract tests, static checks, strict Garupa JSON direct-chart construction, chart parsing, clock scheduling, Auto Live, Public Life and Live/Rehearsal. The score-life leaf independently verifies CS-V1 BigInt quotas, normalized judgement rates, chart-owned identities, duplicate failure boundaries, and a full-chart `10,000,000+N` Auto result.

The quick tier intentionally omits the expensive full-chart actual-Pixi replay, 7,200-frame particle production replay, full HABAHIRO production replay, and both real WebView2 leaves. A quick pass is suitable for normal edits but is not release evidence.

## Full release revalidation

```powershell
npm.cmd run simulator:test:total-revalidation
```

This retains the complete 29-semantic-leaf DAG, including the production browser decoder and three-fresh-process ordinary full-scene WebView2 acceptance. The latest locked-environment 3 fresh × 21 ordinary digest is `e968d7900bca1ea0e96e9864479207ed3af00db7aada31c1b70370d68b23e8e0`; it is a portable regression observation, not an original framebuffer oracle. The Garupa JSON adapter adds the 29th direct-chart leaf. The DAG compiles the TypeScript test tree only once and shares that fresh output read-only across child runners; release timing and commit-binding notes remain local under ignored `tmp/`.

Cargo release targets are retained under each ignored WebView2 harness `target/` directory, so repeated full runs reuse validated Rust artifacts. To force the historical cold-build boundary:

```powershell
npm.cmd run simulator:test:total-revalidation:clean
```

`SIMULATOR_WEBVIEW2_CLEAN_BUILD=1` affects only ignored Cargo build artifacts. It does not alter browser process freshness, scene inputs, capture count, expected digests, or production behavior.

## Standalone leaves

All existing `simulator:test:*` leaf scripts remain standalone. `npm.cmd run simulator:test:garupa-json` covers the fetched main union, exact ownership, `GJP-D01` positions, BPM, Note/HAB/Directional/Slide graphs, ignored SV/timingGroup, unsupported-shape failure, BMS common-semantic differential cases and actual engine Auto/Manual outcomes. Without the internal `SIMULATOR_TEST_COMPILED_ROOT` environment variable, each leaf creates, compiles, and removes its own temporary output exactly as before. The shared-output and shared-preflight variables are orchestration details owned by `runTotalRevalidationTests.mjs`; do not point them at hand-built or persistent output when claiming a test result.
