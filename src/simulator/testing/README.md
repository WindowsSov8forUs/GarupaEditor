# Simulator test tiers

The simulator tests have two deliberately separate execution tiers.

## Development regression (default)

```powershell
npm.cmd run simulator:test
# equivalent:
npm.cmd run simulator:test:quick
```

This compiles the isolated simulator and the complete TypeScript test tree once, verifies fixture provenance, the current mixed Reverse/product audit, and dependency boundaries once, then runs the compiled unit/contract tests, static checks, chart parsing, clock scheduling, and Auto Live. The score-life leaf independently verifies CS-V1 BigInt quotas, normalized judgement rates, chart-owned identities, duplicate failure boundaries, and a full-chart `10,000,000+N` Auto result.

The quick tier intentionally omits the expensive full-chart actual-Pixi replay, 7,200-frame particle production replay, full HABAHIRO production replay, and both real WebView2 leaves. A quick pass is suitable for normal edits but is not release evidence.

## Full release revalidation

```powershell
npm.cmd run simulator:test:total-revalidation
```

This retains the complete 26-semantic-leaf DAG, including the production browser decoder and three-fresh-process ordinary full-scene WebView2 acceptance. The current CS-V1 locked-environment ordinary digest is `ff6e7584988dc0ad32074858e52beed608ed19b6623c6558402dcef84bdf396c`; it is a portable regression observation, not an original framebuffer oracle. Pushed-detached release `b4a3432` passed all 26 semantic leaves in 1,853,406 ms. The DAG still compiles the TypeScript test tree only once and shares that fresh output read-only across child runners.

Cargo release targets are retained under each ignored WebView2 harness `target/` directory, so repeated full runs reuse validated Rust artifacts. To force the historical cold-build boundary:

```powershell
npm.cmd run simulator:test:total-revalidation:clean
```

`SIMULATOR_WEBVIEW2_CLEAN_BUILD=1` affects only ignored Cargo build artifacts. It does not alter browser process freshness, scene inputs, capture count, expected digests, or production behavior.

## Standalone leaves

All existing `simulator:test:*` leaf scripts remain standalone. Without the internal `SIMULATOR_TEST_COMPILED_ROOT` environment variable, each leaf creates, compiles, and removes its own temporary output exactly as before. The shared-output and shared-preflight variables are orchestration details owned by `runTotalRevalidationTests.mjs`; do not point them at hand-built or persistent output when claiming a test result.
