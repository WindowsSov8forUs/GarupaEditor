# Simulator test tiers

The simulator tests have two deliberately separate execution tiers.

## Development regression (default)

```powershell
npm.cmd run simulator:test
# equivalent:
npm.cmd run simulator:test:quick
```

This compiles the isolated simulator and the complete TypeScript test tree once, verifies fixture provenance and source-level dependency/contract boundaries once, then runs 11 development groups spanning compiled unit/contract tests, static checks, strict Garupa JSON direct-chart construction, chart parsing, clock scheduling, Auto Live, Public Life and Live/Rehearsal. The score-life leaf independently verifies CS-V1 BigInt quotas, normalized judgement rates, chart-owned identities, duplicate failure boundaries, and a full-chart `10,000,000+N` Auto result.

The audio group includes the Public BGM byte-only boundary, ID3v2/MPEG Layer III first-frame parser, decoded-header agreement, SHA/cue/profile derivation, caller-buffer ownership and Web Audio decoded-buffer reuse tests.

The quick tier includes the startup-direction schema/state/mutation/Pixi/static leaf. It intentionally omits the expensive full-chart actual-Pixi replay, 7,200-frame particle production replay, full HABAHIRO production replay, and all three real WebView2 leaves. A quick pass is suitable for normal edits but is not release evidence.

## Full release revalidation

```powershell
npm.cmd run simulator:test:total-revalidation
```

This retains the complete 31-semantic-leaf DAG, including the production browser decoder, three-fresh-process ordinary full-scene WebView2 acceptance, and the independent startup-direction 3 fresh × 4 modes × 7 phases acceptance. Current digests are ordinary `a09166cf3049c4bca01ef7d9a51ecc777319975e2dd1a5875f6e0a38f7e42199` and startup `0f33657eff4dfacad24ad51a495cb1adde81af9b5e3fa4a44a8996f5a93dc14d`; both are portable regression observations, not original framebuffer or speaker-onset oracles. The DAG compiles the TypeScript test tree only once and shares that fresh output read-only across child runners; release timing and commit-binding notes remain local under ignored `tmp/`.

Cargo release targets are retained under each ignored WebView2 harness `target/` directory, so repeated full runs reuse validated Rust artifacts. To force the historical cold-build boundary:

```powershell
npm.cmd run simulator:test:total-revalidation:clean
```

`SIMULATOR_WEBVIEW2_CLEAN_BUILD=1` affects only ignored Cargo build artifacts. It does not alter browser process freshness, scene inputs, capture count, expected digests, or production behavior.

## Startup-direction leaves

```powershell
npm.cmd run simulator:test:startup-direction
npm.cmd run simulator:test:startup-direction-webview2
```

第一项覆盖schema 4、presentation复制/冻结、严格PNG/MP3/cmap、四模式0→5、opening mutation sentinel、voice/null、延迟BGM、Retry/MoveTime purpose及Pixi hierarchy；第二项使用production decoder、FontFace和actual Pixi WebGL执行3个fresh process。测试生成的jacket/stage/SD PNG只是显式产品输入，不是原作默认资源或像素oracle。

## Standalone leaves

All existing `simulator:test:*` leaf scripts remain standalone. `npm.cmd run simulator:test:garupa-json` covers the fetched main union, exact ownership, `GJP-D01` positions, BPM, Note/HAB/Directional/Slide graphs, ignored SV/timingGroup, unsupported-shape failure, BMS common-semantic differential cases and actual engine Auto/Manual outcomes. Without the internal `SIMULATOR_TEST_COMPILED_ROOT` environment variable, each leaf creates, compiles, and removes its own temporary output exactly as before. The shared-output and shared-preflight variables are orchestration details owned by `runTotalRevalidationTests.mjs`; do not point them at hand-built or persistent output when claiming a test result.
