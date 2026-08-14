# GarupaEditor Simulator

`src/simulator`已形成**证据限定的最终能力attestation**。旧任务书、旧acceptance、旧closure字段、Recording backend或源码标记仍不证明production能力；正向范围只包含逐claim Reverse证据、当前raw observation及独立detached DAG共同闭合的portable功能门。

## 当前全局门

总重验全局隔离已条件解除。唯一public入口`launchSimulatorModule(...)`委托给已安装的内部自治launcher；未安装platform时返回`platform-unavailable / simulator.entry.platform-not-installed`。它不自动安装主程序入口，也不绕过每个仍开放能力的最早失败边界。

`runtime/moduleEntryBinding.ts`与production platform engine builder保留同一门函数作为防绕过结构；当前门值为关闭。Non-zero seek和真实browser raster已按各自证据闭合；Button 07已证明原作合法输入不可达并按内部不变量拒绝注入。HABAHIRO按`current-external-complete`功能路线运行，不因original parity缺口失败关闭；fixed-device exact保持客观环境阻断且不作正向声明。

机器账本：

- [`audit/current-capability-matrix.json`](./audit/current-capability-matrix.json)
- [`audit/current-claim-ledger.json`](./audit/current-claim-ledger.json)
- [`audit/current-production-integrity-review.json`](./audit/current-production-integrity-review.json)
- [`audit/current-final-capability-attestation.json`](./audit/current-final-capability-attestation.json)

| 门 | 状态 | 当前边界 |
| --- | --- | --- |
| Public/autonomous、chart、runtime | `closed-portable` | 当前10.1.4证据、raw production-path与detached DAG限定范围；non-zero practice seek见独立行 |
| Ordinary Pixi command/scene | `closed-portable` | 含656-batch actual-Pixi routing及20行Score panel mask raw；真实browser门见独立行，不含device framebuffer exact |
| Audio、Particle | `closed-portable` | semantic/PCM/WebAudio graph及deterministic simulation/Pixi routing；不含物理输出/framebuffer |
| HAB current-external-complete | `closed-portable` | 11项pinned资源、179 rows、全Note/mesh/line/field/mask/lane-change及Pixi consumer；差异仅文档披露 |
| HAB original parity | `open-evidence-required` | UnityFS、natural owner/setter、Root_effect原clip及original physical frame不作等价声明 |
| Non-zero initial seek | `closed-portable` | 10.1.4 IPS-P01–P05：fresh zero-state bounded Float32 whole-engine pre-roll，重建期物理输出抑制，完成后一次BGM/final visual publication |
| Button 07 | `closed-original-unreachable` | 10.1.4合法BMS不可生成值7，scene只拥有0..6；不发明第八lane，注入值7按内部不变量拒绝 |
| WebView2 decode/glyph/raster | `closed-portable` | 真实WebView2 151.0.4129.78执行production `BrowserPixiTextureDecoder`的PNG/FontFace/glyph/Pixi WebGL raster；跨runtime/GPU exact不泛化 |
| Fixed-device physical exact | `open-objective-environment-blocked` | 锁定panel只有60 Hz、Android candidate缺失且stage-9=false、无校准光学/声学比较路径；四项客观阻断，不新增exact claim |
| Character/card/deck skill、Fever、multiplayer | `excluded` | public和production依赖图不得引入 |
| Main-program integration | `unauthorized-stage-9` | 不修改App/window/editor/Tauri/mobile入口 |

状态词：`closed-portable`只表示当前证据和raw验收明确覆盖的portable合同；`closed-original-unreachable`表示原作合法输入不可达而非待补功能；`open-objective-environment-blocked`保持exact不声明且记录可复现环境阻断；`reopened-audit`保留为历史隔离状态词，不是当前正向能力；`degraded-explicit`不等于原作parity；`open-device-exact`保留为旧审计状态词，其余开放和排除状态按表中边界解释。

## Public合同

唯一业务入口仍是：

```ts
import { launchSimulatorModule } from "src/simulator";
```

安装中立platform后，证据覆盖的普通或合法non-zero practice-seek request可获得仅含`closed` Promise的成功receipt；未安装时失败为`simulator.entry.platform-not-installed`。合同不接受member/card/deck、角色效果、Fever或多人数据，也不暴露engine、step、backend、provider、scene、replay factory或dispose。

**Skill音符不等于角色技能效果。** `GameNoteAdditionalType.Skill`只能在重新核验后表示chart-owned外观、命中SE和判定粒子，不得查询member/card或触发角色加分、Heal、Guard、NeverDie或判定强化。

## 架构与资源边界

```text
src/simulator/
├─ public/      # chart/gameplay/config/launch/close合同与全局隔离
├─ runtime/     # scheduler/input/session生命周期
├─ assembly/    # frozen recipe与原子resource assembly
├─ platform/    # 中立production capability composition
├─ scene/       # scene owner
├─ host/        # engine host与whole-engine replay
├─ engine/      # chart、state、judgement、Note及command producers
├─ backends/    # Recording/Pixi/WebAudio/particle/resource adapters
├─ resources/   # immutable shared store与selector
├─ audit/       # committed capability/claim/integrity ledgers
└─ testing/     # 隔离测试与manifested fixture
```

`engine/`不依赖React、Pixi、Tauri、DOM、编辑器谱面类型或窗口协议。Production不得读取testing fixture、Reverse工作树或本地忽略目录，不得隐式联网、选择默认资源、自动fallback、使用ambient random/wall clock或吞掉故障。缺少master、资源身份、长度/SHA、logical ID/exact key、typed state或证据时必须在最早可知点失败关闭。

## Rendering验收分层

- `actual-pixi-command-scene-routing`：当前production raw observation已由独立verifier核验，普通单人portable子门为`closed-portable`；真实WebView2 browser decode/raster由独立production harness关闭，但两者都不声明device framebuffer exact。
- `webview2-decode-raster`：真实production `BrowserPixiTextureDecoder`在WebView2 151.0.4129.78执行`createImageBitmap`、`FontFace` glyph及Pixi WebGL raster，指标与Reverse合同一致；跨browser/GPU digest不泛化。
- `framebuffer/device-exact`：锁定设备调查已形成四项客观环境阻断，exact继续不声明。

Synthetic decoder、资源hash或typed command仍不能单独升级为真实WebView2 raster证明。

当前Score HUD候选实现已修正NineSlice轴序、已知depth、master派生marker校验和SS持久owner。Reverse `score-hud-panel-clip-portable-10-1-4@1abae506`又从当前10.1.4 APK直接确认Score UIPanel path 1451、Background_Cover anchor target、四anchor、SoftClip range/softness/offset及父级坐标，并排除AllPerfect path 1450身份混淆。`indicatorLocalX`现驱动挂在ScoreGaugeSS animation layer上的持久Pixi mask consumer；20行阈值±1/scoreMax/over-max raw矩阵由独立verifier重算。Score panel子门已随普通command/scene portable范围闭合；真实WebView2 decode/glyph/raster由另一独立门关闭，该Score结论本身不升级browser、GPU framebuffer或fixed-device exact。

## Evidence workflow

流程见[`evidence-workflow.md`](./evidence-workflow.md)。只消费已verify、commit、push的Reverse证据。10.1.3或其他来源必须先建立逐claim等价证明、适用域和反例检查。旧调查包可提供待重新核验的原始事实，但其`closed`、`productionAuthorization`或总体closure字段不是本轮授权。

当前实现提交`9ab1ff7a339fa3cfd395c5f6fe841e1f3f1585a9`及Reverse最终账本`36a6941f`已push。Score HUD表现反审已纠正TotalScore Y转换和高Rank Panel遗漏的`Progress [25,45]`父变换；pushed-detached通过25-leaf完整去重DAG并实际执行完整Score HUD WebView2合成。该attestation只授权机器账本中的portable范围，不放行HAB original、fixed-device exact、excluded或stage-9边界。

最终去重入口为`npm.cmd run simulator:test:total-revalidation`。它按唯一leaf DAG执行isolated tsc、chart/clock/input/state、render raw+independent verifier、audio、particle、host/runtime/public、C07证据消费及真实production WebView2 decoder；不运行Vite/Tauri，也不声称原作framebuffer或物理输出等价。

`mainProgramIntegrationAuthorization=false`。
