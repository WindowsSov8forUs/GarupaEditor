# GarupaEditor Simulator

`src/simulator`已完成普通单人渲染端到端总复审，并在该引擎基础上接入GarupaEditor产品计分合同CS-V1。判定、Combo状态、Life、HUD资源/布局/动画继续消费Reverse证据；10M归一化Score、固定Rank和内部ruleset由[`scoring-contract.md`](./scoring-contract.md)授权，不宣称是原作计分复原。

## 当前全局门

Reverse schema-4账本冻结的是旧release `2b758eb...`的104个production文件，不能覆盖后续产品Score或四模式改动。当前candidate审计采用“Reverse基线 + exact-hash CS-V1 product delta + Live/Rehearsal delta”，见`audit/current-product-scoring-delta.json`与`audit/current-live-rehearsal-delta.json`。四模式candidate `8398a5a`已push，27叶detached发布验收尚待执行；上一pushed-detached release `b4a3432`通过26叶（1,853,406ms）；CS-V1 ordinary WebView2使用production双decoder、单一particle→Note/HUD combined root、656-batch全谱及3 fresh×17 captures，锁定环境digest为`ff6e7584988dc0ad32074858e52beed608ed19b6623c6558402dcef84bdf396c`，不是原作framebuffer oracle。

总重验aggregate gate已在R12有界关闭；`CAP-RENDER-ORDINARY-01`与`CAP-RENDER-PARTICLE-COMPOSITION-01`恢复`closed-portable`。这不移除request/resource/backend/owner各自的失败关闭，不升级Unity framebuffer、fixed-device exact、HAB original、excluded玩法或Stage 9。

机器账本：

- [`audit/current-capability-matrix.json`](./audit/current-capability-matrix.json)
- [`audit/current-claim-ledger.json`](./audit/current-claim-ledger.json)
- [`audit/current-production-integrity-review.json`](./audit/current-production-integrity-review.json)
- [`audit/current-final-capability-attestation.json`](./audit/current-final-capability-attestation.json)

| 门 | 状态 | 当前边界 |
| --- | --- | --- |
| Public/autonomous、chart、runtime | `closed-portable` | 当前10.1.4证据、raw production-path与detached DAG限定范围；四模式合同见独立开放行 |
| Ordinary Note/HUD Pixi scene | `closed-portable` | Reverse `OSR-E0001..E13323`、121条actual Pixi world records、parent/Y/mask/fallback反例、全部Note/HUD生命周期及完整production WebView2 combined scene限定范围 |
| Ordinary particle visible composition | `closed-portable` | 17-root actual Pixi world/UV/blend/viewport、stage-order/UV-row反例、production particle decoder、跨stage ordering及dispose归零限定范围 |
| Audio、Particle semantic simulation | `closed-portable` | semantic/PCM/WebAudio graph及deterministic particle command/simulation限定范围；不含当前可见合成、物理输出/framebuffer |
| HAB current-external-complete | `closed-portable` | 11项pinned资源、179 rows、全Note/mesh/line/field/mask/lane-change及Pixi consumer；差异仅文档披露 |
| HAB original parity | `open-evidence-required` | UnityFS、natural owner/setter、Root_effect原clip及original physical frame不作等价声明 |
| Live/Rehearsal × Manual/Auto | `closed-portable` | Reverse `6c0dfb76`四模式identity与Life-zero矩阵；Rehearsal Auto保持Practice+Demo而非Auto Live，CS-V1仍为产品计分合同 |
| Rehearsal MoveTime/control scene | `closed-portable` | simulator-owned固定±5 opaque command、Float32 whole-engine恢复、后退timeline revision、目标BGM发布及真实current atlas Pixi controls限定范围；不声明Prefab/fixed-device exact |
| Non-zero initial seek | `excluded` | IPS-P01–P05只保留历史产品扩展记录；本专项冻结删除`startMilliseconds`及deferred publication，不再作为最终能力 |
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

安装中立platform后，证据覆盖的四种`sessionMode × inputMode` request可获得仅含`closed` Promise的成功receipt；未安装时失败为`simulator.entry.platform-not-installed`。合同不接受member/card/deck、角色效果、Fever或多人数据，也不暴露engine、step、backend、provider、scene、replay factory或dispose。Public gameplay只提供Life；Score master、level、totalParameter、Auto coefficient、ruleset、评分单位数和quota均由exact-shape边界拒绝。模拟器从chart-owned判定图内部生成评分计划。

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

Score HUD继续保留Reverse确认的NineSlice轴序、depth、UIPanel clip、Bitmap数字、marker几何和SS持久owner；业务输入改为内部CS-V1 `ruleSetId + totalScoringUnitCount`。Gauge固定C/B/A/S/SS阈值并以`10,000,000+N`为最大值，typed validator独立复算Rank、ratio、marker和SS条件。该产品Score语义不升级原作计分等价、browser/GPU framebuffer或fixed-device exact。

## Evidence workflow

流程见[`evidence-workflow.md`](./evidence-workflow.md)。只消费已verify、commit、push的Reverse证据。10.1.3或其他来源必须先建立逐claim等价证明、适用域和反例检查。旧调查包可提供待重新核验的原始事实，但其`closed`、`productionAuthorization`或总体closure字段不是本轮授权。

Reverse普通渲染静态/HUD提交`6908ddfa`和最终账本`b5fb3dca`继续约束未改变的原作表现；其Garupa target `2b758eb...`仅作为历史基线。CS-V1变更由tracked产品规范、逐文件SHA-256 delta、独立公式测试、full-chart Auto和当前WebView2观察约束。HAB original、fixed-device exact、excluded和Stage 9边界不因产品Score升级。

日常开发默认运行`npm.cmd run simulator:test`（或`simulator:test:quick`）：测试树只编译一次，约20秒覆盖unit/contract/static、chart parsing、clock与Auto，不执行耗时full-chart actual-Pixi/particle/HAB或WebView2，因此不能作为release证据。发布级入口仍为`npm.cmd run simulator:test:total-revalidation`，保留完整26叶及3-fresh ordinary WebView2双decoder；重复运行复用ignored Cargo target，`simulator:test:total-revalidation:clean`可强制冷编译。完整说明见[`testing/README.md`](./testing/README.md)。两级均不运行Vite/Tauri，也不声称原作framebuffer或物理输出等价。

`mainProgramIntegrationAuthorization=false`。
