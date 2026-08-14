# GarupaEditor Simulator

`src/simulator`正在执行**普通单人渲染端到端总复审**。旧任务书、旧acceptance、旧closure字段、Recording backend、源码标记、旧逐claim账本和旧绿色DAG均不证明本轮production表现；2026-08-14之前的最终attestation只保留为历史指针。

## 当前全局门

总重验全局隔离已重新打开。唯一public入口`launchSimulatorModule(...)`在已安装launcher、chart解析、静态资源选择、backend prepare、scheduler启动、mount和任何scene/domain owner mutation之前返回`evidence-required / simulator.audit.total-revalidation-open`。

`CAP-RENDER-ORDINARY-01`及普通粒子可见合成子门当前均为`reopened-audit`。Generic WebView2 decoder、粒子语义模拟、non-zero seek、Button 07 original-unreachable和HAB current-external-complete的历史独立结论不替完整普通场景world-space与浏览器合成背书；fixed-device exact继续客观环境阻断且不作正向声明。

机器账本：

- [`audit/current-capability-matrix.json`](./audit/current-capability-matrix.json)
- [`audit/current-claim-ledger.json`](./audit/current-claim-ledger.json)
- [`audit/current-production-integrity-review.json`](./audit/current-production-integrity-review.json)
- [`audit/current-final-capability-attestation.json`](./audit/current-final-capability-attestation.json)

| 门 | 状态 | 当前边界 |
| --- | --- | --- |
| Public/autonomous、chart、runtime | `closed-portable` | 当前10.1.4证据、raw production-path与detached DAG限定范围；non-zero practice seek见独立行 |
| Ordinary Note/HUD Pixi scene | `reopened-audit` | 重建独立10.1.4父链、world-space、mask/order和完整WebView2组合观察；旧656-batch/Score结果不作本轮正向依据 |
| Ordinary particle visible composition | `reopened-audit` | 语义模拟历史子门不替actual Pixi、跨stage ordering、browser decode和dispose背书 |
| Audio、Particle semantic simulation | `closed-portable` | semantic/PCM/WebAudio graph及deterministic particle command/simulation限定范围；不含当前可见合成、物理输出/framebuffer |
| HAB current-external-complete | `closed-portable` | 11项pinned资源、179 rows、全Note/mesh/line/field/mask/lane-change及Pixi consumer；差异仅文档披露 |
| HAB original parity | `open-evidence-required` | UnityFS、natural owner/setter、Root_effect原clip及original physical frame不作等价声明 |
| Non-zero initial seek | `closed-portable` | 10.1.4 IPS-P01–P05：fresh zero-state bounded Float32 whole-engine pre-roll，重建期物理输出抑制，完成后一次BGM/final visual publication |
| Button 07 | `closed-original-unreachable` | 10.1.4合法BMS不可生成值7，scene只拥有0..6；不发明第八lane，注入值7按内部不变量拒绝 |
| WebView2 decode/glyph/raster | `closed-portable` | 真实WebView2 151.0.4129.78执行production `BrowserPixiTextureDecoder`的PNG/FontFace/glyph/Pixi WebGL raster；跨runtime/GPU exact不泛化 |
| Fixed-device physical exact | `open-objective-environment-blocked` | 锁定panel只有60 Hz、Android candidate缺失且stage-9=false、无校准光学/声学比较路径；四项客观阻断，不新增exact claim |
| Character/card/deck skill、Fever、multiplayer | `excluded` | public和production依赖图不得引入 |
| Main-program integration | `unauthorized-stage-9` | 不修改App/window/editor/Tauri/mobile入口 |

状态词：`closed-portable`只表示当前证据和raw验收明确覆盖的portable合同；`closed-original-unreachable`表示原作合法输入不可达而非待补功能；`open-objective-environment-blocked`保持exact不声明且记录可复现环境阻断；`reopened-audit`表示当前失败关闭且不是正向能力；`degraded-explicit`不等于原作parity；`open-device-exact`保留为旧审计状态词，其余开放和排除状态按表中边界解释。

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

- `actual-pixi-command-scene-routing`：历史raw observation只作待复核输入；普通Note/HUD与粒子可见合成均为`reopened-audit`，必须补齐父链/world-space和完整production WebView2 combined-scene观察后才能重新关闭。
- `webview2-decode-raster`：真实production `BrowserPixiTextureDecoder`在WebView2 151.0.4129.78执行`createImageBitmap`、`FontFace` glyph及Pixi WebGL raster，指标与Reverse合同一致；跨browser/GPU digest不泛化。
- `framebuffer/device-exact`：锁定设备调查已形成四项客观环境阻断，exact继续不声明。

Synthetic decoder、资源hash或typed command仍不能单独升级为真实WebView2 raster证明。

当前Score HUD候选实现已修正NineSlice轴序、已知depth、master派生marker校验和SS持久owner。Reverse `score-hud-panel-clip-portable-10-1-4@1abae506`又从当前10.1.4 APK直接确认Score UIPanel path 1451、Background_Cover anchor target、四anchor、SoftClip range/softness/offset及父级坐标，并排除AllPerfect path 1450身份混淆。`indicatorLocalX`现驱动挂在ScoreGaugeSS animation layer上的持久Pixi mask consumer；20行阈值±1/scoreMax/over-max raw矩阵由独立verifier重算。Score panel子门已随普通command/scene portable范围闭合；真实WebView2 decode/glyph/raster由另一独立门关闭，该Score结论本身不升级browser、GPU framebuffer或fixed-device exact。

## Evidence workflow

流程见[`evidence-workflow.md`](./evidence-workflow.md)。只消费已verify、commit、push的Reverse证据。10.1.3或其他来源必须先建立逐claim等价证明、适用域和反例检查。旧调查包可提供待重新核验的原始事实，但其`closed`、`productionAuthorization`或总体closure字段不是本轮授权。

历史实现提交`9ab1ff7a339fa3cfd395c5f6fe841e1f3f1585a9`及Reverse账本`36a6941f`已push，但本轮不继承其普通渲染正向结论。新的10.1.4独立证据、production消费、完整普通场景WebView2观察、pushed-detached DAG和最终逐claim账本完成前，全局门保持open。HAB original、fixed-device exact、excluded和stage-9边界不因本轮复审升级。

最终去重入口为`npm.cmd run simulator:test:total-revalidation`。它按唯一leaf DAG执行isolated tsc、chart/clock/input/state、render raw+independent verifier、audio、particle、host/runtime/public、C07证据消费及真实production WebView2 decoder；不运行Vite/Tauri，也不声称原作framebuffer或物理输出等价。

`mainProgramIntegrationAuthorization=false`。
