# GarupaEditor Simulator

`src/simulator`已完成普通单人渲染端到端candidate总复审，并进入R12有界portable release。旧任务书、旧acceptance、旧closure字段、Recording backend、源码标记和旧绿色DAG不构成本轮依据；当前正向边界只消费Reverse `6908ddfa`总复审叶事实、`3f9ef788`逐claim账本及pushed-detached candidate `5a25161`观察。

## 当前全局门

R11 schema-4账本冻结104个production文件、22,216个occurrences、14,722个field/formula claims、281个mutations及646个completion claims，所有unreviewed/unknown为0。Candidate 26叶detached DAG在2,067,351ms内通过；完整ordinary WebView2使用production双decoder、单一particle→Note/HUD combined root、656-batch全谱、3 fresh×17 captures，digest为`100f640350d9f49b41cc94a2df47284b42f8e46f182fce7c862a8b921e791538`。

总重验aggregate gate已在R12有界关闭；`CAP-RENDER-ORDINARY-01`与`CAP-RENDER-PARTICLE-COMPOSITION-01`恢复`closed-portable`。这不移除request/resource/backend/owner各自的失败关闭，不升级Unity framebuffer、fixed-device exact、HAB original、excluded玩法或Stage 9。

机器账本：

- [`audit/current-capability-matrix.json`](./audit/current-capability-matrix.json)
- [`audit/current-claim-ledger.json`](./audit/current-claim-ledger.json)
- [`audit/current-production-integrity-review.json`](./audit/current-production-integrity-review.json)
- [`audit/current-final-capability-attestation.json`](./audit/current-final-capability-attestation.json)

| 门 | 状态 | 当前边界 |
| --- | --- | --- |
| Public/autonomous、chart、runtime | `closed-portable` | 当前10.1.4证据、raw production-path与detached DAG限定范围；non-zero practice seek见独立行 |
| Ordinary Note/HUD Pixi scene | `closed-portable` | Reverse `OSR-E0001..E13323`、121条actual Pixi world records、parent/Y/mask/fallback反例、全部Note/HUD生命周期及完整production WebView2 combined scene限定范围 |
| Ordinary particle visible composition | `closed-portable` | 17-root actual Pixi world/UV/blend/viewport、stage-order/UV-row反例、production particle decoder、跨stage ordering及dispose归零限定范围 |
| Audio、Particle semantic simulation | `closed-portable` | semantic/PCM/WebAudio graph及deterministic particle command/simulation限定范围；不含当前可见合成、物理输出/framebuffer |
| HAB current-external-complete | `closed-portable` | 11项pinned资源、179 rows、全Note/mesh/line/field/mask/lane-change及Pixi consumer；差异仅文档披露 |
| HAB original parity | `open-evidence-required` | UnityFS、natural owner/setter、Root_effect原clip及original physical frame不作等价声明 |
| Non-zero initial seek | `closed-portable` | 10.1.4 IPS-P01–P05：fresh zero-state bounded Float32 whole-engine pre-roll，重建期物理输出抑制，完成后一次BGM/final visual publication |
| Button 07 | `closed-original-unreachable` | 10.1.4合法BMS不可生成值7，scene只拥有0..6；不发明第八lane，注入值7按内部不变量拒绝 |
| WebView2 decode/glyph/raster | `closed-portable` | 真实WebView2 151.0.4129.78执行production `BrowserPixiTextureDecoder`的PNG/FontFace/glyph/Pixi WebGL raster；跨runtime/GPU exact不泛化 |
| Fixed-device physical exact | `open-objective-environment-blocked` | 锁定panel只有60 Hz、Android candidate缺失且stage-9=false、无校准光学/声学比较路径；四项客观阻断，不新增exact claim |
| Character/card/deck skill、Fever、multiplayer | `excluded` | public和production依赖图不得引入 |
| Main-program integration | `unauthorized-stage-9` | 不修改App/window/editor/Tauri/mobile入口 |

状态词：`closed-portable`只表示当前证据和raw验收明确覆盖的portable合同；`closed-original-unreachable`表示原作合法输入不可达而非待补功能；`open-objective-environment-blocked`保持exact不声明且记录可复现环境阻断；`degraded-explicit`不等于原作parity；`open-device-exact`与`reopened-audit`仅保留为历史审计词，其余开放和排除状态按表中边界解释。

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

- `actual-pixi-command-scene-routing`：testing-only observer独立连乘实际Pixi父链并观察local/world matrix、bounds、mask、texture、geometry及combined stage order；parent、Unity Y、mask-space、stage-order、particle UV-row和fallback六类故意反例均会失败。
- `webview2-decode-raster`：真实production `BrowserPixiTextureDecoder`与`BrowserPixiParticleTextureDecoder`在WebView2 151.0.4129.78完整场景执行`createImageBitmap`、`FontFace` glyph及Pixi WebGL raster；3 fresh digest只限定当前portable环境，不泛化跨browser/GPU或原Unity exact。
- `framebuffer/device-exact`：锁定设备调查已形成四项客观环境阻断，exact继续不声明。

Synthetic decoder、资源hash或typed command仍不能单独升级为真实WebView2 raster证明。

当前Score HUD候选实现已修正NineSlice轴序、已知depth、master派生marker校验和SS持久owner。Reverse `score-hud-panel-clip-portable-10-1-4@1abae506`又从当前10.1.4 APK直接确认Score UIPanel path 1451、Background_Cover anchor target、四anchor、SoftClip range/softness/offset及父级坐标，并排除AllPerfect path 1450身份混淆。`indicatorLocalX`现驱动挂在ScoreGaugeSS animation layer上的持久Pixi mask consumer；20行阈值±1/scoreMax/over-max raw矩阵由独立verifier重算。Score panel子门已随普通command/scene portable范围闭合；真实WebView2 decode/glyph/raster由另一独立门关闭，该Score结论本身不升级browser、GPU framebuffer或fixed-device exact。

## Evidence workflow

流程见[`evidence-workflow.md`](./evidence-workflow.md)。只消费已verify、commit、push的Reverse证据。10.1.3或其他来源必须先建立逐claim等价证明、适用域和反例检查。旧调查包可提供待重新核验的原始事实，但其`closed`、`productionAuthorization`或总体closure字段不是本轮授权。

当前依据为Reverse普通渲染静态/HUD提交`6908ddfa8a45721f981e2356a9dde84970313bae`、candidate逐claim账本`3f9ef7880654fc80ce45b23e4c20de326001afb9`及Garupa candidate `5a25161cbb0fc179c877c4153dd9efeab17edcd2`。R12只执行有界gate/summary transition；R13从已push release commit运行detached DAG，R14才登记最终attestation。HAB original、fixed-device exact、excluded和stage-9边界不因本轮复审升级。

最终去重入口为`npm.cmd run simulator:test:total-revalidation`。它按唯一leaf DAG执行isolated tsc、chart/clock/input/state、render raw+independent verifier、audio、particle、host/runtime/public、C07证据消费、generic browser及完整ordinary production WebView2双decoder；不运行Vite/Tauri，也不声称原作framebuffer或物理输出等价。

`mainProgramIntegrationAuthorization=false`。
