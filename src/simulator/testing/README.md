# Simulator test tiers

The simulator tests have two deliberately separate execution tiers.

## Development regression (default)

```powershell
npm.cmd run simulator:test
# equivalent:
npm.cmd run simulator:test:quick
```

This compiles the isolated simulator and the complete TypeScript test tree once, verifies fixture provenance and source-level dependency/contract boundaries once, then runs 12 development groups spanning compiled unit/contract tests, static checks, strict Garupa JSON direct-chart construction, chart parsing, clock scheduling, Auto Live, Public Life and Live/Rehearsal. The score-life leaf independently verifies CS-V1 BigInt quotas, normalized judgement rates, chart-owned identities, duplicate failure boundaries, and a full-chart `10,000,000+N` Auto result.

The compiled subset contains 27 unit/contract tests and 5 static checks. Its audio coverage includes the Public BGM byte-only boundary, strict MPEG source-format/decode agreement under Web Audio context resampling, SHA/cue/profile derivation, caller-buffer ownership, Gaya owned-loop/fade, voice release, cleanup faults and the complete startup-callgraph fixture. The dedicated callgraph test consumes 44 methods, 10 R1 traces, four distinct mode rows, the hash-pinned Gaya bytes and zero-count closure.

The quick tier includes the startup-direction schema/state/mutation/Pixi/static leaf and the MV Live evidence/strict-container/signed-delay/state/fault/static leaf. It intentionally omits the expensive full-chart actual-Pixi replay, 7,200-frame particle production replay, full HABAHIRO production replay, and all three real WebView2 leaves. A quick pass is suitable for normal edits but is not release evidence.

## Full release revalidation

```powershell
npm.cmd run simulator:test:total-revalidation
```

This runs the current 34-semantic-leaf DAG, including independent startup-audio and MV Live leaves, production browser decoder, three-fresh-process ordinary full-scene WebView2 acceptance, startup 3 fresh × 4 modes × 7 visual-phase acceptance plus real Gaya/WebAudio graph, and MP4/H264 + WebM/VP9 MV production decode/Pixi lifecycle in three fresh processes each. Current digests are ordinary `a09166cf3049c4bca01ef7d9a51ecc777319975e2dd1a5875f6e0a38f7e42199`, startup visual `0f33657eff4dfacad24ad51a495cb1adde81af9b5e3fa4a44a8996f5a93dc14d`, and startup audio `88a2a3103f6cdda3f16ba771b020e874b5ab929d59bbe1b45cbd39093570c268`. The audio digest covers production browser decode, command/event/resource inventory and cleanup observation; it is not a physical speaker-onset, CRI/HCA or original framebuffer oracle. The DAG compiles the TypeScript test tree only once and shares that fresh output read-only across child runners; release timing and commit-binding notes remain local under ignored `tmp/`.

Cargo release targets are retained under each ignored WebView2 harness `target/` directory, so repeated full runs reuse validated Rust artifacts. To force the historical cold-build boundary:

```powershell
npm.cmd run simulator:test:total-revalidation:clean
```

`SIMULATOR_WEBVIEW2_CLEAN_BUILD=1` affects only ignored Cargo build artifacts. It does not alter browser process freshness, scene inputs, capture count, expected digests, or production behavior.

## Startup-direction leaves

```powershell
npm.cmd run simulator:test:startup-direction
npm.cmd run simulator:test:startup-audio-callgraph
npm.cmd run simulator:test:startup-direction-webview2
```

第一项覆盖schema 5、presentation复制/冻结、严格PNG/MP3/cmap、四模式0→5、opening gameplay mutation sentinel、prepared BGM、Live-only Gaya、voice/null/release、Retry/MoveTime purpose及Pixi hierarchy；第二项逐项消费完整调用图、四模式谓词、Gaya profile/字节与fault lifecycle；第三项使用production Pixi/Audio decoder和actual WebGL/WebAudio执行3个fresh process，分别锁定视觉与音频digest。它们关闭current portable startup合同，但不声明speaker输出、CRI/HCA、Android或原Unity exact。测试生成的jacket/stage/SD PNG只是显式产品输入，不是原作默认资源或像素oracle。

## MV Live leaves

```powershell
npm.cmd run simulator:test:mv-live
npm.cmd run simulator:test:mv-live-webview2
```

第一项消费Reverse `38802391`的runtime/oracle/closure/profile，覆盖schema 5 nullable MV、strict MP4/WebM、内部metadata/SHA、MovieBeforeSound(17)、signed delay三分支、negative gameplay-before-movie、Gaya exclusion、pause/resume、finish/fault/cleanup及production static guard。第二项在WebView2中使用production Browser preflight和Pixi VideoSource，对MP4/H264与WebM/VP9各执行3 fresh process；media digest为`f786bb96ac09eb36c93e641d119a4f3dd30f1691b2e210e153bbab48220b0234`，raster digest为`ad8f9c4b089bd519e3f8fa70a0ab1b7a00de123a064a0376e6e3e0130feb9094`。它们不声明CRI/USM、Android、speaker或Unity framebuffer exact。

## Standalone leaves

All existing `simulator:test:*` leaf scripts remain standalone. `npm.cmd run simulator:test:garupa-json` covers the fetched main union, exact ownership, `GJP-D01` positions, BPM, Note/HAB/Directional/Slide graphs, ignored SV/timingGroup, unsupported-shape failure, BMS common-semantic differential cases and actual engine Auto/Manual outcomes. Without the internal `SIMULATOR_TEST_COMPILED_ROOT` environment variable, each leaf creates, compiles, and removes its own temporary output exactly as before. The shared-output and shared-preflight variables are orchestration details owned by `runTotalRevalidationTests.mjs`; do not point them at hand-built or persistent output when claiming a test result.
