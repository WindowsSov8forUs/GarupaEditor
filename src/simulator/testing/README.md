# Simulator test tiers

The simulator tests have two deliberately separate execution tiers.

## Development regression (default)

```powershell
npm.cmd run simulator:test
# equivalent:
npm.cmd run simulator:test:quick
```

This compiles the isolated simulator and the complete TypeScript test tree once, verifies fixture provenance and source-level dependency/contract boundaries once, then runs 20 development groups including the eight-domain strict visible-lifecycle static gate, compiled unit/contract tests, strict Garupa JSON direct-chart construction, chart parsing, clock scheduling, Auto Live, Public Life and Live/Rehearsal. The score-life leaf independently verifies CS-V1 BigInt quotas, normalized judgement rates, chart-owned identities, duplicate failure boundaries, and a full-chart `10,000,000+N` Auto result.

The shared compiled subset reports 28 unit/contract tests and 6 static checks; the dedicated Skin leaf adds the compiled full production-composition test for a total of 29 compiled unit/contract executables across the quick tier. Its audio coverage includes the Public BGM byte-only boundary, strict MPEG source-format/decode agreement under Web Audio context resampling, SHA/cue/profile derivation, caller-buffer ownership, Gaya owned-loop/fade, voice release, cleanup faults and the complete ordinary-route startup-callgraph fixture. The dedicated callgraph test consumes 44 methods, 10 R1 traces, four distinct `accepted-ordinary-gate-not-taken` mode rows, the hash-pinned Gaya bytes, zero-count ordinary closure and the independent first-Live tutorial `production_authorization=false` boundary.

The quick tier includes the startup-direction schema/state/mutation/Pixi/static leaf and the MV Live evidence/strict-container/signed-delay/state/fault/static leaf. It intentionally omits the expensive full-chart actual-Pixi replay, 7,200-frame particle production replay, full HABAHIRO production replay, and all real WebView2 leaves. A quick pass is suitable for normal edits but is not release evidence.

## Full release revalidation

```powershell
npm.cmd run simulator:test:total-revalidation
```

This runs the current 45-semantic-leaf DAG, starting with the runtime-contract-policy leaf that forbids blocking `evidence-required`, prototype/key-order exact gates and unclassified audit entries, including independent startup-audio and MV Live leaves, production browser decoder, three-fresh-process ordinary full-scene WebView2 acceptance, startup 3 fresh × 4 modes × 7 visual-phase acceptance plus real Gaya/WebAudio graph, and MP4/H264 + WebM/VP9 MV production decode/Pixi lifecycle in three fresh processes each. Current actual-framebuffer observation digests are ordinary `04b543b56e61bebae1992b9047172668f0c5f4b256c947a4bfdde024b3b3021f` and isolated Score HUD `dd145cc1d945477ba156f4ba4b8ca73910790ee847d460c2dbe84e57ed3cbbc0`（每个fresh含27 captures，并显式比较ScoreGaugeSS Flash→BigStar→kira sibling/phase、Auto Awake时HUD alpha、Combo保持/Judge独立hide、Pause/menu/Retry/Abort/完整countdown曲线、Float32粒子Mesh、Lane flip/mask和base/FC/AP）, startup visual `5ffd7d40b278888397dd7a2e2e5c0f1d07fdae52965c20e4dedfcedc975f3edc`（包含4:3/32:9 aspect-cover captures）, and startup audio `7d537afa53d4ac3a4766b6f17ca1ab65e14f3e56158acc7a6c09c69e73a76adc`. The audio digest additionally requires `userActivation.isActive=false`、`hasBeenActive=false`、initial AudioContext `running` and advancing without a test-side `resume()`; it covers production browser decode, command/event/resource inventory and cleanup observation; it is not a physical speaker-onset, CRI/HCA or original framebuffer oracle. The DAG compiles the TypeScript test tree only once and shares that fresh output read-only across child runners; release timing and commit-binding notes remain local under ignored `tmp/`.

Cargo release targets are retained under each ignored WebView2 harness `target/` directory, so repeated full runs reuse validated Rust artifacts. To force the historical cold-build boundary:

```powershell
npm.cmd run simulator:test:total-revalidation:clean
```

`SIMULATOR_WEBVIEW2_CLEAN_BUILD=1` affects only ignored Cargo build artifacts. It does not alter browser process freshness, scene inputs, capture count, expected digests, or production behavior.

## Full visible/lifecycle independent oracle

```powershell
npm.cmd run simulator:test:full-visible-lifecycle-oracle
```

该门继续消费Reverse `4a61a184`的全量结构化合同与最小R1帧，但其旧聚合授权已由Reverse `1bff69eb`纠错预言机明确撤回。新fixture禁止从录屏取Score颜色，补齐Life 10组件serialized hierarchy、三套Pause Transform祖先链及13槽精确Transform；oracle自身仍保持`productionEquivalenceAuthorization=false`，只提供独立expected。能力只能由其外部四向aggregate门恢复：production consumer、actual primitive、fresh Browser与Windows同状态全部通过，不能修改fixture的false来“授权自己”。

## Seven visual lifecycle reconfirmation

```powershell
npm.cmd run simulator:test:seven-visual-lifecycle
npm.cmd run simulator:test:browser-webview2
npm.cmd run simulator:test:ordinary-rendering-webview2
```

第一项只读取Reverse `e5a15b82`晋升的单一独立fixture，锁定`SVL-R01..SVL-R07`、Slide稳定owner、五个`> SS` UIPanel Float32行、3秒SS循环、2.2833333秒附加clip、3.233秒终局及FC/AP 104/129逐channel矩阵。Browser门读取实际WebGL合成framebuffer，以非单位alpha反例区分一次alpha与错误二次alpha；ordinary三fresh门进一步要求game-clear `uvFrame=11`为top-left row 2、实际Pixi framebuffer区别被拒绝的row 1、ScoreGaugeSS 7.5秒不重启，以及FC/AP所有channel在最终帧保持至3.232秒。上述仅授权portable Browser/Pixi消费，不声明Unity/GPU fixed-device逐像素一致。

## Strict HUD/particle/Pause/terminal leaf

```powershell
npm.cmd run simulator:test:strict-visible-lifecycle
```

该门消费Reverse `dbd009e7`的214,523-byte严格合同，静态锁定Score SS 11节点及Flash→BigStar→kira同深度绘制序、Auto Awake owner、Combo/Judge独立消失、Linear Float32粒子颜色、Lane右侧flipX/VisibleOutsideMask、Pause UILabel box、25/10-curve resume profile及base+FC/AP组合。动态部分由actual Pixi、ordinary 3-fresh×27、OLS和selected-Skin fresh门组成；Lane专项另断言一个scene-owned MaskImage/13个同identity引用、mask不进入ordinary color build、四角Backdrop sentinel、至少80%背景保留及白色像素上限。粒子使用共享GlProgram+per-Mesh Float32 uniform，不允许逐样本Filter离屏pass或RGB8 tint。该门不升级native random、GPU framebuffer或physical speaker exact。

## HUD re-audit regression leaf

```powershell
npm.cmd run simulator:test:hud-reaudit-regression
```

该历史门单独仍只证明Score45/Life10、字体、SS曲线与SoftClip回归；能力恢复不依赖它的旧expected。第二次完成门已按Reverse `1bff69eb`/`c5223b25`重建：B.B.K逐50ms tick、Life真实绿色fill、source-pink/旧double-gamma反例、三Pause父链、Lane13、particle17 roots、终局持久HUD/15ms exit均有独立primitive门；再叠加actual Pixi、ordinary 3-fresh×27、全部Browser矩阵、Windows 676 Combo/AP全程及45叶total pass。该完整组合授权ordinary相关门恢复；任一历史leaf或digest仍不能单独授权。

## Original Pause leaves

```powershell
npm.cmd run simulator:test:live-rehearsal
npm.cmd run simulator:test:render-pixi
npm.cmd run simulator:test:ordinary-rendering-webview2
```

第一项消费Reverse `c2187fe3`纠正后的contract/resource profile与`99d40bcc`的19-trace manifest，验证四模式Pause状态链。第二项用actual Pixi要求dark cover为UICommon `fill` UISprite而非Graphics，并验证window/header/buttons/sgm、serialized UILabel boxes及Contents/Count3/2/1/1Fadeout/Fill逐帧曲线。第三项3 fresh共27 captures；当前ordinary digest见总门。布局仍来自serialized/StarUI公式，截图不反向生成标量。

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

第一项覆盖Schema 13、A/B、Pause/Retry/MoveTime、SyncLine/NoteColor、13-slot TapLaneEffect及MvDarkness。第二项验证ordinary四张Lane Sprite on→white-RGB/alpha-only half-fade→disabled，并显式断言中点`tint=FFFFFF, alpha=0.5`，digest为`b5abc6ad2ed3e3421805b90361113a15123ba2a43c8980a15969dc710e863a58`；13槽同时断言slots8..12 `flipX`、共享单一VisibleOutsideMask、非零active raster及背景无遮挡，位置逐项消费Reverse `1bff69eb`的Button/half-Button Transform而不以相邻full midpoint重算。另由Garupa product Browser门关闭曾被`ButtonType.None`旁路的整数span→主13槽路由。判定粒子actual Pixi逐17 root比较GamePlayButton anchor+完整system-parent position，并按`sortingOrder→system identity→creationSequence`排序；禁止再以particle `position.z`冒充未取证renderer bounds center。

## Original Skin leaves

```powershell
npm.cmd run simulator:test:skin-settings
npm.cmd run simulator:test:skin-settings-webview2
```

第一项覆盖Schema 13 required semantics/owned copy、42 normal/34 aggregate catalog、四模式/HAB/MV逐组件resolver、Collabo 36包级失败、whole-pack/embedded-file双SHA，并以production静态顺序门保证selected Skin assembly先于MV Movie backend construction/prepare、assembly拒绝只释放pending media resource、Movie prepare拒绝完整回滚所有owners；同时对default 57-resource/8-pack与Limited-3 58-resource/9-pack执行完整production resource composition、Field command publication和cleanup，并新增120-system、8 logical/7 unique PNG的10.1.4 exact default-particle lease/tamper门；WebAudio实际执行default与Limited-3 selected cues。`render-pixi`真实绑定并绘制selected Note、Field、Judge和可达special Background，不再只检查atlas identity。第二项分别对default和Limited-3各执行3 fresh WebView2 process，使用production straight-sRGB/Linear PNG/particle decoder和actual WebGL framebuffer绘制Field/Judge（Limited另含special Background），RGBA raster分别为`28a44dd5d6ff09953a7657954806c4cb8b2dcd0cfd56b6842c605f49084cece7`与`19d5a32ba70cef4d7ec06374a41d18eb93a96dba7eec4417c767af4c80149d24`，observation digest分别为`eaf8eae36e809a7d5425b37ab817b01f6fef0ce285226d3cbdf11905155e1571`与`d6fba8fa42d04a0846c9e48c6c6f1a1e8bcd852cfdcd333ceaf1c44eedb29326`。同一门检查exact-default ordinary/directional ParticleSystem与Field/backend cleanup归零；digest只属于当前browser observation，不是原设备随机流或framebuffer authority。

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

第一项覆盖Schema 13、固定七条场地线、continuous/outside lane、product axis/graph、Auto/Manual与actual Pixi；Reverse `c5223b25`纠正后的B.B.K oracle按`GJP-D01 floor(48*beat)`逐50ms公开1,617个visible/1,611个upper-half tick，actual Pixi必须完整枚举83 Slide/141 segment、每帧22顶点/60索引并逐tick同集。width-one保持独立Float32公式；1600×900观测threshold `44322D84`按正交归一高度投影到初始surface，禁止在2400×1350仍写死712.711而把mesh裁到下半屏。第二项执行3 fresh actual WebGL，除四个SV captures外还用真实四张Lane PNG驱动完整product engine，验证slot6/NoteLaneEffect_4/bottom pivot/add blend/bounds/framebuffer；digest为`bb85df1cc9d86cb2998461b8cf43b3bc2d00ec25db88b3965e9d38b4812c9000`。第三项继续执行两张外部谱面验收且不复制文件。

## Adaptive layout leaf

```powershell
npm.cmd run simulator:test:adaptive-layout
```

该leaf消费manifested Reverse `9167dce7` contract/closure，验证4:3、16:9、20:9、21:9、32:9、非对称safe area、Float32 StarUI/camera/gameplay、world round-trip、Garupa outside-lane、particle PPU、MoveTime circle和revision semantic reconstruction；另用actual Pixi scene graph验证4:3与32:9 projection/PPU。静态门扫描全部production TS，要求fixed 1600/720、截图profile、caller highAspect及未分类provenance计数为0。动态resize不声明Reverse等价，并按`GE-PS-SURFACE-ATOMIC-REBUILD`执行产品级whole-engine原子重建。

## Standalone leaves

All existing `simulator:test:*` leaf scripts remain standalone. `npm.cmd run simulator:test:runtime-contract-policy` verifies nonblocking evidence notices, classified audit coverage, zero production prototype/key-order gates and the absence of an `evidence-required` failure/terminal path. `npm.cmd run simulator:test:garupa-json` covers exact ownership, `GJP-D01` positions, original-compatible differential projection and product graph/axis/runtime semantics; `simulator:test:garupa-extensions` is the release leaf for the complete product path. Without the internal `SIMULATOR_TEST_COMPILED_ROOT` environment variable, each leaf creates, compiles, and removes its own temporary output exactly as before. The shared-output and shared-preflight variables are orchestration details owned by `runTotalRevalidationTests.mjs`; do not point them at hand-built or persistent output when claiming a test result.
