# GarupaEditor Simulator

`src/simulator`已完成普通单人渲染端到端总复审，并在该引擎基础上接入GarupaEditor产品计分合同CS-V1。判定、Combo状态、Life、HUD资源/布局/动画继续消费Reverse证据；10M归一化Score、固定Rank和内部ruleset由[`scoring-contract.md`](./scoring-contract.md)授权，不宣称是原作计分复原。

## 当前全局门

当前实现采用“Reverse行为证据 + 明确的产品合同 + 可执行回归测试”三层边界。Garupa JSON产品schema和旧实现线索锁定`origin/main@a4ed4bba`，产品扩展行为由[`garupa-extension-contract.md`](./garupa-extension-contract.md)授权；原作position合同锁定已推送Reverse `941b17b9`，CS-V1由[`scoring-contract.md`](./scoring-contract.md)授权。发布过程、耗时和逐文件声明只保留在本地忽略目录，不作为生产或测试输入。

总重验aggregate gate已在R12有界关闭。完整启动音频调用图最初基于Reverse `b17e64e98423bed3718ac2e76a43cde5c451ee1f`重新遍历，并由Reverse `c8562fe478a9719cc582256f0edcdc988bb208e5`纠正为四模式普通账号教程gate未命中路线的完整合同：普通Live/Practice在封面信息演出后无需第二次点击；首次Live四页教程是账号状态独立分支且production未授权。谱面MV Live另基于Reverse `38802391fc6169e405c316e9a998f28c283961e3`的83个current ARM64 slices、7条observation-only R1、signed-delay inventory、portable media profile及zero-count closure关闭；仅支持Live Manual/Auto的host-supplied MP4/WebM，Practice、独立MVView和Star3D分列排除。以上关闭均不升级Unity framebuffer、fixed-device exact、CRI/USM、HAB original、其他excluded玩法或Stage 9。

原作Live设置另以Reverse `aae7e4fe`和Primary MoveNext纠正`50bc40b6`关闭：Public破坏性升级为Schema 12，恢复Primary/Secondary判定调整、SyncLine、NoteColor、VisibleTapLaneEffect与MvDarkness。逐字段行为、资源、产品投影和排除项见[`original-live-settings-contract.md`](./original-live-settings-contract.md)。

主程序统一资源迁移与Stage 9基于Reverse `f461b287`实施：production不再有Shared Store、`simulator-static`或固定网络资源SHA资格门；桌面独立窗口和移动route均经Schema 12、application Snapshot/Lease、Pixi/WebAudio/browser input/surface composition调用唯一Public入口。应用内部transport Schema 2仅把六个已验证Float32编码为大端bits字符串以避开Tauri event JSON数值扰动，播放器按位还原后才构建不变的Public Schema 12；不执行round/clamp或增加Public字段。Windows/Vite、desktop bundle、Android release/debug build及Android主Activity启动已通过；锁屏PIN阻断了当前设备上的Simulator route点击/触摸/扬声器验收，因此capability仍诚实保持`authorized-in-progress`。

| 门 | 状态 | 当前边界 |
| --- | --- | --- |
| Public/autonomous、chart、runtime | `closed-portable` | 当前10.1.4证据、raw production-path与detached DAG限定范围；四模式合同见独立开放行 |
| Ordinary Note/HUD Pixi scene | `closed-portable` | Reverse `OSR-E0001..E13323`、121条actual Pixi world records、parent/Y/mask/fallback反例、全部Note/HUD生命周期及完整production WebView2 combined scene限定范围 |
| Ordinary particle visible composition | `closed-portable` | 17-root actual Pixi world/UV/blend/viewport、stage-order/UV-row反例、production particle decoder、跨stage ordering及dispose归零限定范围 |
| Gameplay/Startup Audio、Particle semantic simulation | `closed-portable` | Public BGM字节派生、已登记判定/Note SE、四模式startup callgraph、Live-only Gaya owned loop、原作nullable voice分支但production内部固定无voice资源、prepared BGM、semantic/PCM/WebAudio graph及deterministic particle command/simulation限定范围；不含物理speaker输出/framebuffer |
| HAB current-external-complete | `closed-portable` | 11项pinned资源、179 rows、全Note/mesh/line/field/mask/lane-change及Pixi consumer；差异仅文档披露 |
| HAB original parity | `open-evidence-required` | UnityFS、natural owner/setter、Root_effect原clip及original physical frame不作等价声明 |
| Live/Rehearsal × Manual/Auto | `closed-portable` | Reverse `6c0dfb76`四模式identity与Life-zero矩阵；Rehearsal Auto保持Practice+Demo而非Auto Live，CS-V1仍为产品计分合同 |
| Complete ordinary startup direction/audio | `closed-portable` | Reverse `c8562fe4`纠正后的SD01–SD17、四模式ordinary gate-not-taken调用图及`d408d758`的SDN01–SDN04：封面信息owner无输入等待，四模式只需一次session-start即可自动4→5；首次Live B1–B4教程独立保持未授权。standard Live启动Gaya，Practice不创建；Public不携带账号/教程/SD/voice字段，production内部固定非null空角色集合与缺SoundResource路径；BGM prepared-paused、Retry/MoveTime及cleanup均已验收 |
| Original Live settings | `closed-portable` | Reverse `aae7e4fe`/`50bc40b6`：Schema 12 Primary A、Secondary B、SyncLine、NoteColor、VisibleTapLaneEffect、MvDarkness均有冻结identity、engine/render/movie consumer、Retry/MoveTime/Pause lifecycle、4 PNG/13-slot owner、Actual Pixi和3-fresh WebView2；完整边界见[`original-live-settings-contract.md`](./original-live-settings-contract.md) |
| Gameplay MV Live | `closed-portable` | Reverse `38802391`+OLS-R06：仅Live Manual/Auto；signed Int32 delay三分支、MovieBeforeSound(17)、movie states0–4、Gaya=false、MvDarkness黑色cover（Movie alpha恒1）、pause/resume、early/late finish、exit/fault/dispose；caller提供严格MP4/WebM字节，视频muted/non-loop并center-contain。Rehearsal MV、独立MVView、Star3D及CRI/USM/device exact不在正向范围 |
| Public Life profile | `closed-portable` | Reverse `2cbea93d`：Public只携带显式`isFullLength`；simulator内部固定Life `1000/1000/2000`，non-full/full Miss/Bad分别为`-100/-50`与`-50/-25`；不从duration等字段推断 |
| Garupa JSON direct chart adapter | `closed-portable` | Public精确接收已解析`chart`对象数组，不接受格式中不存在的laneCount；任意有限lane按七轨参考坐标连续投影，场地始终仅有0..6七条轨道线；按`GJP-D01`执行`floor(48*beat)`并直接建立冻结/登记的original-compatible或product-extension图；不生成中间BMS，不接受caller构造结果 |
| Initial adaptive landscape layout | `closed-portable` | Reverse `9167dce7`：任意有效初始横屏viewport、显式base safe-area、StarUI continuous high-aspect、orthographic camera、gameplay/particle scale、NGUI FitWidth、MoveTime prefab circle hit及MV widget比例规则；不以截图或1600×720 frame为布局authority |
| Dynamic surface resize | `open-evidence-required` | 10.1.4不存在完整局中刷新路由：arbitrary setScreenSize不重跑ButtonManager/particle，RefreshSafeArea不含VerticalFit；任何post-initial revision在command/input前失败关闭 |
| Rehearsal MoveTime/control scene | `closed-portable` | simulator-owned固定±5 opaque command、Float32 whole-engine恢复、后退timeline revision、目标BGM发布；控件由current serialized Left/Right anchor、±72 child、104×104 widget与world-circle radius 0.12共同派生，不再消费截图bbox或人工100×100 hit region |
| Original in-game Pause UI | `closed-portable` | Reverse `99d40bcc`以19条accepted R1关闭四模式open/Resume/Retry/Abort/cancel/confirm/Android Back/natural lifecycle，`770af437`补全level3 Pause、三种modal、InGameCountDownAnimation、RhythmGameUI/UICommon/sgm/Countdown1–3及六组参数化布局。Simulator-owned hit router、opaque command、3秒countdown、四模式fresh Retry、actual Pixi和3-fresh WebView2均通过；Desktop X仍是平台关闭，fixed/GPU/CRI/speaker exact不声明 |
| Non-zero initial seek | `excluded` | IPS-P01–P05只保留历史产品扩展记录；本专项冻结删除`startMilliseconds`及deferred publication，不再作为最终能力 |
| Garupa SV / TimingGroup | `closed-product-extension` | 独立group axis、Global继承、同position优先级、负向/停止/极值、stateless visibility及Pause/Retry/MoveTime闭合；只声明产品行为，不升级原作等价 |
| Continuous / outside lane | `closed-product-extension` | Garupa任意有限lane在固定七轨参考坐标上执行fractional/outside Float32 affine scene、front/mesh/particle及raw Manual span；场地线恒为0..6七条，不round/clamp到原Button |
| ExGarupa Slide graph / Manual | `closed-product-extension` | singleton、Hidden head/tail、all-Hidden、same-position、任意schema合法visible类型、Auto和chain-finger Manual均按authored graph闭合 |
| Button 07 | `closed-original-unreachable` | 10.1.4合法BMS不可生成值7；该结论只限定original-compatible图。产品任意continuous/outside lane由sidecar拥有，不伪造成Button 07 |
| WebView2 decode/glyph/raster | `closed-portable` | 真实WebView2 151.0.4129.93（与锁定`.78`同属151.0.4129 patch line，仅作当前portable观察）执行production `BrowserPixiTextureDecoder`的PNG/FontFace/glyph/Pixi WebGL raster；跨runtime/GPU exact不泛化 |
| Fixed-device physical exact | `open-objective-environment-blocked` | Reverse取证时锁定panel只有60 Hz且candidate/Stage 9尚不存在；当前产品包接入不提供校准光学/声学比较路径，四项客观exact阻断仍不升级 |
| Original Skin settings / switching | `closed-static-portable` | Reverse资源基线`977f5e71`与Field/Stage可达性纠正`4312a8ad`：完整profile 133 packs中3个stageskin仅属未开放Live2D，当前Standard/MV manifest精确为130 packs/576 files；default不再绕过8-pack原子装配。Schema 12 aggregate resolver、Note/Directional/Judge/Field/可达Background、SE、动态ParticleSystem、Retry/MoveTime identity、default+Limited production composition、actual Pixi/WebAudio及各3-fresh WebView2 raster均关闭；MV路线由双静态门保证selected Skin assembly先于Movie backend construction/prepare并完整回滚两级failure owners；Collabo 36包级失败。非默认device/frame parity仍不声明 |
| Character/card/deck skill、Fever、multiplayer | `excluded` | public和production依赖图不得引入 |
| Main-program integration | `authorized-in-progress` | 统一资源迁移与桌面/移动Stage 9已由独立任务书授权；在B–L验收关闭前不得声明产品接入完成 |

状态词：`closed-portable`只表示当前证据和raw验收明确覆盖的portable合同；`closed-static-portable`表示原作选择/生命周期由静态链关闭且portable资源/backend验收完成，但不伪称非默认特殊包实机帧；`closed-product-extension`表示GarupaEditor产品合同和产品验收已闭合，但不声明原作等价；`closed-original-unreachable`表示原作合法输入不可达而非待补功能；`open-objective-environment-blocked`保持exact不声明且记录可复现环境阻断；`degraded-explicit`不等于原作parity，其余开放和排除状态按表中边界解释。

## Public合同

唯一业务入口仍是：

```ts
import { launchSimulatorModule } from "src/simulator";
```

Public合同覆盖四种`sessionMode × inputMode` request；完整startup production gate已由zero-count closure关闭并移除。平台未安装时仍失败为`simulator.entry.platform-not-installed`。Schema 12 launch request精确为`{ chartData, presentation, config }`；`viewport/safeArea/revision`只由platform capability提供，Public不接受caller `highAspectRatio`；`chartData`精确包含已解析Garupa JSON `chart`、逐谱BGM字节与显式`isFullLength`，拒绝格式中不存在的laneCount。根级`presentation`只携带本地化文字、difficulty、jacket、只含`backdropPng`的standard stage，以及必填nullable `mv`；SD角色与开场语音没有Public字段，production内部直接建立冻结空角色集合与缺SoundResource路径。`mv:null`选择standard；non-null精确为`{bytes,musicStartDelayMilliseconds}`并选择Live MV，不新增config开关。MP4/WebM container、MIME、duration、dimensions、SHA和logical ID内部派生；standard stage仍严格校验但MV路线不decode/附着且绝不作故障fallback。全部字节深复制，坏shape/glyph/CRC/MP3/video/decode在engine/mount前失败关闭。simulator在资源/backend装配前验证MP3结构、解码并内部派生SHA-256、cue、sample rate、channels、sample frames及duration；Retry/MoveTime复用同一recipe的冻结profile与浏览器解码缓存。`isFullLength`仍不得从音频时长推断。不接受caller-authored Life、member/card/deck、角色效果、Fever或多人数据，也不暴露engine、step、backend、provider、scene、replay factory或dispose。Score master、level、totalParameter、Auto coefficient、ruleset、评分单位数和quota均由exact-shape边界拒绝。`config.skin`精确冻结原作持久Note/Field/TapEffect/JudgeSE/Directional设置、一个None/Collabo/Limited聚合身份及七个组件状态；拒绝独立Judge、bundle、URL、SHA、server和ripName。Config另必填A/B、SyncLine、NoteColor、VisibleTapLaneEffect与MvDarkness，不接受`judgeOffsetFrames`/`offsetMs`/`effectEnable`/`mvAlphaPercent`；见[`original-live-settings-contract.md`](./original-live-settings-contract.md)。Schema 12 Skin边界、aggregate resolver、无URL resource selector及render/audio consumers见[`skin-settings-contract.md`](./skin-settings-contract.md)。特殊粒子动态模块图从whole-pack profile建立两bundle runtime pack；autoRandomSeed改用canonical system identity派生的deterministic portable stream，不声明原设备随机流或frame parity。模拟器从chart-owned判定图内部生成评分计划，并从内部证据化profile建立Life。

**Skill音符不等于角色技能效果。** `GameNoteAdditionalType.Skill`只能在重新核验后表示chart-owned外观、命中SE和判定粒子，不得查询member/card或触发角色加分、Heal、Guard、NeverDie或判定强化。

## 架构与资源边界

```text
src/simulator/
├─ public/      # chart/full-length/config/launch/close合同与全局隔离
├─ runtime/     # scheduler/input/session生命周期
├─ assembly/    # frozen recipe、logical requirements与application-lease原子resource assembly
├─ platform/    # 中立production capability composition
├─ scene/       # scene owner
├─ host/        # engine host与whole-engine replay
├─ engine/      # chart、state、judgement、Note及command producers
├─ backends/    # Recording/Pixi/WebAudio/particle/resource adapters
├─ resources/   # source-blind leased package view/decoder；无生产Store、selector或下载能力
└─ testing/     # 隔离测试与manifested fixture
```

`engine/`不依赖React、Pixi、Tauri、DOM、编辑器谱面类型或窗口协议。Simulator整体不导入主程序`src/resources`；`platform/resourceContracts.ts`只接收logical requirement和source-blind lease，具体ResourceRef/Snapshot/provider由`src/app/simulator`适配。Production不得读取testing fixture、Reverse工作树或本地忽略目录，不得隐式联网、选择默认资源、自动fallback、使用ambient random/wall clock或吞掉故障。缺少master、资源身份、logical ID/exact key、typed state或证据时必须在最早可知点失败关闭；SHA只留在主程序完整性与测试oracle，不进入动态资源资格判断。

## Rendering验收分层

- `actual-pixi-command-scene-routing`：testing-only observer独立连乘实际Pixi父链并观察local/world matrix、bounds、mask、texture、geometry及combined stage order；parent、Unity Y、mask-space、stage-order、particle UV-row和fallback六类故意反例均会失败。
- `webview2-decode-raster/audio-graph`：以下1600×720 digest只保留为锁定browser的回归观察，不是布局authority。普通完整场景digest为`53fff434…39a4`；原作Live设置四PNG/13-slot专项digest为`de2b524c…86ae7`；Skin default/limited3实际Field/Judge raster分别为`e4718031…66c2`/`5b0c4791…1311`；Garupa产品扩展固定七轨场地的initial/negative/zero/restore三fresh WebGL digest为`a9fcc1b1…eb0f`；standard启动在serialized hierarchy迁移后视觉digest为`dfaeb868…8f8f`，并新增4:3/32:9 actual WebView2 captures，音频digest更新为`7d537afa…6adc`，并明确要求无user activation时初始AudioContext即为running且测试侧不调用resume。MV独立harness对MP4/H264和WebM/VP9各执行3 fresh process，含MvDarkness dark-cover的media graph digest为`34c34580…3db9`、serialized widget raster digest为`538d21c3…e7dd`，cleanup后Blob/video/Pixi资源归零。所有digest只限定当前portable环境，不泛化CRI/USM、Android、speaker或Unity/GPU exact。
- `framebuffer/device-exact`：锁定设备调查已形成四项客观环境阻断，exact继续不声明。

Synthetic decoder、资源hash或typed command仍不能单独升级为真实WebView2 raster证明。

Score HUD继续保留Reverse确认的NineSlice轴序、depth、UIPanel clip、Bitmap数字、marker几何和SS持久owner；业务输入改为内部CS-V1 `ruleSetId + totalScoringUnitCount`。Gauge固定C/B/A/S/SS阈值并以`10,000,000+N`为最大值，typed validator独立复算Rank、ratio、marker和SS条件。该产品Score语义不升级原作计分等价、browser/GPU framebuffer或fixed-device exact。

## Evidence workflow

流程见[`evidence-workflow.md`](./evidence-workflow.md)。只消费已verify、commit、push的Reverse证据。10.1.3或其他来源必须先建立逐claim等价证明、适用域和反例检查。旧调查包可提供待重新核验的原始事实，但其`closed`、`productionAuthorization`或总体closure字段不是本轮授权。

Reverse Skin可达性纠正`4312a8ad5a755b28cb40366f6160771dbf79637e`确认既有`InGameManager.initialize -> preflightFieldSetup` consumer，并证明`stageskin/{key}`只经Live2D background owner可达；当前Standard/MV recipe删除该resolver-only身份而不绘制placeholder。Reverse多比例布局提交`9167dce77d0472a000b509f993b0e66e44e4797f`关闭任意初始横屏surface、StarUI/safe-area、GameCamera、gameplay/particle、UIRoot/MoveTime及MV widget参数化合同，并证据化拒绝局中revision。Reverse启动空资源修订提交`d408d758f39873c2c997107903300e58d56c59c6`证明非null空SD集合与缺语音SoundResource路径；Schema 12继续将这两个恒定事实完全收回simulator内部，不再要求caller提交无信息null字段。Reverse `c8562fe478a9719cc582256f0edcdc988bb208e5`另纠正启动方向和音频授权范围：普通四模式accepted route只记录一次session-start并自动进入4→5；首次Live教程谓词、B1–B4和callback身份已静态分类，但视觉资源和incomplete-account动态闭环未授权，不能映射为平台音频门。Reverse普通渲染静态/HUD提交`6908ddfa`和最终账本`b5fb3dca`继续约束未改变的原作表现；其Garupa target `2b758eb...`仅作为历史基线。CS-V1变更由tracked产品规范、独立公式测试、full-chart Auto和当前WebView2观察约束。HAB original、fixed-device exact、standalone MVView/Star3D/其他excluded和Stage 9边界不因产品Score或gameplay MV portable升级。

日常开发默认运行`npm.cmd run simulator:test`（或`simulator:test:quick`）：测试树只编译一次，以15个development groups覆盖既有compiled/static集合并新增Skin semantic/static leaf；不执行耗时full-chart actual-Pixi/particle/HAB或WebView2，因此不能作为release证据。发布级入口仍为`npm.cmd run simulator:test:total-revalidation`；当前40-semantic-leaf DAG包含startup-audio、MV、Skin contract、3-fresh ordinary/startup/Skin WebView2及MP4/WebM各3-fresh MV browser门。重复运行复用ignored Cargo target，`simulator:test:total-revalidation:clean`可强制冷编译。完整说明见[`testing/README.md`](./testing/README.md)。两级均不运行Vite/Tauri，也不声称原作framebuffer或物理输出等价。

`mainProgramIntegrationAuthorization=true`；当前完成状态仍为`in-progress`，权威任务书为`tmp/simulator-unified-resource-stage9-task.md`。
