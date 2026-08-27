# Simulator test tiers

The simulator tests have two deliberately separate execution tiers.

## Development regression (default)

```powershell
npm.cmd run simulator:test
# equivalent:
npm.cmd run simulator:test:quick
```

This compiles the isolated simulator and the complete TypeScript test tree once, verifies fixture provenance and source-level dependency/contract boundaries once, then runs 17 development groups spanning compiled unit/contract tests, static checks, strict Garupa JSON direct-chart construction, chart parsing, clock scheduling, Auto Live, Public Life and Live/Rehearsal. The score-life leaf independently verifies CS-V1 BigInt quotas, normalized judgement rates, chart-owned identities, duplicate failure boundaries, and a full-chart `10,000,000+N` Auto result.

The shared compiled subset reports 28 unit/contract tests and 6 static checks; the dedicated Skin leaf adds the compiled full production-composition test for a total of 29 compiled unit/contract executables across the quick tier. Its audio coverage includes the Public BGM byte-only boundary, strict MPEG source-format/decode agreement under Web Audio context resampling, SHA/cue/profile derivation, caller-buffer ownership, Gaya owned-loop/fade, voice release, cleanup faults and the complete ordinary-route startup-callgraph fixture. The dedicated callgraph test consumes 44 methods, 10 R1 traces, four distinct `accepted-ordinary-gate-not-taken` mode rows, the hash-pinned Gaya bytes, zero-count ordinary closure and the independent first-Live tutorial `production_authorization=false` boundary.

The quick tier includes the startup-direction schema/state/mutation/Pixi/static leaf and the MV Live evidence/strict-container/signed-delay/state/fault/static leaf. It intentionally omits the expensive full-chart actual-Pixi replay, 7,200-frame particle production replay, full HABAHIRO production replay, and all real WebView2 leaves. A quick pass is suitable for normal edits but is not release evidence.

## Full release revalidation

```powershell
npm.cmd run simulator:test:total-revalidation
```

This runs the current 42-semantic-leaf DAG, starting with the runtime-contract-policy leaf that forbids blocking `evidence-required`, prototype/key-order exact gates and unclassified audit entries, including independent startup-audio and MV Live leaves, production browser decoder, three-fresh-process ordinary full-scene WebView2 acceptance, startup 3 fresh × 4 modes × 7 visual-phase acceptance plus real Gaya/WebAudio graph, and MP4/H264 + WebM/VP9 MV production decode/Pixi lifecycle in three fresh processes each. Current actual-framebuffer observation digests are ordinary `2cea4f8e3a2bc78b9e26b753c3419ae6d160ec6880f4f84cd6d54ad9346ac4c4` and isolated Score HUD `dd145cc1d945477ba156f4ba4b8ca73910790ee847d460c2dbe84e57ed3cbbc0`（每个fresh含24 captures及Pause/menu/Retry/Abort/countdown，并比较Auto→judge_auto及AP设置ON/OFF完整状态向量）, startup visual `5ffd7d40b278888397dd7a2e2e5c0f1d07fdae52965c20e4dedfcedc975f3edc`（包含4:3/32:9 aspect-cover captures）, and startup audio `7d537afa53d4ac3a4766b6f17ca1ab65e14f3e56158acc7a6c09c69e73a76adc`. The audio digest additionally requires `userActivation.isActive=false`、`hasBeenActive=false`、initial AudioContext `running` and advancing without a test-side `resume()`; it covers production browser decode, command/event/resource inventory and cleanup observation; it is not a physical speaker-onset, CRI/HCA or original framebuffer oracle. The DAG compiles the TypeScript test tree only once and shares that fresh output read-only across child runners; release timing and commit-binding notes remain local under ignored `tmp/`.

Cargo release targets are retained under each ignored WebView2 harness `target/` directory, so repeated full runs reuse validated Rust artifacts. To force the historical cold-build boundary:

```powershell
npm.cmd run simulator:test:total-revalidation:clean
```

`SIMULATOR_WEBVIEW2_CLEAN_BUILD=1` affects only ignored Cargo build artifacts. It does not alter browser process freshness, scene inputs, capture count, expected digests, or production behavior.

## Full visible/lifecycle independent oracle

```powershell
npm.cmd run simulator:test:full-visible-lifecycle-oracle
```

该门继续消费Reverse `4a61a184`的全量结构化合同与最小R1帧，但其旧聚合授权已由Reverse `1bff69eb`纠错预言机明确撤回。新fixture禁止从录屏取Score颜色，补齐Life 10组件serialized hierarchy、Retryable/Selectable/Annotated每个component的Transform祖先链，以及13槽Button/NoteLaneEffect精确Transform；门只确认原作事实和四向比较输入完整，`productionEquivalenceAuthorization=false`持续成立。它不导入production Score/Slide/particle helper，且不以PNG像素采样产生颜色或位置expected。

## HUD re-audit regression leaf

```powershell
npm.cmd run simulator:test:hud-reaudit-regression
```

该历史门单独仍只证明Score45/Life10、字体、SS曲线与SoftClip回归；能力恢复不依赖它的旧expected。2026-08-28第二次生产复现已证明此前`full-visible-lifecycle-oracle`、`lane-particle-same-state`、B.B.K全时间轴、actual Pixi、四模式27-capture WebView2和Windows截图组合仍会漏过明显错误，因此这些leaf全部降为回归/发现门，当前不授权`ordinaryHud`、`ordinaryCommandScene`、`originalLiveSettings`或已选择ordinary gates恢复。新的完成门必须以独立Reverse primitive/同状态帧逐对象否证旧expected，并由fresh生产窗口覆盖全时间轴。

## Original Pause leaves

```powershell
npm.cmd run simulator:test:live-rehearsal
npm.cmd run simulator:test:render-pixi
npm.cmd run simulator:test:ordinary-rendering-webview2
```

第一项消费Reverse `c2187fe3`纠正后的contract/resource profile与`99d40bcc`的19-trace manifest，验证四模式Pause状态链。第二项用actual Pixi要求dark cover为UICommon `fill` UISprite而非Graphics，并验证window/header/buttons/sgm、三行正文及Countdown3。第三项3 fresh共24 captures；当前ordinary digest见总门。布局仍来自serialized/StarUI公式，截图不反向生成标量。

## Startup-direction leaves

```powershell
npm.cmd run simulator:test:startup-direction
npm.cmd run simulator:test:startup-audio-callgraph
npm.cmd run simulator:test:startup-direction-webview2
```

第一项覆盖Schema 12、presentation复制/冻结、严格PNG/cmap、拒绝legacy null/非null SD/voice caller字段、Reverse `d408d758`授权的内部冻结空角色集合与缺SoundResource路径、四模式无输入0→5、opening gameplay mutation sentinel、prepared BGM、Live-only Gaya、Retry/MoveTime purpose及Pixi hierarchy；第二项消费Reverse `c8562fe4`纠正后的普通route调用图、四模式gate-not-taken谓词、唯一session-start、Gaya profile/字节与fault lifecycle，并锁定首次Live四页教程独立未授权；第三项使用production Pixi/Audio decoder和actual WebGL/WebAudio执行3个fresh process，分别锁定视觉与音频digest。它们只关闭current ordinary portable startup合同，不声明首次教程、speaker输出、CRI/HCA、Android或原Unity exact。测试生成的jacket/stage PNG只是显式产品输入，不是原作默认资源或像素oracle；测试和production均不再生成SD角色placeholder或开场语音。

## Original Live settings leaves

```powershell
npm.cmd run simulator:test:original-live-settings
npm.cmd run simulator:test:original-live-settings-webview2
```

第一项覆盖Schema 13、A/B、Pause/Retry/MoveTime、SyncLine/NoteColor、13-slot TapLaneEffect及MvDarkness。第二项验证ordinary四张Lane Sprite on→fade→disabled，digest为`ca8098873edc7975a42b28cd92cd63cd7231a3f31446f9c8a2cd33538f17d534`；另由Garupa product Browser门关闭曾被`ButtonType.None`旁路的整数span→主13槽路由。

## Original Skin leaves

```powershell
npm.cmd run simulator:test:skin-settings
npm.cmd run simulator:test:skin-settings-webview2
```

第一项覆盖Schema 12 required semantics/owned copy、42 normal/34 aggregate catalog、四模式/HAB/MV逐组件resolver、Collabo 36包级失败、whole-pack/embedded-file双SHA，并以production静态顺序门保证selected Skin assembly先于MV Movie backend construction/prepare、assembly拒绝只释放pending media resource、Movie prepare拒绝完整回滚所有owners；同时对default 58-resource/8-pack与Limited-3 59-resource/9-pack执行完整production resource composition、Field command publication和cleanup；WebAudio实际执行default与Limited-3 selected cues。`render-pixi`真实绑定并绘制selected Note、Field、Judge和可达special Background，不再只检查atlas identity。第二项分别对default和Limited-3各执行3 fresh WebView2 process，使用production straight-sRGB/Linear PNG/particle decoder和actual WebGL framebuffer绘制Field/Judge（Limited另含special Background），RGBA raster分别为`bf73d5bd1760feb6f4abe8ee33c520b239e7652412af0a6c2348202a31878de6`与`1261958494404ff221f2cb7d1e0f56efc0c1d8aa6a759d0e0e0c7972fc4c6c83`，observation digest分别为`35569dc970410da84f2d9d30f15ab860d98fc3215818f26bb9c0a4b0f657614c`与`19846ef549b3963ae9062ec61637205a7ed52864d5c47f7ff9be63a3dc85169d`。同一门检查dynamic ordinary/directional ParticleSystem与Field/backend cleanup归零；digest只属于当前browser observation，不是原设备随机流或framebuffer authority。

## MV Live leaves

```powershell
npm.cmd run simulator:test:mv-live
npm.cmd run simulator:test:mv-live-webview2
```

第一项消费Reverse `38802391`的runtime/oracle/closure/profile，覆盖Schema 12 nullable MV、strict MP4/WebM、内部metadata/SHA、MovieBeforeSound(17)、signed delay三分支、negative gameplay-before-movie、Gaya exclusion、pause/resume、finish/fault/cleanup及production static guard；该guard同时要求selected Skin assembly先于Movie backend construction/prepare，并锁定两级失败分支的单次ownership释放。第二项在WebView2中使用production Browser preflight和Pixi VideoSource，对MP4/H264与WebM/VP9各执行3 fresh process；含dark-cover的media digest为`34c345808fe455b337b43af44a32f214b9e79e595aca5c1c410176eb860c3db9`，serialized-widget raster digest为`538d21c3eb5f804fbea6f15620cc0ec34ba2a3b96ec1d3a4ac96bdd8fc66e7dd`。它们不声明CRI/USM、Android、speaker或Unity framebuffer exact。

## Garupa/ExGarupa product-extension leaves

```powershell
npm.cmd run simulator:test:garupa-extensions
npm.cmd run simulator:test:garupa-extensions-webview2
npm.cmd run simulator:test:garupa-external -- HOST________/D_N_A.json HOST________/B.B.K.K.B.K.K..json
```

第一项覆盖Schema 13、固定七条场地线、continuous/outside lane、product axis/graph、Auto/Manual与actual Pixi；width-one Slide按Reverse独立Float32 oracle保持透视细线，不作观感倍增。第二项执行3 fresh actual WebGL，除四个SV captures外还用真实四张Lane PNG驱动完整product engine，验证slot6/NoteLaneEffect_4/bottom pivot/add blend/bounds/framebuffer；digest为`bb85df1cc9d86cb2998461b8cf43b3bc2d00ec25db88b3965e9d38b4812c9000`。第三项继续执行两张外部谱面验收且不复制文件。

## Adaptive layout leaf

```powershell
npm.cmd run simulator:test:adaptive-layout
```

该leaf消费manifested Reverse `9167dce7` contract/closure，验证4:3、16:9、20:9、21:9、32:9、非对称safe area、Float32 StarUI/camera/gameplay、world round-trip、Garupa outside-lane、particle PPU、MoveTime circle和revision semantic reconstruction；另用actual Pixi scene graph验证4:3与32:9 projection/PPU。静态门扫描全部production TS，要求fixed 1600/720、截图profile、caller highAspect及未分类provenance计数为0。动态resize不声明Reverse等价，并按`GE-PS-SURFACE-ATOMIC-REBUILD`执行产品级whole-engine原子重建。

## Standalone leaves

All existing `simulator:test:*` leaf scripts remain standalone. `npm.cmd run simulator:test:runtime-contract-policy` verifies nonblocking evidence notices, classified audit coverage, zero production prototype/key-order gates and the absence of an `evidence-required` failure/terminal path. `npm.cmd run simulator:test:garupa-json` covers exact ownership, `GJP-D01` positions, original-compatible differential projection and product graph/axis/runtime semantics; `simulator:test:garupa-extensions` is the release leaf for the complete product path. Without the internal `SIMULATOR_TEST_COMPILED_ROOT` environment variable, each leaf creates, compiles, and removes its own temporary output exactly as before. The shared-output and shared-preflight variables are orchestration details owned by `runTotalRevalidationTests.mjs`; do not point them at hand-built or persistent output when claiming a test result.
