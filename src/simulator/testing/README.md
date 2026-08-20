# Simulator test tiers

The simulator tests have two deliberately separate execution tiers.

## Development regression (default)

```powershell
npm.cmd run simulator:test
# equivalent:
npm.cmd run simulator:test:quick
```

This compiles the isolated simulator and the complete TypeScript test tree once, verifies fixture provenance and source-level dependency/contract boundaries once, then runs 14 development groups spanning compiled unit/contract tests, static checks, strict Garupa JSON direct-chart construction, chart parsing, clock scheduling, Auto Live, Public Life and Live/Rehearsal. The score-life leaf independently verifies CS-V1 BigInt quotas, normalized judgement rates, chart-owned identities, duplicate failure boundaries, and a full-chart `10,000,000+N` Auto result.

The compiled subset contains 28 unit/contract tests and 6 static checks. Its audio coverage includes the Public BGM byte-only boundary, strict MPEG source-format/decode agreement under Web Audio context resampling, SHA/cue/profile derivation, caller-buffer ownership, Gaya owned-loop/fade, voice release, cleanup faults and the complete startup-callgraph fixture. The dedicated callgraph test consumes 44 methods, 10 R1 traces, four distinct mode rows, the hash-pinned Gaya bytes and zero-count closure.

The quick tier includes the startup-direction schema/state/mutation/Pixi/static leaf and the MV Live evidence/strict-container/signed-delay/state/fault/static leaf. It intentionally omits the expensive full-chart actual-Pixi replay, 7,200-frame particle production replay, full HABAHIRO production replay, and all real WebView2 leaves. A quick pass is suitable for normal edits but is not release evidence.

## Full release revalidation

```powershell
npm.cmd run simulator:test:total-revalidation
```

This runs the current 38-semantic-leaf DAG, including independent startup-audio and MV Live leaves, production browser decoder, three-fresh-process ordinary full-scene WebView2 acceptance, startup 3 fresh × 4 modes × 7 visual-phase acceptance plus real Gaya/WebAudio graph, and MP4/H264 + WebM/VP9 MV production decode/Pixi lifecycle in three fresh processes each. Current digests are ordinary `5ebf9c9db8c006cb0bf114b3f026006936a9c2ff2e171469411047fa6b57d088`, startup visual `dfaeb868728798c5064f5c42f8b2b00d6f10c44c618161adea02bcdbd4bd8f8f`（包含4:3/32:9 captures）, and startup audio `88a2a3103f6cdda3f16ba771b020e874b5ab929d59bbe1b45cbd39093570c268`. The audio digest covers production browser decode, command/event/resource inventory and cleanup observation; it is not a physical speaker-onset, CRI/HCA or original framebuffer oracle. The DAG compiles the TypeScript test tree only once and shares that fresh output read-only across child runners; release timing and commit-binding notes remain local under ignored `tmp/`.

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

第一项覆盖schema 11、presentation复制/冻结、严格PNG/cmap、拒绝legacy null/非null SD/voice caller字段、Reverse `d408d758`授权的内部冻结空角色集合与缺SoundResource路径、四模式0→5、opening gameplay mutation sentinel、prepared BGM、Live-only Gaya、Retry/MoveTime purpose及Pixi hierarchy；第二项逐项消费完整调用图、四模式谓词、Gaya profile/字节与fault lifecycle；第三项使用production Pixi/Audio decoder和actual WebGL/WebAudio执行3个fresh process，分别锁定视觉与音频digest。它们关闭current portable startup合同，但不声明speaker输出、CRI/HCA、Android或原Unity exact。测试生成的jacket/stage PNG只是显式产品输入，不是原作默认资源或像素oracle；测试和production均不再生成SD角色placeholder或开场语音。

## Original Skin leaves

```powershell
npm.cmd run simulator:test:skin-settings
npm.cmd run simulator:test:skin-settings-webview2
```

第一项覆盖Schema 11 exact shape、42 normal/34 aggregate catalog、四模式/HAB/MV逐组件resolver、Collabo 36包级失败、whole-pack/embedded-file双SHA、Limited-3实际render/audio pack、selected Note/Directional/Judge/Field/Background及WebAudio profile；`render-pixi`另执行actual Pixi selected atlas binding。第二项使用production `BrowserPixiTextureDecoder`执行3 fresh WebView2 process，观察9 packs、ImageBitmap-backed selected Note atlas、Field/Background bindings及dispose归零，当前digest为`38b026edee5f6f6b9e82ac53a13af9da6183926cc4b86ec4b2d128839bfe67c1`。同一WebView2门同时准备dynamic ordinary/directional ParticleSystem模块和production particle PNG decoder并检查cleanup；digest只属于当前browser observation，不是原设备随机流或framebuffer authority。

## MV Live leaves

```powershell
npm.cmd run simulator:test:mv-live
npm.cmd run simulator:test:mv-live-webview2
```

第一项消费Reverse `38802391`的runtime/oracle/closure/profile，覆盖schema 11 nullable MV、strict MP4/WebM、内部metadata/SHA、MovieBeforeSound(17)、signed delay三分支、negative gameplay-before-movie、Gaya exclusion、pause/resume、finish/fault/cleanup及production static guard。第二项在WebView2中使用production Browser preflight和Pixi VideoSource，对MP4/H264与WebM/VP9各执行3 fresh process；media digest为`f786bb96ac09eb36c93e641d119a4f3dd30f1691b2e210e153bbab48220b0234`，serialized-widget raster digest为`5253f7943b57bbe653ec767ac396b1e3f39d0ca6ffc96f11fc44e4fa5e105477`。它们不声明CRI/USM、Android、speaker或Unity framebuffer exact。

## Garupa/ExGarupa product-extension leaves

```powershell
npm.cmd run simulator:test:garupa-extensions
npm.cmd run simulator:test:garupa-extensions-webview2
npm.cmd run simulator:test:garupa-external -- HOST________/D_N_A.json HOST________/B.B.K.K.B.K.K..json
```

第一项覆盖schema 11、无laneCount的Public边界、固定0..6七条场地线、任意有限continuous/outside lane、product profile/axis、完整Slide graph、Auto/Manual、CS-V1、Pause/Retry/MoveTime、actual Pixi和static boundary。第二项用production Browser decoder和actual WebGL执行3 fresh process，锁定initial/negative/zero/restore digest `2d6c70ef1c2776ac89638b3ef0eff895b7a423aeace3643a2b8aa45277ddce06`。第三项是显式外部验收：没有路径时只报告unavailable；有路径时先校验固定size/SHA，再跑两张全谱的parser/profile/axis与Auto/Manual AP；外部文件不复制进fixture或production。

## Adaptive layout leaf

```powershell
npm.cmd run simulator:test:adaptive-layout
```

该leaf消费manifested Reverse `9167dce7` contract/closure，验证4:3、16:9、20:9、21:9、32:9、非对称safe area、Float32 StarUI/camera/gameplay、world round-trip、Garupa outside-lane、particle PPU、MoveTime circle和revision failure；另用actual Pixi scene graph验证4:3与32:9 projection/PPU。静态门扫描全部production TS，要求fixed 1600/720、截图profile、caller highAspect及未分类provenance计数为0。动态resize按Reverse结论保持`evidence-required`。

## Standalone leaves

All existing `simulator:test:*` leaf scripts remain standalone. `npm.cmd run simulator:test:garupa-json` covers exact ownership, `GJP-D01` positions, original-compatible differential projection and product graph/axis/runtime semantics; `simulator:test:garupa-extensions` is the release leaf for the complete product path. Without the internal `SIMULATOR_TEST_COMPILED_ROOT` environment variable, each leaf creates, compiles, and removes its own temporary output exactly as before. The shared-output and shared-preflight variables are orchestration details owned by `runTotalRevalidationTests.mjs`; do not point them at hand-built or persistent output when claiming a test result.
