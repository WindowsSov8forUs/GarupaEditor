# GarupaEditor Simulator

`src/simulator`已完成普通单人渲染端到端总复审，并在该引擎基础上接入GarupaEditor产品计分合同CS-V1。判定、Combo状态、Life、HUD资源/布局/动画继续消费Reverse证据；10M归一化Score、固定Rank和内部ruleset由[`scoring-contract.md`](./scoring-contract.md)授权，不宣称是原作计分复原。

## 当前全局门

当前实现采用“Reverse行为证据 + 明确的产品合同 + 可执行回归测试”三层边界。Garupa JSON产品schema和旧实现线索锁定`origin/main@a4ed4bba`，产品扩展行为由[`garupa-extension-contract.md`](./garupa-extension-contract.md)授权；原作position合同锁定已推送Reverse `941b17b9`，CS-V1由[`scoring-contract.md`](./scoring-contract.md)授权。发布过程、耗时和逐文件声明只保留在本地忽略目录，不作为生产或测试输入。

总重验aggregate gate已在R12有界关闭。完整启动音频调用图已基于Reverse `b17e64e98423bed3718ac2e76a43cde5c451ee1f`重新遍历并关闭。谱面MV Live另基于Reverse `38802391fc6169e405c316e9a998f28c283961e3`的83个current ARM64 slices、7条observation-only R1、signed-delay inventory、portable media profile及zero-count closure关闭；仅支持Live Manual/Auto的host-supplied MP4/WebM，Practice、独立MVView和Star3D分列排除。以上关闭均不升级Unity framebuffer、fixed-device exact、CRI/USM、HAB original、其他excluded玩法或Stage 9。

| 门 | 状态 | 当前边界 |
| --- | --- | --- |
| Public/autonomous、chart、runtime | `closed-portable` | 当前10.1.4证据、raw production-path与detached DAG限定范围；四模式合同见独立开放行 |
| Ordinary Note/HUD Pixi scene | `closed-portable` | Reverse `OSR-E0001..E13323`、121条actual Pixi world records、parent/Y/mask/fallback反例、全部Note/HUD生命周期及完整production WebView2 combined scene限定范围 |
| Ordinary particle visible composition | `closed-portable` | 17-root actual Pixi world/UV/blend/viewport、stage-order/UV-row反例、production particle decoder、跨stage ordering及dispose归零限定范围 |
| Gameplay/Startup Audio、Particle semantic simulation | `closed-portable` | Public BGM字节派生、已登记判定/Note SE、四模式startup callgraph、Live-only Gaya owned loop、nullable voice、prepared BGM、semantic/PCM/WebAudio graph及deterministic particle command/simulation限定范围；不含物理speaker输出/framebuffer |
| HAB current-external-complete | `closed-portable` | 11项pinned资源、179 rows、全Note/mesh/line/field/mask/lane-change及Pixi consumer；差异仅文档披露 |
| HAB original parity | `open-evidence-required` | UnityFS、natural owner/setter、Root_effect原clip及original physical frame不作等价声明 |
| Live/Rehearsal × Manual/Auto | `closed-portable` | Reverse `6c0dfb76`四模式identity与Life-zero矩阵；Rehearsal Auto保持Practice+Demo而非Auto Live，CS-V1仍为产品计分合同 |
| Complete startup direction/audio | `closed-portable` | Reverse `78e6a70e`的SD01–SD16与`b17e64e9`完整调用图：standard Live启动Gaya，Practice不创建；BGM prepared-paused、optional voice release、Retry/MoveTime及cleanup均已验收 |
| Gameplay MV Live | `closed-portable` | Reverse `38802391`：仅Live Manual/Auto；signed Int32 delay三分支、MovieBeforeSound(17)、movie states0–4、Gaya=false、pause/resume、early/late finish、exit/fault/dispose；caller提供严格MP4/WebM字节，视频muted/non-loop并center-contain。Rehearsal MV、独立MVView、Star3D及CRI/USM/device exact不在正向范围 |
| Public Life profile | `closed-portable` | Reverse `2cbea93d`：Public只携带显式`isFullLength`；simulator内部固定Life `1000/1000/2000`，non-full/full Miss/Bad分别为`-100/-50`与`-50/-25`；不从duration等字段推断 |
| Garupa JSON direct chart adapter | `closed-portable` | Public精确接收已解析`chart`对象数组和显式`laneCount`，按`GJP-D01`执行`floor(48*beat)`并直接建立冻结/登记的original-compatible或product-extension图；不生成中间BMS，不接受caller构造结果 |
| Rehearsal MoveTime/control scene | `closed-portable` | simulator-owned固定±5 opaque command、Float32 whole-engine恢复、后退timeline revision、目标BGM发布及真实current atlas Pixi controls限定范围；不声明Prefab/fixed-device exact |
| Non-zero initial seek | `excluded` | IPS-P01–P05只保留历史产品扩展记录；本专项冻结删除`startMilliseconds`及deferred publication，不再作为最终能力 |
| Garupa SV / TimingGroup | `closed-product-extension` | 独立group axis、Global继承、同position优先级、负向/停止/极值、stateless visibility及Pause/Retry/MoveTime闭合；只声明产品行为，不升级原作等价 |
| Continuous lane / 9/11 / outside | `closed-product-extension` | 7/9/11显式domain、fractional/outside Float32 affine scene、field、front/mesh/particle及raw Manual span；不round/clamp到原Button |
| ExGarupa Slide graph / Manual | `closed-product-extension` | singleton、Hidden head/tail、all-Hidden、same-position、任意schema合法visible类型、Auto和chain-finger Manual均按authored graph闭合 |
| Button 07 | `closed-original-unreachable` | 10.1.4合法BMS不可生成值7；该结论只限定original-compatible图。产品9/11/outside由continuous sidecar拥有，不伪造成Button 07 |
| WebView2 decode/glyph/raster | `closed-portable` | 真实WebView2 151.0.4129.86（锁定`.78`同一151.0.4129 patch line）执行production `BrowserPixiTextureDecoder`的PNG/FontFace/glyph/Pixi WebGL raster；跨runtime/GPU exact不泛化 |
| Fixed-device physical exact | `open-objective-environment-blocked` | 锁定panel只有60 Hz、Android candidate缺失且stage-9=false、无校准光学/声学比较路径；四项客观阻断，不新增exact claim |
| Character/card/deck skill、Fever、multiplayer | `excluded` | public和production依赖图不得引入 |
| Main-program integration | `unauthorized-stage-9` | 不修改App/window/editor/Tauri/mobile入口 |

状态词：`closed-portable`只表示当前证据和raw验收明确覆盖的portable合同；`closed-product-extension`表示GarupaEditor产品合同和产品验收已闭合，但不声明原作等价；`closed-original-unreachable`表示原作合法输入不可达而非待补功能；`open-objective-environment-blocked`保持exact不声明且记录可复现环境阻断；`degraded-explicit`不等于原作parity，其余开放和排除状态按表中边界解释。

## Public合同

唯一业务入口仍是：

```ts
import { launchSimulatorModule } from "src/simulator";
```

Public合同覆盖四种`sessionMode × inputMode` request；完整startup production gate已由zero-count closure关闭并移除。平台未安装时仍失败为`simulator.entry.platform-not-installed`。Schema 6 launch request精确为`{ chartData, presentation, config }`；`chartData`精确包含已解析Garupa JSON `chart`、逐谱BGM字节、显式`isFullLength`与显式`laneCount: 7|9|11`。根级`presentation`携带本地化文字、difficulty、jacket、standard stage/5 SD、nullable Live voice，以及必填nullable `mv`。`mv:null`选择standard；non-null精确为`{bytes,musicStartDelayMilliseconds}`并选择Live MV，不新增config开关。MP4/WebM container、MIME、duration、dimensions、SHA和logical ID内部派生；standard stage仍严格校验但MV路线不decode/附着且绝不作故障fallback。全部字节深复制，坏shape/glyph/CRC/MP3/video/decode在engine/mount前失败关闭。simulator在资源/backend装配前验证MP3结构、解码并内部派生SHA-256、cue、sample rate、channels、sample frames及duration；Retry/MoveTime复用同一recipe的冻结profile与浏览器解码缓存。`isFullLength`仍不得从音频时长推断。不接受caller-authored Life、member/card/deck、角色效果、Fever或多人数据，也不暴露engine、step、backend、provider、scene、replay factory或dispose。Score master、level、totalParameter、Auto coefficient、ruleset、评分单位数和quota均由exact-shape边界拒绝。模拟器从chart-owned判定图内部生成评分计划，并从内部证据化profile建立Life。

**Skill音符不等于角色技能效果。** `GameNoteAdditionalType.Skill`只能在重新核验后表示chart-owned外观、命中SE和判定粒子，不得查询member/card或触发角色加分、Heal、Guard、NeverDie或判定强化。

## 架构与资源边界

```text
src/simulator/
├─ public/      # chart/full-length/config/launch/close合同与全局隔离
├─ runtime/     # scheduler/input/session生命周期
├─ assembly/    # frozen recipe与原子resource assembly
├─ platform/    # 中立production capability composition
├─ scene/       # scene owner
├─ host/        # engine host与whole-engine replay
├─ engine/      # chart、state、judgement、Note及command producers
├─ backends/    # Recording/Pixi/WebAudio/particle/resource adapters
├─ resources/   # immutable shared store与selector
└─ testing/     # 隔离测试与manifested fixture
```

`engine/`不依赖React、Pixi、Tauri、DOM、编辑器谱面类型或窗口协议。Production不得读取testing fixture、Reverse工作树或本地忽略目录，不得隐式联网、选择默认资源、自动fallback、使用ambient random/wall clock或吞掉故障。缺少master、资源身份、长度/SHA、logical ID/exact key、typed state或证据时必须在最早可知点失败关闭。

## Rendering验收分层

- `actual-pixi-command-scene-routing`：testing-only observer独立连乘实际Pixi父链并观察local/world matrix、bounds、mask、texture、geometry及combined stage order；parent、Unity Y、mask-space、stage-order、particle UV-row和fallback六类故意反例均会失败。
- `webview2-decode-raster/audio-graph`：普通完整场景digest为`a09166cf…2199`；Garupa产品扩展initial/negative/zero/restore三fresh WebGL digest为`c9a02a4c…c8df`；standard启动视觉/音频digest保持`0f33657e…14d`与`88a2a310…c268`。MV独立harness对MP4/H264和WebM/VP9各执行3 fresh process，media graph digest为`f786bb96…b0234`、deterministic-seek raster digest为`ad8f9c4b…b9094`，cleanup后Blob/video/Pixi资源归零。所有digest只限定当前portable环境，不泛化CRI/USM、Android、speaker或Unity/GPU exact。
- `framebuffer/device-exact`：锁定设备调查已形成四项客观环境阻断，exact继续不声明。

Synthetic decoder、资源hash或typed command仍不能单独升级为真实WebView2 raster证明。

Score HUD继续保留Reverse确认的NineSlice轴序、depth、UIPanel clip、Bitmap数字、marker几何和SS持久owner；业务输入改为内部CS-V1 `ruleSetId + totalScoringUnitCount`。Gauge固定C/B/A/S/SS阈值并以`10,000,000+N`为最大值，typed validator独立复算Rank、ratio、marker和SS条件。该产品Score语义不升级原作计分等价、browser/GPU framebuffer或fixed-device exact。

## Evidence workflow

流程见[`evidence-workflow.md`](./evidence-workflow.md)。只消费已verify、commit、push的Reverse证据。10.1.3或其他来源必须先建立逐claim等价证明、适用域和反例检查。旧调查包可提供待重新核验的原始事实，但其`closed`、`productionAuthorization`或总体closure字段不是本轮授权。

Reverse普通渲染静态/HUD提交`6908ddfa`和最终账本`b5fb3dca`继续约束未改变的原作表现；其Garupa target `2b758eb...`仅作为历史基线。CS-V1变更由tracked产品规范、独立公式测试、full-chart Auto和当前WebView2观察约束。HAB original、fixed-device exact、standalone MVView/Star3D/其他excluded和Stage 9边界不因产品Score或gameplay MV portable升级。

日常开发默认运行`npm.cmd run simulator:test`（或`simulator:test:quick`）：测试树只编译一次，以12个development groups覆盖既有compiled/static集合并新增MV semantic/static leaf；不执行耗时full-chart actual-Pixi/particle/HAB或WebView2，因此不能作为release证据。发布级入口仍为`npm.cmd run simulator:test:total-revalidation`；当前34-semantic-leaf DAG包含startup-audio callgraph、MV contract、3-fresh ordinary/startup WebView2及MP4/WebM各3-fresh MV browser门。重复运行复用ignored Cargo target，`simulator:test:total-revalidation:clean`可强制冷编译。完整说明见[`testing/README.md`](./testing/README.md)。两级均不运行Vite/Tauri，也不声称原作framebuffer或物理输出等价。

`mainProgramIntegrationAuthorization=false`。
